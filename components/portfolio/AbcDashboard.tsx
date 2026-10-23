"use client";

import Link from "next/link";
import { useCheck, useContract, useContracts, useLines, useMainContractId } from "@/hooks/queries";
import { inMonths, money, moneyInt, number } from "@/lib/format";
import type { ContractSummary } from "@/lib/contracts";
import { Chip } from "@/components/common/Chips";
import { ErrorState, Skeleton } from "@/components/common/States";
import { AbcPareto } from "./AbcPareto";

const TIPOS = [
  { k: "quantidade", label: "Quantidade" },
  { k: "valor", label: "Valor" },
  { k: "prazo", label: "Prazo" },
  { k: "sla", label: "Nível de serviço" },
] as const;

function mesesAte(iso: string, hoje = new Date()) {
  const [y, m] = iso.split("-").map(Number);
  return (y - hoje.getFullYear()) * 12 + (m - 1 - hoje.getMonth());
}

function Kpi({ rot, val, meta, cor }: { rot: string; val: React.ReactNode; meta?: React.ReactNode; cor?: string }) {
  return (
    <div className="card">
      <div className="card-rot">{rot}</div>
      <div className="card-val" style={cor ? { color: cor } : undefined}>
        {val}
      </div>
      {meta && <div className="card-meta">{meta}</div>}
    </div>
  );
}

// Aba "Painel": visão executiva da carteira. Só exibe o que a API devolve
// (contratos, check, linhas e itens do 042); nenhuma regra de divergência aqui.
export function AbcDashboard() {
  const contracts = useContracts();
  const DEMO = useMainContractId();
  const check = useCheck(DEMO);
  const lines = useLines(DEMO);
  const contract = useContract(DEMO);

  if (contracts.error) {
    return (
      <main className="p-7 max-sm:p-4">
        <ErrorState error={contracts.error} onRetry={() => contracts.refetch()} />
      </main>
    );
  }

  const data = contracts.data ?? [];
  const total = data.reduce((acc, c) => acc + c.annualValue, 0);
  const classeA = data.filter((c) => c.abcClass === "A");
  const pctA = classeA.length ? classeA[classeA.length - 1].cumulativePct : null;
  const demo = data.find((c) => c.id === DEMO);

  const cr = check.data;
  const temConferencia = !!cr && cr.occurrences.length > 0;
  const opp = cr?.opportunities ?? [];
  const semUso = opp.filter((o) => o.rule === "sem_uso");
  const semUsoMes = semUso.reduce((acc, o) => acc + (o.monthlyValue ?? 0), 0);

  const futuras = data
    .filter((c) => mesesAte(c.renewsAt) >= 0)
    .sort((a, b) => a.renewsAt.localeCompare(b.renewsAt));
  const proxima = futuras[0];
  const em6 = futuras.filter((c) => mesesAte(c.renewsAt) <= 6);

  // Licenças da suíte (item, linha e oportunidades do 042)
  const suiteItem = contract.data?.items.find((i) => i.id === "suite");
  const suiteLine = lines.data?.find((l) => l.itemId === "suite");
  const contratadas = suiteItem?.quantity ?? null;
  const faturadas = suiteLine?.billedQty ?? null;
  const emUso = suiteLine?.activeUsers ?? null;
  const temLicencas = contratadas != null && faturadas != null && emUso != null;

  const porTipo = TIPOS.map((t) => {
    const list = (cr?.occurrences ?? []).filter((o) => o.type === t.k);
    return { ...t, n: list.length, valor: list.reduce((acc, o) => acc + o.impact, 0) };
  });
  const maxTipo = Math.max(1, ...porTipo.map((t) => t.valor));

  return (
    <main className="w-full px-4 py-[18px] md:p-7">
      <div className="mb-5">
        <h1 className="m-0 text-[21px] font-semibold tracking-[-0.01em] md:text-2xl">Painel da carteira</h1>
        <p className="mt-1 max-w-[760px] text-[16px] text-tinta-fraca">
          {pctA != null ? (
            <>
              <b className="text-tinta">
                {classeA.length} de {data.length} contratos somam {number(Math.round(pctA))}% do gasto.
              </b>{" "}
              Conferindo só esses {classeA.length}, você cobre {pctA >= 74 && pctA <= 78 ? "3/4" : `${number(Math.round(pctA))}%`} do
              dinheiro.
            </>
          ) : (
            "Carregando a carteira…"
          )}
        </p>
      </div>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi rot="Gasto anual em software" val={contracts.isLoading ? "—" : moneyInt(total)} meta={`${data.length} contratos`} />
        <Kpi
          rot={`Em jogo no ${demo?.number ?? "042/2026"}`}
          val={temConferencia ? money(cr!.totals.atStake) : "—"}
          cor="var(--falta)"
          meta={temConferencia ? `${cr!.occurrences.length} ocorrências` : "envie a NF e as entregas para conferir"}
        />
        <Kpi
          rot="Licenças pagas sem uso"
          val={semUso.length ? `${money(semUsoMes)}` : "—"}
          cor="var(--alerta)"
          meta={semUso.length ? "por mês · contratadas sem uso" : "aparece depois da conferência"}
        />
        <Kpi
          rot="Renovação mais próxima"
          val={proxima ? inMonths(proxima.renewsAt) : "—"}
          meta={proxima ? `${proxima.supplier} · ${proxima.number}` : undefined}
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3.5 xl:grid-cols-[1.5fr_1fr]">
        {/* Licenças pagas × em uso */}
        <section className="card" style={{ containerType: "normal" }}>
          <h2 className="m-0 text-[16px] font-semibold">Licenças: pagas × em uso</h2>
          <p className="mb-3 mt-1 text-[14px] text-tinta-fraca">
            Suíte de produtividade · contrato {demo?.number ?? "042/2026"}
          </p>
          {temLicencas ? (
            <>
              <div className="flex h-9 w-full overflow-hidden rounded-lg border border-filete" role="img"
                aria-label={`${emUso} em uso, ${contratadas! - emUso!} contratadas sem uso, ${faturadas! - contratadas!} faturadas além do contrato`}>
                <div className="grid place-items-center text-[13px] font-semibold text-white" style={{ width: `${(emUso! / faturadas!) * 100}%`, background: "var(--dinheiro)" }}>
                  {emUso} em uso
                </div>
                <div className="grid place-items-center text-[13px] font-semibold" style={{ width: `${((contratadas! - emUso!) / faturadas!) * 100}%`, background: "var(--alerta-leve)", color: "var(--alerta)" }}>
                  {contratadas! - emUso!}
                </div>
                {faturadas! > contratadas! && (
                  <div className="grid place-items-center text-[13px] font-semibold" style={{ width: `${((faturadas! - contratadas!) / faturadas!) * 100}%`, background: "var(--falta-leve)", color: "var(--falta)" }}>
                    {faturadas! - contratadas!}
                  </div>
                )}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
                <span><b className="num text-dinheiro">{emUso}</b> em uso</span>
                <span><b className="num text-alerta">{contratadas! - emUso!}</b> contratadas sem uso</span>
                {faturadas! > contratadas! && (
                  <span><b className="num text-falta">{faturadas! - contratadas!}</b> faturadas além do contrato</span>
                )}
                <span className="text-tinta-fraca">
                  <span className="num">{faturadas}</span> faturadas · <span className="num">{contratadas}</span> contratadas
                </span>
              </div>
              {opp.length > 0 && (
                <ul className="m-0 mt-3 list-none border-t border-filete p-0 pt-2 text-[14px]">
                  {opp.filter((o) => o.rule !== "sem_uso").map((o) => (
                    <li key={o.id} className="flex justify-between gap-3 py-1">
                      <span>{o.title}</span>
                      <span className="num shrink-0 text-tinta-fraca">{o.monthlyValue != null ? `${money(o.monthlyValue)}/mês` : "sem valor"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="m-0 text-tinta-fraca">— Envie a NF e as entregas do 042 na aba Faturado × entregue para ver o uso das licenças.</p>
          )}
        </section>

        {/* Ocorrências por tipo */}
        <section className="card" style={{ containerType: "normal" }}>
          <h2 className="m-0 text-[16px] font-semibold">Ocorrências por tipo</h2>
          <p className="mb-3 mt-1 text-[14px] text-tinta-fraca">Contrato {demo?.number ?? "042/2026"} · clique para revisar</p>
          {temConferencia ? (
            <ul className="m-0 list-none p-0">
              {porTipo.filter((t) => t.n > 0).map((t) => (
                <li key={t.k}>
                  <Link href={`/contratos/${DEMO}?aba=ocorrencias`} className="block rounded-lg px-1 py-1.5 text-tinta no-underline hover:bg-superficie-2">
                    <div className="flex justify-between text-[14px]">
                      <span>{t.label} <span className="text-tinta-fraca">({t.n})</span></span>
                      <span className="num font-semibold text-falta">{money(t.valor)}</span>
                    </div>
                    <div className="barra mt-1"><i style={{ width: `${(t.valor / maxTipo) * 100}%`, background: "var(--falta)" }} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-tinta-fraca">— Ainda não há conferência do 042.</p>
          )}
        </section>
      </div>

      {/* Pareto */}
      {contracts.isLoading ? <Skeleton style={{ height: 300 }} /> : <AbcPareto contracts={data} highlightId={DEMO} title="Onde está o dinheiro (curva ABC)" />}

      {/* Renovações */}
      <section className="card" style={{ containerType: "normal" }}>
        <h2 className="m-0 text-[16px] font-semibold">Renovações nos próximos 6 meses</h2>
        <p className="mb-2 mt-1 text-[14px] text-tinta-fraca">Renegocie antes de renovar.</p>
        <ul className="m-0 list-none p-0">
          {em6.map((c: ContractSummary) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-filete py-2 text-[14px]">
              <span>
                <span className="num">{c.number}</span> · <b className="font-semibold">{c.supplier}</b> · classe {c.abcClass}
              </span>
              <span className="flex items-center gap-3">
                <span className="num text-tinta-fraca">{moneyInt(c.annualValue)}</span>
                <Chip tone={mesesAte(c.renewsAt) <= 2 ? "alerta" : "neutro"}>{inMonths(c.renewsAt)}</Chip>
              </span>
            </li>
          ))}
          {em6.length === 0 && <li className="text-tinta-fraca">Nenhuma renovação nos próximos 6 meses.</li>}
        </ul>
      </section>
    </main>
  );
}
