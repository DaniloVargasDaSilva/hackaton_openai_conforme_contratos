import { money, number } from "@/lib/format";
import type { ContractItem, InvoiceLine, Opportunity } from "@/lib/contracts";

// O título da oportunidade começa pela quantidade ("6 licenças atribuídas a…"); só leitura de texto.
const leadingCount = (op?: Opportunity) => op?.title.match(/^\s*(\d+)/)?.[1] ?? null;

// Oportunidades de economia por uso. Tudo vem do back; a barra é só exibição.
export function UsageRules({
  opportunities,
  items,
  lines,
}: {
  opportunities: Opportunity[];
  items: ContractItem[];
  lines: InvoiceLine[];
}) {
  if (opportunities.length === 0) return null;

  const suiteItem = items.find((i) => i.id === "suite");
  const suiteLine = lines.find((l) => l.itemId === "suite");
  const active = suiteLine?.activeUsers ?? null;
  const total = suiteItem?.quantity ?? null;
  const showBar = active != null && total != null && total > 0;
  const pct = showBar ? Math.min(100, Math.max(0, (active / total) * 100)) : 0;

  const semUso = opportunities.find((o) => o.itemId === "suite" && o.rule === "sem_uso");
  const desligados = opportunities.find((o) => o.itemId === "suite" && o.rule === "desligados");
  const monthly = (op?: Opportunity) =>
    op && op.monthlyValue != null ? (
      <>
        {" · "}
        <span className="num">{money(op.monthlyValue)}</span>/mês
      </>
    ) : null;

  return (
    <section
      className="mt-[22px] overflow-hidden rounded-xl border border-filete bg-superficie"
      aria-label="Regras de utilização"
    >
      <div
        className="border-b border-filete px-4 py-2.5"
        style={{ borderLeft: "3px solid var(--filete-forte)" }}
      >
        <h3 className="m-0 text-[13px] font-semibold uppercase tracking-[.06em] text-tinta-fraca">
          Regras de utilização
        </h3>
        <p className="m-0 mt-0.5 text-[13px] text-tinta-tenue">não são divergência: são oportunidades de economia</p>
      </div>
      <div className="p-4">
        {showBar && (
          <div className="mb-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <b className="font-semibold">{suiteItem?.name ?? "Suíte"}</b>
              <span>
                <b className="num text-xl">{number(active)}</b>{" "}
                <span className="text-tinta-fraca">de {number(total)} licenças em uso</span>
              </span>
            </div>
            <div
              className="barra"
              style={{ height: 12 }}
              role="img"
              aria-label={`${number(active)} de ${number(total)} licenças em uso`}
            >
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-[14px] sm:grid-cols-3">
              <div>
                <b className="num">{number(active)}</b>
                <div className="text-[13px] text-tinta-fraca">em uso</div>
              </div>
              <div>
                <b className="num">{leadingCount(semUso) ?? number(total - active)}</b>
                <div className="text-[13px] text-tinta-fraca">sem uso{monthly(semUso)}</div>
              </div>
              <div>
                <b className="num">{leadingCount(desligados) ?? "—"}</b>
                <div className="text-[13px] text-tinta-fraca">de desligados{monthly(desligados)}</div>
              </div>
            </div>
          </div>
        )}

        <ul className="m-0 list-none divide-y divide-filete p-0">
          {opportunities.map((op) => (
            <li key={op.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 text-[14px]">
                <b className="font-semibold">{op.title}</b>
                <div className="text-tinta-fraca">{op.detail}</div>
              </div>
              <div className="num text-[14px] font-semibold">
                {op.monthlyValue != null ? (
                  <>
                    {money(op.monthlyValue)}
                    <span className="font-normal text-tinta-fraca">/mês</span>
                  </>
                ) : (
                  <span className="font-normal text-tinta-tenue">sem valor</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
