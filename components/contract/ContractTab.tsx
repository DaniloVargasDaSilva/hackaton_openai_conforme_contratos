"use client";

import { useState } from "react";
import { useContract } from "@/hooks/queries";
import { useExtract } from "@/hooks/mutations";
import { Skeleton } from "@/components/common/States";
import { ContractDocument } from "./ContractDocument";
import { ItemsPanel } from "./ItemsPanel";

function TabSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]" aria-busy>
      <div className="folha order-2 space-y-3 p-6 lg:order-1 lg:p-12">
        <Skeleton style={{ height: 20, width: "70%" }} />
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} style={{ height: 18, width: `${95 - ((i * 7) % 30)}%` }} />
        ))}
      </div>
      <div className="order-1 space-y-3 rounded-xl border border-filete bg-superficie p-4 lg:order-2">
        <Skeleton style={{ height: 22, width: "50%" }} />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} style={{ height: 44 }} />
        ))}
      </div>
    </div>
  );
}

export function ContractTab({ contractId }: { contractId: string }) {
  const { data } = useContract(contractId);
  const extract = useExtract(contractId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!data) return <TabSkeleton />;

  const { contract, clauses, items, extraction } = data;
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <div className="order-2 min-w-0 lg:order-1">
        <ContractDocument
          text={contract.text}
          clauses={clauses}
          highlight={{ quote: selected?.quote ?? null, clauseRefs: selected?.clauseRefs ?? [] }}
        />
      </div>
      <div className="order-1 min-w-0 lg:sticky lg:top-6 lg:order-2">
        <ItemsPanel
          items={items}
          extraction={extraction}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          onExtract={() => extract.mutate()}
          extracting={extract.isPending}
        />
      </div>
    </div>
  );
}
