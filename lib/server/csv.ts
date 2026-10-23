// Dan: parse e validação do CSV da fatura.
// Cabeçalho obrigatório (seção 8). Linha inválida vai para `errors` e não derruba o upload.
import type { InvoiceLine } from "@/lib/contracts";

export const INVOICE_CSV_HEADER = [
  "item_id",
  "fonte",
  "qtd_faturada",
  "preco_unitario_faturado",
  "data_entrega",
  "qtd_medida",
  "usuarios_ativos",
  "disponibilidade_pct",
  "credito_aplicado",
  "multa_aplicada",
] as const;

export const DELIVERIES_CSV_HEADER = [
  "item_id",
  "fonte",
  "data_entrega",
  "qtd_entregue",
  "usuarios_ativos",
  "disponibilidade_pct",
] as const;

/** `row` é o número da linha no arquivo (cabeçalho = 1); null quando o erro é do arquivo todo. */
export type CsvError = { row: number | null; message: string };

export type ParsedInvoiceLine = Omit<InvoiceLine, "id" | "contractId">;

export type ParsedDelivery = {
  itemId: string;
  source: string;
  deliveredAt: string | null;
  measuredQty: number | null;
  activeUsers: number | null;
  measuredPct: number | null;
};

/** Quebra o texto em linhas de campos, respeitando aspas (RFC 4180 simplificado). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Linhas totalmente vazias (ex.: quebra de linha no fim do arquivo) não são dados.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function toNumber(raw: string | undefined): number | null | "invalid" {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : "invalid";
}

function toDate(raw: string | undefined): string | null | "invalid" {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "invalid";
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? "invalid" : value;
}

/**
 * Valida o CSV contra os itens do contrato.
 * `row` no erro é o número da linha no arquivo (cabeçalho = 1).
 */
export function parseInvoiceCsv(text: string, validItemIds: Set<string>) {
  const rows = parseCsvRows(text);
  const errors: CsvError[] = [];
  const lines: ParsedInvoiceLine[] = [];

  if (rows.length === 0) {
    return { lines, errors: [{ row: 1, message: "CSV vazio" }] };
  }

  const header = rows[0].map((h) => h.trim());
  const missing = INVOICE_CSV_HEADER.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    return { lines, errors: [{ row: 1, message: `Cabeçalho sem as colunas: ${missing.join(", ")}` }] };
  }

  const at = (r: string[], col: (typeof INVOICE_CSV_HEADER)[number]) => r[header.indexOf(col)];

  rows.slice(1).forEach((r, index) => {
    const row = index + 2;
    const itemId = (at(r, "item_id") ?? "").trim();
    const source = (at(r, "fonte") ?? "").trim();

    if (!validItemIds.has(itemId)) {
      errors.push({ row, message: `item_id "${itemId}" não existe no contrato` });
      return;
    }

    const numbers = {
      billedQty: toNumber(at(r, "qtd_faturada")),
      billedUnitPrice: toNumber(at(r, "preco_unitario_faturado")),
      measuredQty: toNumber(at(r, "qtd_medida")),
      activeUsers: toNumber(at(r, "usuarios_ativos")),
      measuredPct: toNumber(at(r, "disponibilidade_pct")),
      creditApplied: toNumber(at(r, "credito_aplicado")),
      penaltyApplied: toNumber(at(r, "multa_aplicada")),
    };
    const deliveredAt = toDate(at(r, "data_entrega"));

    const badField = Object.entries(numbers).find(([, v]) => v === "invalid");
    if (badField) {
      errors.push({ row, message: `Campo numérico inválido: ${badField[0]}` });
      return;
    }
    if (deliveredAt === "invalid") {
      errors.push({ row, message: "data_entrega precisa estar em YYYY-MM-DD" });
      return;
    }

    lines.push({
      itemId,
      source: source || `linha ${row}`,
      deliveredAt,
      ...(numbers as {
        billedQty: number | null;
        billedUnitPrice: number | null;
        measuredQty: number | null;
        activeUsers: number | null;
        measuredPct: number | null;
        creditApplied: number | null;
        penaltyApplied: number | null;
      }),
    });
  });

  return { lines, errors };
}

/**
 * CSV de entregas (lado "entregue" da conferência em 3 vias).
 * Colunas: item_id, fonte, data_entrega, qtd_entregue, usuarios_ativos, disponibilidade_pct.
 */
export function parseDeliveriesCsv(text: string, validItemIds: Set<string>) {
  const rows = parseCsvRows(text);
  const errors: CsvError[] = [];
  const deliveries: ParsedDelivery[] = [];

  if (rows.length === 0) {
    return { deliveries, errors: [{ row: null, message: "CSV vazio" }] };
  }

  const header = rows[0].map((h) => h.trim());
  const missing = DELIVERIES_CSV_HEADER.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    return {
      deliveries,
      errors: [{ row: null, message: `Cabeçalho do CSV sem a coluna ${missing.join(", ")}.` }],
    };
  }

  const at = (r: string[], col: (typeof DELIVERIES_CSV_HEADER)[number]) => r[header.indexOf(col)];

  rows.slice(1).forEach((r, index) => {
    const row = index + 2;
    const itemId = (at(r, "item_id") ?? "").trim();

    if (!validItemIds.has(itemId)) {
      errors.push({ row, message: `item_id "${itemId}" não existe no contrato` });
      return;
    }

    const measuredQty = toNumber(at(r, "qtd_entregue"));
    const activeUsers = toNumber(at(r, "usuarios_ativos"));
    const measuredPct = toNumber(at(r, "disponibilidade_pct"));
    const deliveredAt = toDate(at(r, "data_entrega"));

    if (measuredQty === "invalid" || activeUsers === "invalid" || measuredPct === "invalid") {
      errors.push({ row, message: "Campo numérico inválido (qtd_entregue, usuarios_ativos ou disponibilidade_pct)" });
      return;
    }
    if (deliveredAt === "invalid") {
      errors.push({ row, message: "data_entrega precisa estar em YYYY-MM-DD" });
      return;
    }

    deliveries.push({
      itemId,
      source: (at(r, "fonte") ?? "").trim() || `linha ${row}`,
      deliveredAt,
      measuredQty,
      activeUsers,
      measuredPct,
    });
  });

  return { deliveries, errors };
}
