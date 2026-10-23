// Dan: converte linhas do banco no formato do contrato da API (lib/contracts.ts).
import type {
  Contract as DbContract,
  ContractItem as DbItem,
  InvoiceLine as DbLine,
  Occurrence as DbOccurrence,
  Review as DbReview,
} from "@prisma/client";
import type { ContractItem, ContractSummary, InvoiceLine } from "@/lib/contracts";
import type { Occurrence3 as Occurrence } from "@/lib/contracts-3vias";
import type { ConferenceLine } from "./rules";

/* ---------- mapeamento banco → contrato da API ---------- */

export function toLine(row: DbLine): InvoiceLine {
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

export function toItem(row: DbItem): ContractItem {
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

export function toOccurrence(row: DbOccurrence & { reviews: DbReview[] }): Occurrence {
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

export function toSummary(row: DbContract, abc: { abcClass: "A" | "B" | "C"; cumulativePct: number }): ContractSummary {
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

/** Linha com a origem de cada lado, usada só pelo motor (não vai na resposta da API). */
export function toConferenceLine(row: DbLine): ConferenceLine {
  return { ...toLine(row), invoiceSource: row.invoiceSource, deliverySource: row.deliverySource };
}
