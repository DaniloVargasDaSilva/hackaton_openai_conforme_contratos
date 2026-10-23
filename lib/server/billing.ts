// Dan: grava os dois lados da fatura (NF em XML e entregas em CSV) na mesma linha por item.
// Recebe o cliente do banco por parâmetro para rodar dentro de uma transação (upload e reset da demo).
import type { Prisma } from "@prisma/client";
import type { NfDocument, UploadError } from "@/lib/contracts-3vias";
import { parseDeliveriesCsv } from "./csv";
import { toItem } from "./mappers";
import { parseNfXml } from "./nf";

type Db = Prisma.TransactionClient;

async function loadItems(db: Db, contractId: string) {
  const rows = await db.contractItem.findMany({ where: { contractId }, orderBy: { position: "asc" } });
  return rows.map((row) => ({ item: toItem(row), position: row.position }));
}

/** Texto único da tela: junta o lado faturado e o lado entregue. */
const joinSources = (invoice: string | null, delivery: string | null) =>
  [invoice, delivery].filter(Boolean).join(" + ") || "—";

/** Garante a linha do item (uma por contrato e item) e devolve o id. */
async function ensureLine(db: Db, contractId: string, itemId: string, position: number) {
  const found = await db.invoiceLine.findFirst({ where: { contractId, itemId } });
  if (found) return found;
  return db.invoiceLine.create({
    data: { contractId, itemId, source: "—", row: position + 1 },
  });
}

const BILLED_RESET = {
  billedQty: null,
  billedUnitPrice: null,
  creditApplied: null,
  penaltyApplied: null,
  invoiceSource: null,
} as const;

const DELIVERED_RESET = {
  deliveredAt: null,
  measuredQty: null,
  activeUsers: null,
  measuredPct: null,
  deliverySource: null,
} as const;

/**
 * Lê o XML da NF e grava o lado faturado. Reenviar a NF substitui o lado faturado,
 * sem tocar no lado entregue.
 */
export async function applyNf(
  db: Db,
  contractId: string,
  xml: string,
): Promise<{ nf: NfDocument | null; errors: UploadError[] }> {
  const items = await loadItems(db, contractId);
  const parsed = parseNfXml(xml, items.map((i) => i.item));

  // Sem NF legível, nada muda no banco.
  if (!parsed.nf) return { nf: null, errors: parsed.errors };

  const positionOf = new Map(items.map((i) => [i.item.id, i.position]));

  await db.invoiceLine.updateMany({ where: { contractId }, data: BILLED_RESET });
  await refreshSources(db, contractId);

  for (const b of parsed.billed) {
    const line = await ensureLine(db, contractId, b.itemId, positionOf.get(b.itemId) ?? 0);
    await db.invoiceLine.update({
      where: { id: line.id },
      data: {
        billedQty: b.billedQty,
        billedUnitPrice: b.billedUnitPrice,
        invoiceSource: b.source,
        source: joinSources(b.source, line.deliverySource),
      },
    });
  }

  for (const adj of parsed.adjustments) {
    const line = await ensureLine(db, contractId, adj.itemId, positionOf.get(adj.itemId) ?? 0);
    // Item sem linha de produto na NF (ex.: SLA) herda a origem dos descontos.
    const invoiceSource = line.invoiceSource ?? adj.source;
    await db.invoiceLine.update({
      where: { id: line.id },
      data: {
        creditApplied: adj.creditApplied ?? undefined,
        penaltyApplied: adj.penaltyApplied ?? undefined,
        invoiceSource,
        source: joinSources(invoiceSource, line.deliverySource),
      },
    });
  }

  await db.contract.update({ where: { id: contractId }, data: { nf: parsed.nf as unknown as Prisma.InputJsonValue } });

  // Erros de linha (produto desconhecido) voltam junto, e a NF segue valendo para o que foi reconhecido.
  return { nf: parsed.nf, errors: parsed.errors };
}

/**
 * Lê o CSV de entregas e grava o lado entregue. Reenviar o CSV substitui o lado entregue,
 * sem tocar no lado faturado.
 */
export async function applyDeliveries(
  db: Db,
  contractId: string,
  csv: string,
): Promise<{ errors: UploadError[] }> {
  const items = await loadItems(db, contractId);
  const { deliveries, errors } = parseDeliveriesCsv(csv, new Set(items.map((i) => i.item.id)));

  // Arquivo ilegível (cabeçalho ou vazio) não apaga o que já estava gravado.
  if (deliveries.length === 0 && errors.some((e) => e.row === null)) return { errors };

  const positionOf = new Map(items.map((i) => [i.item.id, i.position]));

  await db.invoiceLine.updateMany({ where: { contractId }, data: DELIVERED_RESET });
  await refreshSources(db, contractId);

  for (const d of deliveries) {
    const line = await ensureLine(db, contractId, d.itemId, positionOf.get(d.itemId) ?? 0);
    await db.invoiceLine.update({
      where: { id: line.id },
      data: {
        deliveredAt: d.deliveredAt,
        measuredQty: d.measuredQty,
        activeUsers: d.activeUsers,
        measuredPct: d.measuredPct,
        deliverySource: d.source,
        source: joinSources(line.invoiceSource, d.source),
      },
    });
  }

  return { errors };
}

/** Recalcula o texto único depois de limpar um dos lados. */
async function refreshSources(db: Db, contractId: string) {
  const lines = await db.invoiceLine.findMany({ where: { contractId } });
  for (const line of lines) {
    await db.invoiceLine.update({
      where: { id: line.id },
      data: { source: joinSources(line.invoiceSource, line.deliverySource) },
    });
  }
}
