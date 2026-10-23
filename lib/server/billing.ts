// Dan: grava os dois lados da fatura (NF em XML e entregas em CSV) na mesma linha por item.
// Recebe o cliente do banco por parâmetro para rodar dentro de uma transação (upload e reset da demo).
//
// Poucas consultas de propósito: com o banco em outra região cada ida e volta custa 100 ms ou mais,
// e uma transação com dezenas de consultas fica lenta. Por isso o estado das linhas é montado
// em memória e gravado com um DELETE + um INSERT de várias linhas.
import { randomUUID } from "node:crypto";
import type { ContractItem } from "@/lib/contracts";
import type { NfDocument, UploadError } from "@/lib/contracts-3vias";
import { parseDeliveriesCsv } from "./csv";
import { insertMany, type Db } from "./db";
import { toItem, type DbItem, type DbLine } from "./mappers";
import { analyzeNf, parseNfXml, type ParsedNf } from "./nf";

/** Uma linha da fatura com os dois lados. null = o arquivo daquele lado ainda não trouxe o dado. */
type LineState = {
  itemId: string;
  billedQty: number | null;
  billedUnitPrice: number | null;
  creditApplied: number | null;
  penaltyApplied: number | null;
  invoiceSource: string | null;
  deliveredAt: string | null;
  measuredQty: number | null;
  activeUsers: number | null;
  measuredPct: number | null;
  deliverySource: string | null;
};

const emptyLine = (itemId: string): LineState => ({
  itemId,
  billedQty: null,
  billedUnitPrice: null,
  creditApplied: null,
  penaltyApplied: null,
  invoiceSource: null,
  deliveredAt: null,
  measuredQty: null,
  activeUsers: null,
  measuredPct: null,
  deliverySource: null,
});

const clearBilled = (l: LineState): LineState => ({
  ...l,
  billedQty: null,
  billedUnitPrice: null,
  creditApplied: null,
  penaltyApplied: null,
  invoiceSource: null,
});

const clearDelivered = (l: LineState): LineState => ({
  ...l,
  deliveredAt: null,
  measuredQty: null,
  activeUsers: null,
  measuredPct: null,
  deliverySource: null,
});

/** Os dados mudaram: a última conferência não vale mais, e o próximo GET /check reconfere. */
async function invalidateCheck(db: Db, contractId: string) {
  await db.query(`UPDATE "Contract" SET "checkedAt" = NULL WHERE id = $1`, [contractId]);
}

/** Sem itens não há com o que casar a NF e as entregas: um aviso só, em vez de um erro por linha. */
const NO_ITEMS_MESSAGE =
  "Este contrato ainda não tem itens. Na aba Contrato, use \"Extrair com IA\" para ler os itens do contrato e depois envie a NF e as entregas.";

/** Texto único da tela: junta o lado faturado e o lado entregue. */
const joinSources = (invoice: string | null, delivery: string | null) =>
  [invoice, delivery].filter(Boolean).join(" + ") || "—";

async function loadItems(db: Db, contractId: string) {
  const rows = await db.query<DbItem>(`SELECT * FROM "ContractItem" WHERE "contractId" = $1 ORDER BY "position"`, [contractId]);
  return rows.map((row) => ({ item: toItem(row), position: row.position }));
}

/** Linhas que já existem, por item. Se houver duas do mesmo item (CSV antigo), vale a primeira. */
async function loadStates(db: Db, contractId: string) {
  const rows = await db.query<DbLine>(`SELECT * FROM "InvoiceLine" WHERE "contractId" = $1 ORDER BY "row"`, [contractId]);
  const states = new Map<string, LineState>();
  for (const r of rows) {
    if (states.has(r.itemId)) continue;
    states.set(r.itemId, {
      itemId: r.itemId,
      billedQty: r.billedQty,
      billedUnitPrice: r.billedUnitPrice,
      creditApplied: r.creditApplied,
      penaltyApplied: r.penaltyApplied,
      invoiceSource: r.invoiceSource,
      deliveredAt: r.deliveredAt,
      measuredQty: r.measuredQty,
      activeUsers: r.activeUsers,
      measuredPct: r.measuredPct,
      deliverySource: r.deliverySource,
    });
  }
  return states;
}

/** Substitui as linhas do contrato pelo estado montado, na ordem dos itens do contrato. */
async function saveStates(db: Db, contractId: string, states: Map<string, LineState>, positionOf: Map<string, number>) {
  const ordered = [...states.values()].sort((a, b) => (positionOf.get(a.itemId) ?? 0) - (positionOf.get(b.itemId) ?? 0));
  await db.query(`DELETE FROM "InvoiceLine" WHERE "contractId" = $1`, [contractId]);
  await insertMany(
    db,
    "InvoiceLine",
    ["id", "contractId", "itemId", "source", "invoiceSource", "deliverySource", "row", "billedQty", "billedUnitPrice", "deliveredAt", "measuredQty", "activeUsers", "measuredPct", "creditApplied", "penaltyApplied"],
    ordered.map((l) => [
      randomUUID(),
      contractId,
      l.itemId,
      joinSources(l.invoiceSource, l.deliverySource),
      l.invoiceSource,
      l.deliverySource,
      (positionOf.get(l.itemId) ?? 0) + 1,
      l.billedQty,
      l.billedUnitPrice,
      l.deliveredAt,
      l.measuredQty,
      l.activeUsers,
      l.measuredPct,
      l.creditApplied,
      l.penaltyApplied,
    ]),
  );
}

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
  if (items.length === 0) return { nf: null, errors: [{ row: null, message: NO_ITEMS_MESSAGE }] };
  return persistNf(db, contractId, items, parseNfXml(xml, items.map((i) => i.item)));
}

/** Grava uma NF já lida (por exemplo, de uma foto) do mesmo jeito que o XML. */
export async function applyNfDocument(
  db: Db,
  contractId: string,
  nf: NfDocument,
): Promise<{ nf: NfDocument | null; errors: UploadError[] }> {
  const items = await loadItems(db, contractId);
  if (items.length === 0) return { nf: null, errors: [{ row: null, message: NO_ITEMS_MESSAGE }] };
  return persistNf(db, contractId, items, analyzeNf(nf, items.map((i) => i.item)));
}

async function persistNf(
  db: Db,
  contractId: string,
  items: { item: ContractItem; position: number }[],
  parsed: ParsedNf,
): Promise<{ nf: NfDocument | null; errors: UploadError[] }> {
  // Sem NF legível, nada muda no banco.
  if (!parsed.nf) return { nf: null, errors: parsed.errors };

  const positionOf = new Map(items.map((i) => [i.item.id, i.position]));
  const states = new Map<string, LineState>();
  for (const [itemId, line] of await loadStates(db, contractId)) states.set(itemId, clearBilled(line));

  const lineFor = (itemId: string) => {
    let line = states.get(itemId);
    if (!line) {
      line = emptyLine(itemId);
      states.set(itemId, line);
    }
    return line;
  };

  for (const b of parsed.billed) {
    const line = lineFor(b.itemId);
    line.billedQty = b.billedQty;
    line.billedUnitPrice = b.billedUnitPrice;
    line.invoiceSource = b.source;
  }

  for (const adj of parsed.adjustments) {
    const line = lineFor(adj.itemId);
    if (adj.creditApplied !== undefined) line.creditApplied = adj.creditApplied;
    if (adj.penaltyApplied !== undefined) line.penaltyApplied = adj.penaltyApplied;
    // Item sem linha de produto na NF (ex.: SLA) herda a origem dos descontos.
    line.invoiceSource = line.invoiceSource ?? adj.source;
  }

  await saveStates(db, contractId, states, positionOf);
  await db.query(`UPDATE "Contract" SET nf = $2::jsonb, "checkedAt" = NULL WHERE id = $1`, [contractId, JSON.stringify(parsed.nf)]);

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
  if (items.length === 0) return { errors: [{ row: null, message: NO_ITEMS_MESSAGE }] };
  const { deliveries, errors } = parseDeliveriesCsv(csv, items.map((i) => i.item));

  // Arquivo ilegível (cabeçalho ou vazio) não apaga o que já estava gravado.
  if (deliveries.length === 0 && errors.some((e) => e.row === null)) return { errors };

  const positionOf = new Map(items.map((i) => [i.item.id, i.position]));
  const states = new Map<string, LineState>();
  for (const [itemId, line] of await loadStates(db, contractId)) states.set(itemId, clearDelivered(line));

  for (const d of deliveries) {
    const line = states.get(d.itemId) ?? emptyLine(d.itemId);
    line.deliveredAt = d.deliveredAt;
    line.measuredQty = d.measuredQty;
    line.activeUsers = d.activeUsers;
    line.measuredPct = d.measuredPct;
    line.deliverySource = d.source;
    states.set(d.itemId, line);
  }

  await saveStates(db, contractId, states, positionOf);
  await invalidateCheck(db, contractId);
  return { errors };
}
