"use client";

import Link from "next/link";
import { useContracts } from "@/hooks/queries";
import { moneyInt, pct } from "@/lib/format";
import { Chip } from "@/components/common/Chips";
import { ErrorState, Skeleton } from "@/components/common/States";
import { ABC_EXPLICACAO, AbcPareto } from "./AbcPareto";

const TEXTO: Record<string, string> = {
  A: "Poucos contratos, ~80% do gasto. Confira primeiro.",
  B: "Os próximos ~15% do gasto.",
  C: "Os ~5% restantes. Conferência eventual.",
};

// Aba "Painel": a curva ABC explicada, separada da tabela da Carteira.
export function AbcDashboard() {
  const { data, isLoading, error, refetch } = useContracts();

  return (
    <main className="w-full px-4 py-[18px] md:p-7">
      <div className="mb-5">
        <h1 className="m-0 text-[21px] font-semibold tracking-[-0.01em] md:text-2xl">Painel da carteira</h1>
        <p className="mt-1 text-tinta-fraca">Onde está o dinheiro: a curva ABC mostra por onde começar a conferir.</p>
      </div>

      {isLoading && <Skeleton style={{ height: 320 }} />}
      {error && !isLoading && <ErrorState error={error} onRetry={() => refetch()} />}

      {data && data.length > 0 && (
        <>
          <AbcPareto contracts={data} highlightId="c-042" />

          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            {(["A", "B", "C"] as const).map((k) => {
              const list = data.filter((c) => c.abcClass === k);
              return (
                <section key={k} className="card" style={{ containerType: "normal" }}>
                  <div className="flex items-center gap-2">
                    <Chip title={ABC_EXPLICACAO}>{k}</Chip>
                    <h2 className="m-0 text-[16px] font-semibold">Classe {k}</h2>
                    <span className="ml-auto text-[13px] text-tinta-fraca">
                      {list.length} {list.length === 1 ? "contrato" : "contratos"}
                    </span>
                  </div>
                  <p className="mb-3 mt-1.5 text-[14px] text-tinta-fraca">{TEXTO[k]}</p>
                  <ul className="m-0 list-none p-0">
                    {list.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 border-t border-filete py-2 text-[14px]">
                        <span className="min-w-0 truncate">
                          <span className="num">{c.number}</span> · {c.supplier}
                        </span>
                        <span className="num shrink-0 text-tinta-fraca">
                          {moneyInt(c.annualValue)} · {pct(c.cumulativePct)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {k === "A" && (
                    <Link href="/contratos/c-042?aba=contrato" className="btn btn-pri btn-peq mt-3 no-underline">
                      Conferir o 042/2026 →
                    </Link>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
