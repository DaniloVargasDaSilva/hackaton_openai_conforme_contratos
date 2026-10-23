// Dan: motor de conferência. Função pura: conferir(items, lines, usageFacts) → { occurrences, opportunities }.
// Sem banco e sem IA. Quem decide se é divergência é este arquivo, sempre do mesmo jeito.
// A evidência sai em três vias: trecho do contrato, linha da NF e registro de entrega.
import type { Clause, ContractItem, InvoiceLine, Opportunity } from "@/lib/contracts";
import type { Occurrence3 } from "@/lib/contracts-3vias";

type OccurrenceType = Occurrence3["type"];

export type UsageFactInput = { itemId: string; terminatedAssigned: number; overPlanUsers: number };

/** Linha da fatura com a origem de cada lado. Linha antiga (CSV único) só tem `source`. */
export type ConferenceLine = InvoiceLine & {
  invoiceSource?: string | null;
  deliverySource?: string | null;
};

/** Ocorrência como o motor a produz. Quem persiste acrescenta contractId, id e revisões. */
export type DraftOccurrence = Omit<Occurrence3, "id" | "contractId" | "status" | "reviews">;

export type ConferenceResult = {
  occurrences: DraftOccurrence[];
  opportunities: Opportunity[];
};

type Ctx = {
  item: ContractItem;
  line: ConferenceLine;
  clauses: Map<string, string>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** Concordância simples da unidade com a quantidade: "licença" → "licenças", "milhão de tokens" → "milhões de tokens". */
function pluralize(n: number, unit: string): string {
  if (n === 1) return unit;
  const [head, ...rest] = unit.split(" ");
  const plural = /ão$/.test(head) ? head.replace(/ão$/, "ões") : /[aeiou]$/.test(head) ? `${head}s` : head;
  return [plural, ...rest].join(" ");
}

/** "15 licenças", "1 licença", "8 milhões de tokens". */
const withUnit = (n: number, unit: string) => `${num.format(n)} ${pluralize(n, unit)}`;

const dmy = (date: string) => date.split("-").reverse().join("/");

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${from}T00:00:00Z`) - Date.parse(`${to}T00:00:00Z`)) / 86_400_000);
}

function evidenceFor(item: ContractItem, clauses: Map<string, string>) {
  return item.clauseRefs
    .filter((ref) => clauses.has(ref))
    .map((ref) => ({ clauseRef: ref, quote: clauses.get(ref) as string }));
}

type Draft = {
  title: string;
  impact: number;
  explanation: string;
  /** Texto da coluna "Nota fiscal". null quando não há NF para mostrar. */
  invoice: string | null;
  /** Texto da coluna "Entrega". */
  delivery: string;
};

function occurrence(ctx: Ctx, type: OccurrenceType, data: Draft): DraftOccurrence {
  const { line } = ctx;
  // Linha vinda do CSV único antigo não separa os lados: a origem única serve aos dois.
  const legacy = !line.invoiceSource && !line.deliverySource;
  const invoiceSource = line.invoiceSource ?? (legacy ? line.source : null);

  return {
    key: `${ctx.item.id}:${type}`,
    itemId: ctx.item.id,
    itemName: ctx.item.name,
    type,
    title: data.title,
    impact: round2(data.impact),
    explanation: data.explanation,
    evidence: {
      contract: evidenceFor(ctx.item, ctx.clauses),
      invoice: data.invoice && invoiceSource ? { source: invoiceSource, text: data.invoice } : null,
      delivery: {
        source: line.deliverySource ?? (legacy ? line.source : "Sem registro de entrega"),
        text: data.delivery,
      },
    },
  };
}

/** Texto do lado entregue de um item recorrente. */
function deliveredText(line: ConferenceLine, unit: string) {
  if (line.activeUsers != null) return `${withUnit(line.activeUsers, unit)} com uso nos últimos 30 dias`;
  if (line.measuredQty != null) return `${withUnit(line.measuredQty, unit)} registradas na entrega`;
  return "Sem registro de entrega para este item";
}

/* ---------- recorrente (licenças, pacote, horas) ---------- */

function checkRecorrente(ctx: Ctx, out: DraftOccurrence[]) {
  const { item, line } = ctx;
  const unit = item.unit ?? "unidade";
  const billedPrice = line.billedUnitPrice ?? item.unitPrice;

  if (line.billedQty != null && item.quantity != null && billedPrice != null && line.billedQty > item.quantity) {
    const extra = line.billedQty - item.quantity;
    out.push(
      occurrence(ctx, "quantidade", {
        title: `Cobrança além do contratado em ${item.name}: +${withUnit(extra, unit)}`,
        impact: extra * billedPrice,
        explanation: `A fatura cobra ${withUnit(line.billedQty, unit)}, e o contrato prevê ${num.format(item.quantity)}. A diferença gera ${brl.format(extra * billedPrice)}.`,
        invoice: `${withUnit(line.billedQty, unit)} × ${brl.format(billedPrice)} = ${brl.format(line.billedQty * billedPrice)}`,
        delivery: deliveredText(line, unit),
      }),
    );
  }

  if (line.billedUnitPrice != null && item.unitPrice != null && line.billedUnitPrice > item.unitPrice) {
    const qty = Math.min(line.billedQty ?? item.quantity ?? 0, item.quantity ?? Infinity);
    const diff = line.billedUnitPrice - item.unitPrice;
    out.push(
      occurrence(ctx, "valor", {
        title: `Preço acima do contratado em ${item.name}: ${brl.format(line.billedUnitPrice)} em vez de ${brl.format(item.unitPrice)}`,
        impact: diff * qty,
        explanation: `O preço por ${unit} está fixado no contrato em ${brl.format(item.unitPrice)}, mas a fatura cobra ${brl.format(line.billedUnitPrice)}.`,
        invoice: `${withUnit(qty, unit)} × ${brl.format(line.billedUnitPrice)} = ${brl.format(qty * line.billedUnitPrice)}`,
        delivery: deliveredText(line, unit),
      }),
    );
  }
}

/* ---------- consumo (tokens de IA) ---------- */

function checkConsumo(ctx: Ctx, out: DraftOccurrence[]) {
  const { item, line } = ctx;
  const unit = item.unit ?? "unidade";
  const franchise = item.franchiseQty ?? 0;
  const overage = item.overageUnitPrice;
  const measuredText =
    line.measuredQty != null ? `${withUnit(line.measuredQty, unit)} medidos` : "Sem medição para este item";

  if (line.billedQty != null && line.measuredQty != null && overage != null && line.billedQty > line.measuredQty) {
    const billedExcess = Math.max(0, line.billedQty - franchise);
    const dueExcess = Math.max(0, line.measuredQty - franchise);
    const diff = billedExcess - dueExcess;
    if (diff > 0) {
      out.push(
        occurrence(ctx, "quantidade", {
          title: `Excedente faturado acima do medido em ${item.name}: +${withUnit(diff, unit)}`,
          impact: diff * overage,
          explanation: `A fatura cobra ${withUnit(line.billedQty, unit)} e o painel mediu ${num.format(line.measuredQty)}. Com franquia de ${num.format(franchise)}, a diferença de excedente gera ${brl.format(diff * overage)}.`,
          invoice: `Franquia de ${withUnit(franchise, unit)} + ${withUnit(billedExcess, unit)} de excedente × ${brl.format(line.billedUnitPrice ?? overage)}`,
          delivery: measuredText,
        }),
      );
    }
  }

  if (line.billedUnitPrice != null && overage != null && line.billedUnitPrice > overage && line.measuredQty != null) {
    const dueExcess = Math.max(0, line.measuredQty - franchise);
    const diff = line.billedUnitPrice - overage;
    out.push(
      occurrence(ctx, "valor", {
        title: `Excedente cobrado acima do contratado em ${item.name}: ${brl.format(line.billedUnitPrice)} em vez de ${brl.format(overage)}`,
        impact: diff * dueExcess,
        explanation: `O excedente está fixado em ${brl.format(overage)} por ${unit}, mas a fatura cobra ${brl.format(line.billedUnitPrice)}.`,
        invoice: `Excedente a ${brl.format(line.billedUnitPrice)} por ${unit}`,
        delivery: measuredText,
      }),
    );
  }
}

/* ---------- entrega (implantação, treinamento) ---------- */

function checkEntrega(ctx: Ctx, out: DraftOccurrence[]) {
  const { item, line } = ctx;
  const unit = item.unit ?? "entrega";
  const hasBilling = line.billedQty != null || line.billedUnitPrice != null;

  if (line.deliveredAt && item.dueDate && line.deliveredAt > item.dueDate) {
    const days = daysBetween(line.deliveredAt, item.dueDate);
    let impact = 0;
    let explanation = `Prazo contratual ${dmy(item.dueDate)}, entrega em ${dmy(line.deliveredAt)}, ${days} dia(s) de atraso. O contrato não prevê multa para este item, então o atraso fica registrado sem valor.`;

    if (item.penaltyPerDayPct != null) {
      const pct = Math.min(days * item.penaltyPerDayPct, item.penaltyCapPct ?? 100);
      const due = (pct / 100) * (item.unitPrice ?? 0) * (item.quantity ?? 1);
      impact = Math.max(0, due - (line.penaltyApplied ?? 0));
      explanation = `Prazo contratual ${dmy(item.dueDate)}, entrega em ${dmy(line.deliveredAt)}, ${days} dia(s) de atraso. A multa devida é de ${num.format(pct)}% e a multa já descontada foi de ${brl.format(line.penaltyApplied ?? 0)}.`;
    }

    const billedValue = (line.billedUnitPrice ?? item.unitPrice ?? 0) * (line.billedQty ?? item.quantity ?? 1);
    out.push(
      occurrence(ctx, "prazo", {
        title: `Entrega com ${days} dia(s) de atraso: ${item.name}`,
        impact,
        explanation,
        invoice: hasBilling
          ? `${item.name} ${brl.format(billedValue)} · ${
              (line.penaltyApplied ?? 0) > 0 ? `multa descontada de ${brl.format(line.penaltyApplied ?? 0)}` : "sem desconto de multa"
            }`
          : null,
        delivery: `Entregue em ${dmy(line.deliveredAt)} (prazo ${dmy(item.dueDate)})`,
      }),
    );
  }

  if (
    line.measuredQty != null &&
    item.quantity != null &&
    item.unitPrice != null &&
    line.measuredQty < item.quantity &&
    line.billedQty != null &&
    line.billedQty >= item.quantity
  ) {
    const missing = item.quantity - line.measuredQty;
    out.push(
      occurrence(ctx, "quantidade", {
        title: `Cobrança sem entrega em ${item.name}: ${withUnit(missing, unit)}`,
        impact: missing * item.unitPrice,
        explanation: `O contrato prevê ${withUnit(item.quantity, unit)}, mas só ${num.format(line.measuredQty)} foram realizadas, e a fatura cobra ${num.format(line.billedQty)}.`,
        invoice: `${withUnit(line.billedQty, unit)} × ${brl.format(line.billedUnitPrice ?? item.unitPrice)}`,
        delivery: `${num.format(line.measuredQty)} de ${withUnit(item.quantity, unit)} realizadas`,
      }),
    );
  }

  if (line.billedUnitPrice != null && item.unitPrice != null && line.billedUnitPrice > item.unitPrice) {
    const qty = line.billedQty ?? item.quantity ?? 0;
    out.push(
      occurrence(ctx, "valor", {
        title: `Preço acima do contratado em ${item.name}: ${brl.format(line.billedUnitPrice)} em vez de ${brl.format(item.unitPrice)}`,
        impact: (line.billedUnitPrice - item.unitPrice) * qty,
        explanation: `O valor por ${unit} está fixado em ${brl.format(item.unitPrice)} no contrato, mas a fatura cobra ${brl.format(line.billedUnitPrice)}.`,
        invoice: `${withUnit(qty, unit)} × ${brl.format(line.billedUnitPrice)} = ${brl.format(qty * line.billedUnitPrice)}`,
        delivery:
          line.measuredQty != null
            ? `${withUnit(line.measuredQty, unit)} realizadas`
            : "Sem registro de entrega para este item",
      }),
    );
  }
}

/* ---------- nível de serviço (SLA) ---------- */

function checkSla(ctx: Ctx, items: Map<string, ContractItem>, out: DraftOccurrence[]) {
  const { item, line } = ctx;
  if (line.measuredPct == null || item.slaMinPct == null || line.measuredPct >= item.slaMinPct) return;

  const base = item.slaBaseItemIds.reduce((sum, id) => {
    const baseItem = items.get(id);
    return sum + (baseItem?.quantity ?? 0) * (baseItem?.unitPrice ?? 0);
  }, 0);
  const due = ((item.slaCreditPct ?? 0) / 100) * base;
  const impact = due - (line.creditApplied ?? 0);
  if (impact <= 0) return;

  out.push(
    occurrence(ctx, "sla", {
      title: `Disponibilidade de ${num.format(line.measuredPct)}% abaixo de ${num.format(item.slaMinPct)}%: crédito não aplicado`,
      impact,
      explanation: `O contrato garante ${num.format(item.slaMinPct)}% de disponibilidade. Medido: ${num.format(line.measuredPct)}%. O crédito de ${num.format(item.slaCreditPct ?? 0)}% sobre a mensalidade dos serviços base é ${brl.format(due)}, e foram aplicados ${brl.format(line.creditApplied ?? 0)}.`,
      invoice: `Descontos de SLA na NF: ${brl.format(line.creditApplied ?? 0)}${(line.creditApplied ?? 0) === 0 ? " · nenhum crédito aplicado" : ""}`,
      delivery: `Disponibilidade medida: ${num.format(line.measuredPct)}%`,
    }),
  );
}

/* ---------- oportunidades (regras de utilização, não são divergência) ---------- */

function opportunitiesFor(
  items: ContractItem[],
  lines: ConferenceLine[],
  usageFacts: UsageFactInput[],
): Opportunity[] {
  const out: Opportunity[] = [];

  for (const item of items) {
    if (item.kind !== "recorrente" || item.unitPrice == null) continue;
    const unit = item.unit ?? "unidade";
    const line = lines.find((l) => l.itemId === item.id);
    const fact = usageFacts.find((f) => f.itemId === item.id);

    if (line?.activeUsers != null && item.quantity != null) {
      const contracted = Math.min(line.billedQty ?? item.quantity, item.quantity);
      const unused = contracted - line.activeUsers;
      if (unused > 0) {
        out.push({
          id: `${item.id}:sem_uso`,
          itemId: item.id,
          rule: "sem_uso",
          title: `${withUnit(unused, unit)} sem uso em ${item.name}`,
          monthlyValue: round2(unused * item.unitPrice),
          detail: `Só ${num.format(line.activeUsers)} usaram nos últimos 30 dias, de ${num.format(contracted)} faturados.`,
        });
      }
    }

    if (fact && fact.terminatedAssigned > 0) {
      out.push({
        id: `${item.id}:desligados`,
        itemId: item.id,
        rule: "desligados",
        title: `${withUnit(fact.terminatedAssigned, unit)} atribuídas a pessoas desligadas`,
        monthlyValue: round2(fact.terminatedAssigned * item.unitPrice),
        detail: "Constam na lista do RH como desligadas e ainda estão com licença ativa.",
      });
    }

    if (fact && fact.overPlanUsers > 0) {
      out.push({
        id: `${item.id}:plano_acima`,
        itemId: item.id,
        rule: "plano_acima",
        title: `${num.format(fact.overPlanUsers)} usuários em plano acima do uso em ${item.name}`,
        monthlyValue: null,
        detail: "Usam só o básico do plano contratado. Vale avaliar downgrade no próximo ciclo.",
      });
    }
  }

  return out;
}

/* ---------- entrada pública ---------- */

export function conferir(
  items: ContractItem[],
  lines: ConferenceLine[],
  usageFacts: UsageFactInput[],
  clauses: Clause[] = [],
): ConferenceResult {
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const clauseMap = new Map(clauses.map((c) => [c.ref, c.text]));
  const occurrences: DraftOccurrence[] = [];

  for (const line of lines) {
    const item = itemMap.get(line.itemId);
    if (!item) continue;
    const ctx: Ctx = { item, line, clauses: clauseMap };

    if (item.kind === "recorrente") checkRecorrente(ctx, occurrences);
    else if (item.kind === "consumo") checkConsumo(ctx, occurrences);
    else if (item.kind === "entrega") checkEntrega(ctx, occurrences);
    else if (item.kind === "nivel_servico") checkSla(ctx, itemMap, occurrences);
  }

  return {
    occurrences,
    opportunities: opportunitiesFor(items, lines, usageFacts),
  };
}
