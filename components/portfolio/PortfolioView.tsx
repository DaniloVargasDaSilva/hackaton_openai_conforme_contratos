"use client";

import Link from "next/link";
import { useState } from "react";
import { NewContractPanel } from "./NewContractPanel";
import { ABC_EXPLICACAO } from "./AbcPareto";
import { useContracts } from "@/hooks/queries";
import { amount, date, inMonths, moneyInt, number, pct } from "@/lib/format";
import type { ContractSummary } from "@/lib/contracts";
import { Chip } from "@/components/common/Chips";
import { ErrorState, EmptyState, Skeleton } from "@/components/common/States";

type Abc = "A" | "B" | "C";
const CLASSES: Abc[] = ["A", "B", "C"];

// Renovação próxima (até 2 meses) vira alerta; o resto é neutro.
function isUrgent(label: string) {
  return /^(vencido|este mês|em 1 mês|em 2 meses)$/.test(label);
}

function RenewalChip({ iso }: { iso: string }) {
  const label = inMonths(iso);
  const urgent = isUrgent(label);
  return (
    <Chip tone={urgent ? "alerta" : "neutro"}>
      {urgent && (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5V8l2.5 1.5" />
        </svg>
      )}
      {label}
    </Chip>
  );
}

function ConferirLink({ c, full }: { c: ContractSummary; full?: boolean }) {
  return (
    <Link
      href={`/contratos/${c.id}?aba=contrato`}
      className={`btn btn-pri ${full ? "" : "btn-peq"} no-underline`}
      style={full ? { width: "100%", justifyContent: "center", height: 44 } : undefined}
    >
      Conferir →
    </Link>
  );
}

function Th({ children, dir, icon }: { children?: React.ReactNode; dir?: boolean; icon?: React.ReactNode }) {
  return (
    <th className={dir ? "dir" : undefined}>
      {icon && (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          {icon}
        </svg>
      )}
      {children}
    </th>
  );
}

function LoadingView() {
  return (
    <div aria-busy="true" aria-label="Carregando carteira">
      <div className="mb-6 grid grid-cols-1 gap-3.5 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`card ${i > 0 ? "max-md:hidden" : ""}`}>
            <Skeleton style={{ width: 120, height: 14 }} />
            <Skeleton style={{ width: 160, height: 36, marginTop: 12 }} />
            <Skeleton style={{ width: 100, height: 14, marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-filete bg-superficie">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-filete px-3.5 py-3.5 last:border-b-0">
            <Skeleton style={{ width: 70, height: 16 }} />
            <div className="flex-1">
              <Skeleton style={{ width: "40%", height: 16 }} />
              <Skeleton style={{ width: "60%", height: 13, marginTop: 6 }} />
            </div>
            <Skeleton style={{ width: 80, height: 16 }} className="max-md:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}

const valor = (v: number) => amount(v).replace(/,00$/, "");

export function PortfolioView() {
  const [newOpen, setNewOpen] = useState(false);
  const { data, isLoading, error, refetch } = useContracts();

  const total = data?.reduce((s, c) => s + c.annualValue, 0) ?? 0;
  const byClass = CLASSES.map((k) => {
    const list = (data ?? []).filter((c) => c.abcClass === k);
    const sum = list.reduce((s, c) => s + c.annualValue, 0);
    return { k, count: list.length, sum, share: total > 0 ? (sum / total) * 100 : 0 };
  });

  return (
    <main className="w-full px-4 py-[18px] md:p-7">
      <div className="mb-5 flex items-end justify-between gap-3 max-md:mb-3.5">
        <div>
        <h1 className="m-0 text-[21px] font-semibold tracking-[-0.01em] md:text-2xl">
          <span className="max-md:hidden">Carteira de contratos de software</span>
          <span className="md:hidden">Carteira</span>
        </h1>
        <p className="mt-1 text-tinta-fraca max-md:hidden">
          Onde está o dinheiro: curva ABC pelo valor anual. Comece pelos contratos A.
        </p>
        <Link href="/painel" className="mt-1 inline-block text-[14px]">
          Entenda a curva ABC no Painel →
        </Link>
        </div>
        <button type="button" className="btn btn-pri shrink-0" onClick={() => setNewOpen(true)}>
          + Novo contrato
        </button>
      </div>
      <NewContractPanel open={newOpen} onClose={() => setNewOpen(false)} />

      {isLoading && <LoadingView />}
      {error && !isLoading && <ErrorState error={error} onRetry={() => refetch()} />}

      {data && data.length === 0 && <EmptyState title="Nenhum contrato na carteira" />}

      {data && data.length > 0 && (
        <>
          {/* Cards (desktop) */}
          <div className="mb-6 grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-3.5 max-md:hidden">
            <div className="card">
              <div className="card-rot">Gasto anual em software</div>
              <div className="card-val">{moneyInt(total)}</div>
              <div className="card-meta">{data.length} contratos ativos</div>
            </div>
            {byClass.map((b) => (
              <div className="card" key={b.k}>
                <div className="card-rot">
                  <span className="chip chip-neutro" style={{ height: 22 }}>
                    {b.k}
                  </span>
                  Classe {b.k}
                </div>
                <div className="card-val" style={{ fontSize: 30 }}>
                  {b.count}{" "}
                  <span style={{ fontSize: 15, color: "var(--tinta-fraca)", fontWeight: 500 }}>
                    {b.count === 1 ? "contrato" : "contratos"}
                  </span>
                </div>
                <div className="card-meta">
                  <span className="num">{moneyInt(b.sum)}</span> · {number(Math.round(b.share))}% do gasto
                </div>
              </div>
            ))}
          </div>

          {/* Card (celular) */}
          <div className="card mb-3.5 md:hidden">
            <div className="card-rot">Gasto anual em software</div>
            <div className="card-val">{moneyInt(total)}</div>
            <div className="mt-3 flex gap-2">
              {byClass.map((b) => (
                <span key={b.k} className="chip chip-neutro" title={ABC_EXPLICACAO}>
                  {b.k} · {b.count}
                </span>
              ))}
            </div>
          </div>

          {/* Tabela (desktop) */}
          <div className="overflow-hidden rounded-xl border border-filete max-md:hidden">
            <table className="tab">
              <thead>
                <tr>
                  <Th icon={<><path d="M4 1.5h5l3 3v10H4z" /><path d="M9 1.5v3h3" /></>}>Contrato</Th>
                  <Th icon={<><circle cx="8" cy="5.5" r="2.5" /><path d="M3 14c.6-2.7 2.6-4 5-4s4.4 1.3 5 4" /></>}>
                    Fornecedor · objeto
                  </Th>
                  <Th icon={<path d="M2 13h12M4 13V8M8 13V4M12 13V6" />}>ABC</Th>
                  <Th
                    dir
                    icon={<><circle cx="8" cy="8" r="6" /><path d="M8 4.5v7M10 6H7a1.2 1.2 0 0 0 0 2.4h2a1.2 1.2 0 0 1 0 2.4H6" /></>}
                  >
                    Valor anual
                  </Th>
                  <Th icon={<path d="M2 14L14 2M2 6h4M10 10h4" />}>% acumulado</Th>
                  <Th icon={<><rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 7h12M5 1.5v3M11 1.5v3" /></>}>
                    Renovação
                  </Th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} style={c.hasDemoData ? { background: "var(--acento-leve)" } : undefined}>
                    <td className="num">{c.number}</td>
                    <td>
                      <b style={{ fontWeight: 600 }}>{c.supplier}</b>
                      <div style={{ fontSize: 13, color: "var(--tinta-fraca)" }}>{c.object}</div>
                    </td>
                    <td>
                      <Chip title={ABC_EXPLICACAO}>{c.abcClass}</Chip>
                    </td>
                    <td className="dir num">{valor(c.annualValue)}</td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="barra" style={{ width: 90 }}>
                          <i style={{ width: `${Math.min(100, Math.max(0, c.cumulativePct))}%` }} />
                        </div>
                        <span className="num" style={{ fontSize: 14 }}>
                          {pct(c.cumulativePct)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="num" style={{ fontSize: 14 }}>
                          {date(c.renewsAt)}
                        </span>
                        <RenewalChip iso={c.renewsAt} />
                      </div>
                    </td>
                    <td className="dir">{c.hasDemoData && <ConferirLink c={c} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="rodape-tab">{data.length} contratos nesta visão · valores em R$ por ano</div>
          </div>

          {/* Lista em cartões (celular) */}
          <div className="rounded-xl border border-filete bg-superficie md:hidden">
            {data.map((c) => (
              <div
                key={c.id}
                className="border-b border-filete p-3.5"
                style={c.hasDemoData ? { background: "var(--acento-leve)" } : undefined}
              >
                <div className="flex justify-between gap-3">
                  <b style={{ fontWeight: 600 }}>{c.supplier}</b>
                  <span className="num">{valor(c.annualValue)}</span>
                </div>
                <div className="mt-0.5 text-[13px] text-tinta-fraca">
                  <span className="num">{c.number}</span> · {c.abcClass} · {pct(c.cumulativePct)} acum.
                </div>
                <div className="mt-2">
                  <RenewalChip iso={c.renewsAt} />
                </div>
                {c.hasDemoData && (
                  <div className="mt-2.5">
                    <ConferirLink c={c} full />
                  </div>
                )}
              </div>
            ))}
            <div className="rodape-tab" style={{ borderRadius: "0 0 12px 12px" }}>
              {data.length} contratos nesta visão · role para ver todos
            </div>
          </div>
        </>
      )}
    </main>
  );
}
