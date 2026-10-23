// Dan: regras de negócio que as rotas chamam. As rotas só leem a requisição e devolvem a resposta.
import { randomUUID } from "node:crypto";
import type {
  Clause as DbClause,
  Contract as DbContract,
  ContractItem as DbItem,
  InvoiceLine as DbLine,
  Occurrence as DbOccurrence,
  Review as DbReview,
} from "@prisma/client";
import type { z } from "zod";
import type {
  CheckResult,
  ContractDetail,
  ContractItem,
  ContractSummary,
  CreateContractBody as CreateContractBodySchema,
  InvoiceLine,
  InvoiceLinePatch,
  Occurrence,
  Opportunity,
  Report,
  ReviewBody as ReviewBodySchema,
} from "@/lib/contracts";

type CreateContractBody = z.infer<typeof CreateContractBodySchema>;
type ReviewBody = z.infer<typeof ReviewBodySchema>;
import { classifyAbc } from "./abc";
import { prisma } from "./db";
import { ApiError } from "./http";
import { extractItems, writeReport, isAiEnabled } from "./ai";
import { parseInvoiceCsv } from "./csv";
import { conferir, type UsageFactInput } from "./rules";

/* ---------- mapeamento banco → contrato da API ---------- */

function toLine(row: DbLine): InvoiceLine {
  return {
    id: row.id,
    contractId: row.contractId,
    itemId: row.itemId,
    source: row.source,
    billedQty: row.billedQty,
    billedUnitPrice: row.billedUnitPrice,
    deliveredAt: row.deliveredAt,
    measuredQty: row.measuredQty,
    activeUsers: row.activeUsers,
    measuredPct: row.measuredPct,
    creditApplied: row.creditApplied,
    penaltyApplied: row.penaltyApplied,
  };
}

function toItem(row: DbItem): ContractItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as ContractItem["kind"],
    unit: row.unit,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    dueDate: row.dueDate,
    penaltyPerDayPct: row.penaltyPerDayPct,
    penaltyCapPct: row.penaltyCapPct,
    franchiseQty: row.franchiseQty,
    overageUnitPrice: row.overageUnitPrice,
    slaMinPct: row.slaMinPct,
    slaCreditPct: row.slaCreditPct,
    slaBaseItemIds: row.slaBaseItemIds,
    clauseRefs: row.clauseRefs,
    quote: row.quote,
    quoteVerified: row.quoteVerified,
  };
}

function toOccurrence(row: DbOccurrence & { reviews: DbReview[] }): Occurrence {
  const reviews = [...row.reviews]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({
      id: r.id,
      status: r.status as Occurrence["status"],
      comment: r.comment,
      reviewer: r.reviewer,
      createdAt: r.createdAt.toISOString(),
    }));

  return {
    id: row.id,
    key: row.key,
    contractId: row.contractId,
    itemId: row.itemId,
    itemName: row.itemName,
    type: row.type as Occurrence["type"],
    title: row.title,
    impact: row.impact,
    explanation: row.explanation,
    evidence: row.evidence as Occurrence["evidence"],
    // Status é o da revisão mais recente. Sem revisão, a ocorrência está pendente.
    status: reviews[0]?.status ?? "pendente",
    reviews,
  };
}

function toSummary(row: DbContract, abc: { abcClass: "A" | "B" | "C"; cumulativePct: number }): ContractSummary {
  return {
    id: row.id,
    number: row.number,
    supplier: row.supplier,
    object: row.object,
    annualValue: row.annualValue,
    renewsAt: row.renewsAt,
    hasDemoData: row.hasDemoData,
    abcClass: abc.abcClass,
    cumulativePct: abc.cumulativePct,
  };
}

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
    prisma.contractItem.findMany({ where: { contractId: id }, orderBy: { id: "asc" } }),
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
      data: items.map((item) => ({ ...item, contractId: id })),
    });
    await tx.contract.update({
      where: { id },
      data: { extractionSource: source, extractedAt: new Date() },
    });
  });

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
  });

  return { lines: await listInvoiceLines(contractId), errors };
}

export async function patchInvoiceLine(lineId: string, patch: InvoiceLinePatch): Promise<InvoiceLine> {
  const row = await prisma.invoiceLine.update({ where: { id: lineId }, data: patch });
  return toLine(row);
}

/* ---------- conferência ---------- */

async function loadConferenceInputs(contractId: string) {
  const [items, lines, usageFacts, clauses] = await Promise.all([
    prisma.contractItem.findMany({ where: { contractId } }),
    prisma.invoiceLine.findMany({ where: { contractId }, orderBy: { row: "asc" } }),
    prisma.usageFact.findMany({ where: { contractId } }),
    prisma.clause.findMany({ where: { contractId } }),
  ]);
  return {
    items: items.map(toItem),
    lines: lines.map(toLine),
    usageFacts: usageFacts as UsageFactInput[],
    clauses: clauses.map((c) => ({ ref: c.ref, text: c.text })),
  };
}

/** Lê o estado persistido: ocorrências ativas com revisões, mais as oportunidades da última conferência. */
async function buildCheckResult(contractId: string): Promise<CheckResult> {
  const contract = await findContract(contractId);
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
export async function runCheck(contractId: string): Promise<CheckResult> {
  await findContract(contractId);
  const inputs = await loadConferenceInputs(contractId);
  const { occurrences, opportunities } = conferir(inputs.items, inputs.lines, inputs.usageFacts, inputs.clauses);

  await prisma.$transaction(async (tx) => {
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
    await tx.contract.update({
      where: { id: contractId },
      data: { checkedAt: new Date(), opportunities: opportunities as unknown as object },
    });
  });

  return buildCheckResult(contractId);
}

/** GET /check: devolve a última conferência, ou roda uma se não houver. */
export async function getCheck(contractId: string): Promise<CheckResult> {
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
