"use client";

import type { ContractDetail, ContractItem } from "@/lib/contracts";
import { date, money, number, pct } from "@/lib/format";
import { SourceChip, Chip } from "@/components/common/Chips";
import { EmptyState, Spinner } from "@/components/common/States";

type Props = {
  items: ContractItem[];
  extraction: ContractDetail["extraction"];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onExtract: () => void;
  extracting: boolean;
};

const N = ({ children }: { children: React.ReactNode }) => <span className="num">{children}</span>;

function Summary({ item }: { item: ContractItem }) {
  switch (item.kind) {
    case "recorrente":
      return (
        <>
          <N>{number(item.quantity)}</N> {item.unit ?? "un."} × <N>{money(item.unitPrice)}</N>/mês
        </>
      );
    case "consumo":
      return (
        <>
          franquia{" "}
          <N>
            {number(item.franchiseQty)}
            {item.unit ? ` ${item.unit}` : " mi"}
          </N>
          {item.unitPrice != null && (
            <>
              {" "}
              · <N>{money(item.unitPrice)}</N>
            </>
          )}{" "}
          · excedente <N>{money(item.overageUnitPrice)}</N>/mi
        </>
      );
    case "entrega":
      return (
        <>
          até <N>{date(item.dueDate)}</N> ·{" "}
          {item.quantity != null && item.quantity > 1 && (
            <>
              <N>{number(item.quantity)}</N> ×{" "}
            </>
          )}
          <N>{money(item.unitPrice)}</N>
          {item.penaltyPerDayPct != null && (
            <>
              {" "}
              · multa <N>{pct(item.penaltyPerDayPct)}</N>/dia
              {item.penaltyCapPct != null && (
                <>
                  , teto <N>{pct(item.penaltyCapPct)}</N>
                </>
              )}
            </>
          )}
        </>
      );
    case "nivel_servico":
      return (
        <>
          mínimo <N>{pct(item.slaMinPct)}</N> · crédito <N>{pct(item.slaCreditPct)}</N>
        </>
      );
  }
}

const IcoOk = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M3 8.5l3 3 7-7" />
  </svg>
);
const IcoWarn = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M8 2l6.5 11.5h-13z" />
    <path d="M8 6.5v3M8 11.5v.5" />
  </svg>
);
const IcoSpark = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M8 1.5l1.4 3.6L13 6.5 9.4 7.9 8 11.5 6.6 7.9 3 6.5l3.6-1.4z" />
  </svg>
);

function ExtractButton({
  onExtract,
  extracting,
  className = "",
  label = "Extrair de novo com IA",
}: {
  onExtract: () => void;
  extracting: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <button type="button" className={`btn justify-center ${className}`} onClick={onExtract} disabled={extracting}>
      {extracting ? (
        <>
          <Spinner /> Lendo o contrato…
        </>
      ) : (
        <>
          {IcoSpark} {label}
        </>
      )}
    </button>
  );
}

export function ItemsPanel({ items, extraction, selectedId, onSelect, onExtract, extracting }: Props) {
  const empty = items.length === 0;
  return (
    <aside
      className="flex flex-col overflow-hidden rounded-xl border border-filete bg-superficie lg:max-h-[calc(100vh-48px)]"
      aria-busy={extracting}
    >
      <div className="border-b border-filete p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-semibold">Itens extraídos</h2>
          {!empty && <SourceChip source={extraction.source} />}
        </div>
        <p className="mb-3 mt-1.5 text-[14px] text-tinta-fraca">
          {empty ? "Nenhum item ainda." : `${items.length} ${items.length === 1 ? "item" : "itens"}`} · a IA lê o contrato, você
          confere cada trecho.
        </p>
        {!empty && <ExtractButton onExtract={onExtract} extracting={extracting} className="w-full" />}
      </div>

      {empty ? (
        <div className="p-4">
          <EmptyState title="Nenhum item extraído ainda">
            <p className="mb-3">Peça para a IA ler o contrato e listar o que foi combinado.</p>
            <ExtractButton onExtract={onExtract} extracting={extracting} label="Extrair com IA" className="btn-pri" />
          </EmptyState>
        </div>
      ) : (
        <ul className={`m-0 list-none overflow-y-auto p-0 transition-opacity ${extracting ? "opacity-40" : ""}`}>
          {items.map((item) => {
            const sel = item.id === selectedId;
            return (
              <li key={item.id} className="border-b border-filete last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-pressed={sel}
                  disabled={extracting}
                  className={`block w-full cursor-pointer px-4 py-3.5 text-left ${
                    sel ? "bg-acento-leve shadow-[inset_3px_0_0_var(--acento)]" : !item.quoteVerified ? "bg-alerta-leve" : "hover:bg-superficie-2"
                  }`}
                >
                  <span className="flex items-center justify-between gap-3 font-semibold">
                    <span>{item.name}</span>
                    <span className="num shrink-0 text-[13px] font-normal text-tinta-fraca">{item.clauseRefs.join(" · ")}</span>
                  </span>
                  <span className="mt-[3px] block text-[14px] text-tinta-fraca">
                    <Summary item={item} />
                  </span>
                  {sel && item.quote && (
                    <span className="mt-2 block font-doc text-[14px] text-tinta-fraca">
                      “<span className="mt">{item.quote}</span>”
                    </span>
                  )}
                  {(sel || !item.quoteVerified) && (
                    <span className="mt-2 block">
                      {item.quoteVerified ? (
                        <Chip tone="ok">{IcoOk}trecho conferido</Chip>
                      ) : (
                        <Chip tone="alerta">{IcoWarn}trecho não encontrado, revisar</Chip>
                      )}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
