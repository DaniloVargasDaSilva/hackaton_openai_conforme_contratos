import { StatusChip } from "@/components/common/Chips";
import { money } from "@/lib/format";
import type { Occurrence3 } from "@/lib/contracts-3vias";

const GROUPS: { type: Occurrence3["type"]; label: string }[] = [
  { type: "quantidade", label: "Quantidade" },
  { type: "valor", label: "Valor" },
  { type: "prazo", label: "Prazo" },
  { type: "sla", label: "Nível de serviço" },
];

export function OccurrenceList({
  occurrences,
  selectedId,
  onOpen,
}: {
  occurrences: Occurrence3[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <div>
      {GROUPS.map(({ type, label }) => {
        const list = occurrences.filter((o) => o.type === type);
        if (list.length === 0) return null;
        return (
          <section
            key={type}
            className="mb-3 overflow-hidden rounded-xl border border-filete bg-superficie"
          >
            <h3
              className="m-0 flex items-center gap-2.5 border-b border-filete px-4 py-2.5 text-[13px] font-semibold uppercase tracking-[.06em] text-tinta-fraca"
              style={{ borderLeft: "3px solid var(--falta)" }}
            >
              {label}
              <span
                className="cont"
                style={{ background: "var(--falta-leve)", color: "var(--falta)", borderColor: "var(--falta-borda)" }}
              >
                {list.length}
              </span>
            </h3>
            {list.map((o) => {
              const sel = o.id === selectedId;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onOpen(o.id)}
                  aria-label={`Abrir ocorrência: ${o.title}`}
                  className="flex w-full cursor-pointer flex-col gap-2 border-0 border-b border-filete bg-transparent px-4 py-[13px] text-left text-[15px] text-tinta last:border-b-0 hover:bg-superficie-2 sm:grid sm:grid-cols-[1fr_120px_110px_20px] sm:items-center sm:gap-3"
                  style={sel ? { background: "var(--acento-leve)", boxShadow: "inset 3px 0 0 var(--acento)" } : undefined}
                >
                  <span className="min-w-0">
                    <span className="block">{o.title}</span>
                    <span className="block text-[13px] text-tinta-tenue">{o.itemName}</span>
                  </span>
                  <span className="num font-num font-semibold sm:text-right">{money(o.impact)}</span>
                  <span>
                    <StatusChip status={o.status} />
                  </span>
                  <span aria-hidden className="hidden text-tinta-tenue sm:block">
                    ›
                  </span>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
