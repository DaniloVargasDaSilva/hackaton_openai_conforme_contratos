// Dan: leitura do XML da NF (lado "faturado" da conferência em 3 vias).
// Devolve o documento para o DANFE da tela e o que foi faturado por item do contrato.
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { resolveItemId } from "./match";
import type { ContractItem } from "@/lib/contracts";
import type { NfDocument, NfItem, UploadError } from "@/lib/contracts-3vias";

export type BilledItem = {
  itemId: string;
  billedQty: number;
  billedUnitPrice: number | null;
  /** "NF 8812 · linha 1" ou "NF 8812 · linhas 7 e 8" */
  source: string;
};

export type ParsedNf = {
  nf: NfDocument | null;
  billed: BilledItem[];
  /** Crédito de SLA e multa descontados na NF, por item (somente onde o contrato prevê). */
  adjustments: { itemId: string; creditApplied?: number; penaltyApplied?: number; source: string }[];
  errors: UploadError[];
};

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === "det" || name === "desc",
});

const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const num = (v: unknown): number => {
  const n = Number(str(v));
  return Number.isFinite(n) ? n : NaN;
};
const asNode = (v: unknown): Node => (v && typeof v === "object" ? (v as Node) : {});

/** Procura a primeira tag com esse nome em qualquer profundidade (cobre NF fictícia e NF-e real). */
function deepFind(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const node = obj as Node;
  if (key in node) return node[key];
  for (const value of Object.values(node)) {
    const found = deepFind(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function party(raw: unknown) {
  const n = asNode(raw);
  const city = [str(n.xMun), str(n.UF)].filter(Boolean).join("/");
  return { name: str(n.xNome), cnpj: str(n.CNPJ), city: city || null };
}

function linesLabel(lines: number[]): string {
  if (lines.length === 1) return `linha ${lines[0]}`;
  const head = lines.slice(0, -1).join(", ");
  return `linhas ${head} e ${lines[lines.length - 1]}`;
}

export function parseNfXml(xml: string, items: ContractItem[]): ParsedNf {
  const fail = (message: string): ParsedNf => ({ nf: null, billed: [], adjustments: [], errors: [{ row: null, message }] });

  if (XMLValidator.validate(xml) !== true) return fail("O arquivo não é um XML válido.");

  const doc = parser.parse(xml) as Node;
  const ide = asNode(deepFind(doc, "ide"));
  const number = str(ide.nNF);
  if (!number) return fail("O arquivo não parece uma NF-e: falta a tag <nNF>.");

  const dets = (deepFind(doc, "det") as unknown[] | undefined) ?? [];
  const known = new Map(items.map((i) => [i.id, i]));
  const errors: UploadError[] = [];

  const nfItems: NfItem[] = dets.map((raw, index) => {
    const det = asNode(raw);
    const prod = asNode(det.prod);
    const cProd = str(prod.cProd);
    const line = Number(det["@_nItem"]) || index + 1;
    const item: NfItem = {
      line,
      itemId: resolveItemId(items, cProd, str(prod.xProd)),
      description: str(prod.xProd),
      unit: str(prod.uCom),
      qty: num(prod.qCom),
      unitPrice: num(prod.vUnCom),
      total: num(prod.vProd),
    };
    if ([item.qty, item.unitPrice, item.total].some(Number.isNaN)) {
      errors.push({ row: line, message: "Quantidade ou valor inválido na linha da NF." });
    }
    return item;
  });

  const total = asNode(asNode(deepFind(doc, "total")).ICMSTot);
  const discountNodes = (deepFind(doc, "desc") as unknown[] | undefined) ?? [];
  const discounts = discountNodes
    .map((raw) => {
      const d = asNode(raw);
      return { description: str(d.xDesc ?? d.xProd), amount: num(d.vDesc ?? d.valor) };
    })
    .filter((d) => d.description && Number.isFinite(d.amount));

  const totalProducts = num(total.vProd);
  const totalDiscounts = Number.isFinite(num(total.vDesc)) ? num(total.vDesc) : discounts.reduce((s, d) => s + d.amount, 0);
  const nf: NfDocument = {
    number,
    series: str(ide.serie),
    issuedAt: str(ide.dhEmi).slice(0, 10),
    competence: str(ide.competencia) || str(ide.dhEmi).slice(0, 7),
    issuer: party(deepFind(doc, "emit")),
    recipient: party(deepFind(doc, "dest")),
    items: nfItems,
    discounts,
    totalProducts: Number.isFinite(totalProducts) ? totalProducts : nfItems.reduce((s, i) => s + i.total, 0),
    totalDiscounts,
    total: Number.isFinite(num(total.vNF)) ? num(total.vNF) : totalProducts - totalDiscounts,
    notes: str(asNode(deepFind(doc, "infAdic")).infCpl) || null,
    // O DANFE da demo é sempre fictício (o tipo do front exige o literal true).
    fictitious: true,
  };

  return analyzeNf(nf, items, errors);
}

/**
 * Cruza a NF (vinda do XML ou da leitura de uma foto) com os itens do contrato:
 * calcula o que foi faturado por item e os descontos de crédito de SLA e multa.
 */
export function analyzeNf(nf: NfDocument, items: ContractItem[], inheritedErrors: UploadError[] = []): ParsedNf {
  const known = new Map(items.map((i) => [i.id, i]));
  const number = nf.number;
  const discounts = nf.discounts;
  const nfItems = nf.items;
  const errors: UploadError[] = [...inheritedErrors];

  for (const it of nfItems) {
    if (it.itemId === null || !known.has(it.itemId)) {
      errors.push({ row: it.line, message: `A linha ${it.line} (${it.description || "sem descrição"}) não corresponde a nenhum item do contrato.` });
    }
  }

  // Faturado por item. Itens de consumo têm duas linhas na NF: a franquia e o excedente.
  const byItem = new Map<string, NfItem[]>();
  for (const it of nfItems) {
    if (!it.itemId) continue;
    byItem.set(it.itemId, [...(byItem.get(it.itemId) ?? []), it]);
  }

  const billed: BilledItem[] = [];
  for (const [itemId, rows] of byItem) {
    const item = known.get(itemId) as ContractItem;
    const source = `NF ${number} · ${linesLabel(rows.map((r) => r.line))}`;

    if (item.kind === "consumo") {
      const isFranchise = (r: NfItem) => /franquia/i.test(`${r.unit} ${r.description}`) && !/excedente/i.test(r.description);
      const franchiseRows = rows.filter(isFranchise);
      const excessRows = rows.filter((r) => !isFranchise(r));
      const excessQty = excessRows.reduce((s, r) => s + r.qty, 0);
      const franchiseQty = franchiseRows.reduce((s, r) => s + r.qty * (item.franchiseQty ?? 0), 0);
      const excessValue = excessRows.reduce((s, r) => s + r.total, 0);
      billed.push({
        itemId,
        billedQty: franchiseQty + excessQty,
        billedUnitPrice: excessQty > 0 ? excessValue / excessQty : null,
        source,
      });
      continue;
    }

    const qty = rows.reduce((s, r) => s + r.qty, 0);
    const value = rows.reduce((s, r) => s + r.total, 0);
    billed.push({ itemId, billedQty: qty, billedUnitPrice: qty > 0 ? value / qty : null, source });
  }

  // Crédito de SLA e multa vêm dos descontos da NF. Sem desconto, fica 0 (nada foi aplicado).
  const sumDiscounts = (re: RegExp) => discounts.filter((d) => re.test(d.description)).reduce((s, d) => s + d.amount, 0);
  const adjustments: ParsedNf["adjustments"] = [];
  for (const item of items) {
    if (item.kind === "nivel_servico") {
      adjustments.push({ itemId: item.id, creditApplied: sumDiscounts(/cr[eé]dito|sla/i), source: `NF ${number} · descontos` });
    } else if (item.kind === "entrega" && item.penaltyPerDayPct != null) {
      adjustments.push({ itemId: item.id, penaltyApplied: sumDiscounts(/multa/i), source: `NF ${number} · descontos` });
    }
  }

  return { nf, billed, adjustments, errors };
}
