// Dan: motor de conferência. Função pura: conferir(items, lines, usageFacts) → { occurrences, opportunities }.
// Sem banco e sem IA. Quem decide se é divergência é este arquivo, sempre do mesmo jeito.
import type { Clause, ContractItem, InvoiceLine, Occurrence, Opportunity, OccurrenceType } from "@/lib/contracts";

export type UsageFactInput = { itemId: string; terminatedAssigned: number; overPlanUsers: number };

/** Ocorrência como o motor a produz. Quem persiste acrescenta contractId, id e revisões. */
export type DraftOccurrence = Omit<Occurrence, "id" | "contractId" | "status" | "reviews">;

export type ConferenceResult = {
  occurrences: DraftOccurrence[];
  opportunities: Opportunity[];
};

type Ctx = {
  item: ContractItem;
  line: InvoiceLine;
  clauses: Map<string, string>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${from}T00:00:00Z`) - Date.parse(`${to}T00:00:00Z`)) / 86_400_000);
}

function evidenceFor(item: ContractItem, clauses: Map<string, string>) {
  return item.clauseRefs
    .filter((ref) => clauses.has(ref))
    .map((ref) => ({ clauseRef: ref, quote: clauses.get(ref) as string }));
}

function occurrence(
  ctx: Ctx,
  type: OccurrenceType,
  data: { title: string; impact: number; explanation: string; delivery: string },
): DraftOccurrence {
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
      delivery: { source: ctx.line.source, text: data.delivery },
    },
  };
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
        title: `Cobrança além do contratado em ${item.name}: +${num.format(extra)} ${unit}`,
        impact: extra * billedPrice,
        explanation: `A fatura cobra ${num.format(line.billedQty)} ${unit}, e o contrato prevê ${num.format(item.quantity)}. A diferença gera ${brl.format(extra * billedPrice)}.`,
        delivery: `Faturado: ${num.format(line.billedQty)} ${unit} a ${brl.format(billedPrice)}`,
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
        delivery: `Faturado a ${brl.format(line.billedUnitPrice)} por ${unit}`,
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

  if (line.billedQty != null && line.measuredQty != null && overage != null && line.billedQty > line.measuredQty) {
    const billedExcess = Math.max(0, line.billedQty - franchise);
    const dueExcess = Math.max(0, line.measuredQty - franchise);
    const diff = billedExcess - dueExcess;
    if (diff > 0) {
      out.push(
        occurrence(ctx, "quantidade", {
          title: `Excedente faturado acima do medido em ${item.name}: +${num.format(diff)} ${unit}`,
          impact: diff * overage,
          explanation: `A fatura cobra ${num.format(line.billedQty)} ${unit} e o painel mediu ${num.format(line.measuredQty)}. Com franquia de ${num.format(franchise)}, a diferença de excedente gera ${brl.format(diff * overage)}.`,
          delivery: `Faturado: ${num.format(line.billedQty)} ${unit} · medido: ${num.format(line.measuredQty)}`,
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
        delivery: `Faturado a ${brl.format(line.billedUnitPrice)} por ${unit}`,
      }),
    );
  }
}

/* ---------- entrega (implantação, treinamento) ---------- */

function checkEntrega(ctx: Ctx, out: DraftOccurrence[]) {
  const { item, line } = ctx;
  const unit = item.unit ?? "entrega";

  if (line.deliveredAt && item.dueDate && line.deliveredAt > item.dueDate) {
    const days = daysBetween(line.deliveredAt, item.dueDate);
    let impact = 0;
    let explanation = `Prazo contratual ${item.dueDate}, entrega em ${line.deliveredAt}, ${days} dia(s) de atraso. O contrato não prevê multa para este item, então o atraso fica registrado sem valor.`;

    if (item.penaltyPerDayPct != null) {
      const pct = Math.min(days * item.penaltyPerDayPct, item.penaltyCapPct ?? 100);
      const due = (pct / 100) * (item.unitPrice ?? 0) * (item.quantity ?? 1);
      impact = Math.max(0, due - (line.penaltyApplied ?? 0));
      explanation = `Prazo contratual ${item.dueDate}, entrega em ${line.deliveredAt}, ${days} dia(s) de atraso. A multa devida é de ${num.format(pct)}% e a multa já descontada foi de ${brl.format(line.penaltyApplied ?? 0)}.`;
    }

    out.push(
      occurrence(ctx, "prazo", {
        title: `Entrega com ${days} dia(s) de atraso: ${item.name}`,
        impact,
        explanation,
        delivery: `Entregue em ${line.deliveredAt} (prazo ${item.dueDate})`,
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
        title: `Cobrança sem entrega em ${item.name}: ${num.format(missing)} ${unit}`,
        impact: missing * item.unitPrice,
        explanation: `O contrato prevê ${num.format(item.quantity)} ${unit}, mas só ${num.format(line.measuredQty)} foram realizadas, e a fatura cobra ${num.format(line.billedQty)}.`,
        delivery: `Realizado: ${num.format(line.measuredQty)} de ${num.format(item.quantity)} · faturado: ${num.format(line.billedQty)}`,
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
        delivery: `Faturado a ${brl.format(line.billedUnitPrice)} por ${unit}`,
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
      delivery: `Disponibilidade medida: ${num.format(line.measuredPct)}% · crédito aplicado: ${brl.format(line.creditApplied ?? 0)}`,
    }),
  );
}

/* ---------- oportunidades (regras de utilização, não são divergência) ---------- */

function opportunitiesFor(
  items: ContractItem[],
  lines: InvoiceLine[],
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
          title: `${num.format(unused)} ${unit} sem uso em ${item.name}`,
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
        title: `${num.format(fact.terminatedAssigned)} ${unit} atribuídas a pessoas desligadas`,
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
  lines: InvoiceLine[],
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
