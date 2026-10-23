// Dan: regras de negócio que as rotas chamam. As rotas só leem a requisição e devolvem a resposta.
import { randomUUID } from "node:crypto";
import type { Clause as DbClause, Contract as DbContract } from "@prisma/client";
import type { z } from "zod";
import type {
  ContractDetail,
  ContractSummary,
  CreateContractBody as CreateContractBodySchema,
  InvoiceLine,
  InvoiceLinePatch,
  Report,
  ReviewBody as ReviewBodySchema,
} from "@/lib/contracts";
import type { CheckResult3, NfDocument, Occurrence3, UploadError } from "@/lib/contracts-3vias";
import { classifyAbc } from "./abc";
import { applyDeliveries, applyNf, applyNfDocument } from "./billing";
import { prisma } from "./db";
import { ApiError } from "./http";
import { extractItems, isAiEnabled, NfPhotoError, readNfFromImage, writeReport } from "./ai";
import { parseInvoiceCsv } from "./csv";
import { toConferenceLine, toItem, toLine, toOccurrence, toSummary } from "./mappers";
import { conferir, type UsageFactInput } from "./rules";

/** Banco em outra região: cada consulta custa uma ida e volta de rede, então o padrão de 5 s do Prisma não basta. */
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

type CreateContractBody = z.infer<typeof CreateContractBodySchema>;
type ReviewBody = z.infer<typeof ReviewBodySchema>;
type Opportunity = CheckResult3["opportunities"][number];
type Occurrence = Occurrence3;

/* ---------- carteira ---------- */

export async function listContracts(): Promise<ContractSummary[]> {
  const rows = await prisma.contract.findMany({ orderBy: { annualValue: "desc" } });
  const abc = classifyAbc(rows);
  return rows.map((row) => toSummary(row, abc.get(row.id)!));
}

/** Carrega um contrato com o resumo (com ABC calculada sobre a carteira inteira). */
async function findContract(id: string) {
  const row = await prisma.contract.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, "NOT_FOUND", `Contrato ${id} não encontrado`);
  return row;
}

export async function getContractDetail(id: string): Promise<ContractDetail> {
  const [contract, all, clauses, items] = await Promise.all([
    findContract(id),
    prisma.contract.findMany({ select: { id: true, annualValue: true } }),
    prisma.clause.findMany({ where: { contractId: id }, orderBy: { ref: "asc" } }),
    prisma.contractItem.findMany({ where: { contractId: id }, orderBy: { position: "asc" } }),
  ]);
  const abc = classifyAbc(all).get(id)!;

  return {
    contract: { ...toSummary(contract, abc), text: contract.text ?? "" },
    clauses: clauses.map((c: DbClause) => ({ ref: c.ref, text: c.text })),
    items: items.map(toItem),
    extraction: {
      // Contrato sem extração ainda entra como fallback, sem itens.
      source: (contract.extractionSource as "ai" | "fallback" | "seed" | null) ?? "fallback",
      at: contract.extractedAt?.toISOString() ?? null,
    },
  };
}

export async function createContract(body: CreateContractBody): Promise<ContractDetail> {
  const id = `up-${randomUUID().slice(0, 8)}`;
  await prisma.contract.create({
    data: {
      id,
      number: body.number,
      supplier: body.supplier,
      object: body.object,
      annualValue: body.annualValue,
      renewsAt: body.renewsAt,
      text: body.text,
      hasDemoData: false,
    },
  });
  return getContractDetail(id);
}

/* ---------- extração ---------- */

export async function extractContract(id: string): Promise<ContractDetail> {
  const contract = await findContract(id);
  if (!contract.text) {
    throw new ApiError(422, "SEM_TEXTO", "O contrato não tem texto para extrair");
  }

  const { items, source } = await extractItems(id, contract.text);

  await prisma.$transaction(async (tx) => {
    await tx.contractItem.deleteMany({ where: { contractId: id } });
    await tx.contractItem.createMany({
      data: items.map((item, position) => ({ ...item, contractId: id, position })),
    });
    await tx.contract.update({
      where: { id },
      data: { extractionSource: source, extractedAt: new Date() },
    });
  }, TX_OPTIONS);

  return getContractDetail(id);
}

/* ---------- fatura e entregas ---------- */

export async function listInvoiceLines(contractId: string): Promise<InvoiceLine[]> {
  await findContract(contractId);
  const rows = await prisma.invoiceLine.findMany({
    where: { contractId },
    orderBy: { row: "asc" },
  });
  return rows.map(toLine);
}

export async function uploadInvoiceCsv(contractId: string, csv: string) {
  await findContract(contractId);
  const items = await prisma.contractItem.findMany({
    where: { contractId },
    select: { id: true },
  });
  const { lines, errors } = parseInvoiceCsv(csv, new Set(items.map((i) => i.id)));

  await prisma.$transaction(async (tx) => {
    await tx.invoiceLine.deleteMany({ where: { contractId } });
    await tx.invoiceLine.createMany({
      data: lines.map((line, index) => ({
        ...line,
        contractId,
        row: index + 2,
      })),
    });
  }, TX_OPTIONS);

  return { lines: await listInvoiceLines(contractId), errors };
}

/** NF lida do XML, para o DANFE. null enquanto nenhuma NF foi enviada. */
export async function getNf(contractId: string): Promise<{ nf: NfDocument | null }> {
  const contract = await findContract(contractId);
  return { nf: (contract.nf as NfDocument | null) ?? null };
}

/** POST /nf: grava o lado faturado a partir do XML. Reenviar substitui só o lado faturado. */
export async function uploadNf(
  contractId: string,
  xml: string,
): Promise<{ nf: NfDocument | null; lines: InvoiceLine[]; errors: UploadError[] }> {
  await findContract(contractId);
  const { nf, errors } = await prisma.$transaction((tx) => applyNf(tx, contractId, xml), TX_OPTIONS);
  return { nf, lines: await listInvoiceLines(contractId), errors };
}

/**
 * POST /nf-photo: a IA lê a foto da NF e o resultado é gravado como se fosse o XML.
 * A chamada à IA fica fora da transação, para não segurar uma conexão do banco esperando a OpenAI.
 */
export async function uploadNfPhoto(
  contractId: string,
  imageBase64: string,
  mimeType: string,
): Promise<{ nf: NfDocument | null; lines: InvoiceLine[]; errors: UploadError[] }> {
  await findContract(contractId);
  const itemRows = await prisma.contractItem.findMany({ where: { contractId }, orderBy: { position: "asc" } });

  let nf: NfDocument;
  try {
    nf = await readNfFromImage(imageBase64, mimeType, itemRows.map(toItem));
  } catch (error) {
    if (error instanceof NfPhotoError) {
      return { nf: null, lines: await listInvoiceLines(contractId), errors: [{ row: null, message: error.message }] };
    }
    throw error;
  }

  const saved = await prisma.$transaction((tx) => applyNfDocument(tx, contractId, nf), TX_OPTIONS);
  return { nf: saved.nf, lines: await listInvoiceLines(contractId), errors: saved.errors };
}

/** POST /deliveries: grava o lado entregue a partir do CSV. Reenviar substitui só o lado entregue. */
export async function uploadDeliveries(
  contractId: string,
  csv: string,
): Promise<{ lines: InvoiceLine[]; errors: UploadError[] }> {
  await findContract(contractId);
  const { errors } = await prisma.$transaction((tx) => applyDeliveries(tx, contractId, csv), TX_OPTIONS);
  return { lines: await listInvoiceLines(contractId), errors };
}

export async function patchInvoiceLine(lineId: string, patch: InvoiceLinePatch): Promise<InvoiceLine> {
  const row = await prisma.invoiceLine.update({ where: { id: lineId }, data: patch });
  return toLine(row);
}

/* ---------- conferência ---------- */

async function loadConferenceInputs(contractId: string) {
  const [items, lines, usageFacts, clauses] = await Promise.all([
    prisma.contractItem.findMany({ where: { contractId }, orderBy: { position: "asc" } }),
    prisma.invoiceLine.findMany({ where: { contractId }, orderBy: { row: "asc" } }),
    prisma.usageFact.findMany({ where: { contractId } }),
    prisma.clause.findMany({ where: { contractId } }),
  ]);
  return {
    items: items.map(toItem),
    lines: lines.map(toConferenceLine),
    usageFacts: usageFacts as UsageFactInput[],
    clauses: clauses.map((c) => ({ ref: c.ref, text: c.text })),
  };
}

/** Lê o estado persistido: ocorrências ativas com revisões, mais as oportunidades da última conferência. */
async function buildCheckResult(contractId: string, known?: DbContract): Promise<CheckResult3> {
  const contract = known ?? (await findContract(contractId));
  const rows = await prisma.occurrence.findMany({
    where: { contractId, active: true },
    include: { reviews: true },
    orderBy: { impact: "desc" },
  });
  const occurrences = rows.map(toOccurrence);

  const atStake = occurrences.reduce((sum, o) => sum + o.impact, 0);
  const confirmed = occurrences
    .filter((o) => o.status === "confirmada")
    .reduce((sum, o) => sum + o.impact, 0);
  const pendingCount = occurrences.filter((o) => o.status === "pendente").length;

  return {
    contractId,
    checkedAt: (contract.checkedAt ?? new Date()).toISOString(),
    occurrences,
    opportunities: (contract.opportunities as Opportunity[] | null) ?? [],
    totals: { atStake: round2(atStake), confirmed: round2(confirmed), pendingCount },
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Reconfere o contrato. Recalcula as ocorrências e mantém as revisões pela `key`.
 * Ocorrência que sumiu fica inativa, e as revisões dela continuam no banco.
 */
export async function runCheck(contractId: string): Promise<CheckResult3> {
  // Existência do contrato e dados da conferência em paralelo: cada consulta é uma ida e volta de rede.
  const [, inputs] = await Promise.all([findContract(contractId), loadConferenceInputs(contractId)]);
  const { occurrences, opportunities } = conferir(inputs.items, inputs.lines, inputs.usageFacts, inputs.clauses);

  const updated = await prisma.$transaction(async (tx) => {
    for (const o of occurrences) {
      const data = {
        itemId: o.itemId,
        itemName: o.itemName,
        type: o.type,
        title: o.title,
        impact: o.impact,
        explanation: o.explanation,
        evidence: o.evidence,
        active: true,
      };
      await tx.occurrence.upsert({
        where: { contractId_key: { contractId, key: o.key } },
        create: { ...data, contractId, key: o.key },
        update: data,
      });
    }
    await tx.occurrence.updateMany({
      where: { contractId, key: { notIn: occurrences.map((o) => o.key) } },
      data: { active: false },
    });
    return tx.contract.update({
      where: { id: contractId },
      data: { checkedAt: new Date(), opportunities: opportunities as unknown as object },
    });
  }, TX_OPTIONS);

  return buildCheckResult(contractId, updated);
}

/** GET /check: devolve a última conferência, ou roda uma se não houver. */
export async function getCheck(contractId: string): Promise<CheckResult3> {
  const contract = await findContract(contractId);
  if (!contract.checkedAt) return runCheck(contractId);
  return buildCheckResult(contractId);
}

/* ---------- revisão ---------- */

export async function reviewOccurrence(occId: string, body: ReviewBody): Promise<Occurrence> {
  const occurrence = await prisma.occurrence.findUnique({ where: { id: occId } });
  if (!occurrence) throw new ApiError(404, "NOT_FOUND", "Ocorrência não encontrada");
  if (!occurrence.active) {
    throw new ApiError(409, "OCORRENCIA_INATIVA", "A ocorrência não existe mais na última conferência");
  }

  await prisma.review.create({
    data: {
      occurrenceId: occId,
      status: body.status,
      comment: body.comment,
      reviewer: body.reviewer,
    },
  });

  const row = await prisma.occurrence.findUniqueOrThrow({
    where: { id: occId },
    include: { reviews: true },
  });
  return toOccurrence(row);
}

/* ---------- relatório ---------- */

export async function generateReport(contractId: string): Promise<Report> {
  const contract = await findContract(contractId);
  const rows = await prisma.occurrence.findMany({
    where: { contractId, active: true },
    include: { reviews: true },
    orderBy: { impact: "desc" },
  });
  const confirmed = rows.map(toOccurrence).filter((o) => o.status === "confirmada");

  const { text, source } = await writeReport(contract.number, contract.supplier, confirmed);
  return { text, source, generatedAt: new Date().toISOString() };
}

/* ---------- saúde ---------- */

export async function health() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  return { ok: true as const, db, ai: isAiEnabled() };
}
