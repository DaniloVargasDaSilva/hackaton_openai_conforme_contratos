"use client";

import type { ContractSummary } from "@/lib/contracts";
import { moneyInt, pct } from "@/lib/format";

export const ABC_EXPLICACAO =
  "Curva ABC: A = os poucos contratos que somam ~80% do gasto (confira primeiro) · B = os próximos ~15% · C = os ~5% restantes";

const W = 960;
const H = 270;
const PAD = { top: 30, right: 44, bottom: 46, left: 16 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

// Pareto da carteira: barras do valor anual (ordem da API) + linha do % acumulado.
// Classe e % acumulado vêm prontos da API; aqui só se desenha.
export function AbcPareto({ contracts, highlightId }: { contracts: ContractSummary[]; highlightId?: string }) {
  if (contracts.length === 0) return null;
  const max = Math.max(...contracts.map((c) => c.annualValue));
  const step = PLOT_W / contracts.length;
  const barW = Math.min(56, step * 0.62);
  const x = (i: number) => PAD.left + step * i + step / 2;
  const yVal = (v: number) => PAD.top + PLOT_H * (1 - v / max);
  const yPct = (p: number) => PAD.top + PLOT_H * (1 - p / 100);

  // Faixas contíguas por classe (A, B, C) na ordem em que aparecem.
  const bands: { k: string; from: number; to: number }[] = [];
  contracts.forEach((c, i) => {
    const last = bands[bands.length - 1];
    if (last && last.k === c.abcClass) last.to = i;
    else bands.push({ k: c.abcClass, from: i, to: i });
  });
  const bandFill: Record<string, string> = { A: "var(--acento-leve)", B: "var(--superficie-2)", C: "var(--canvas)" };

  const line = contracts.map((c, i) => `${x(i)},${yPct(c.cumulativePct)}`).join(" ");

  return (
    <section className="card mb-6" style={{ padding: "16px 18px 12px", containerType: "normal" }} aria-label="Curva ABC da carteira">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[16px] font-semibold">Curva ABC da carteira</h2>
        <span className="text-[13px] text-tinta-fraca">
          barras: valor anual · linha: % acumulado do gasto
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-[300px] w-full min-w-[640px] max-sm:h-auto" role="img" aria-label={ABC_EXPLICACAO}>
          {bands.map((b) => {
            const x0 = PAD.left + step * b.from;
            const x1 = PAD.left + step * (b.to + 1);
            return (
              <g key={b.k}>
                <rect x={x0} y={PAD.top - 24} width={x1 - x0} height={PLOT_H + 24} fill={bandFill[b.k]} />
                <text x={x0 + 8} y={PAD.top - 8} fontSize={13} fontWeight={600} fill="var(--tinta-fraca)">
                  Classe {b.k}
                </text>
                {b.from > 0 && (
                  <line x1={x0} x2={x0} y1={PAD.top - 24} y2={PAD.top + PLOT_H} stroke="var(--filete-forte)" strokeDasharray="4 4" />
                )}
              </g>
            );
          })}

          {/* marcas de 80% e 95% no eixo do acumulado */}
          {[80, 95].map((p) => (
            <g key={p}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yPct(p)} y2={yPct(p)} stroke="var(--filete-forte)" strokeDasharray="2 4" />
              <text x={W - PAD.right + 6} y={yPct(p) + 4} fontSize={12} fill="var(--tinta-fraca)">
                {p}%
              </text>
            </g>
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + PLOT_H} y2={PAD.top + PLOT_H} stroke="var(--filete-forte)" />

          {contracts.map((c, i) => {
            const on = c.id === highlightId;
            const y = yVal(c.annualValue);
            return (
              <g key={c.id}>
                <title>{`${c.number} · ${c.supplier}: ${moneyInt(c.annualValue)} · ${pct(c.cumulativePct)} acumulado · classe ${c.abcClass}`}</title>
                <rect
                  x={x(i) - barW / 2}
                  y={y}
                  width={barW}
                  height={PAD.top + PLOT_H - y}
                  rx={3}
                  fill={on ? "var(--acento)" : "var(--tinta-tenue)"}
                  opacity={on ? 1 : 0.55}
                />
                <text
                  x={x(i)}
                  y={PAD.top + PLOT_H + 18}
                  fontSize={12}
                  textAnchor="middle"
                  fill={on ? "var(--acento)" : "var(--tinta-fraca)"}
                  fontWeight={on ? 700 : 500}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {c.number}
                </text>
                {on && (
                  <text x={x(i)} y={PAD.top + PLOT_H + 36} fontSize={12} textAnchor="middle" fill="var(--acento)" fontWeight={600}>
                    em conferência
                  </text>
                )}
              </g>
            );
          })}

          <polyline points={line} fill="none" stroke="var(--tinta)" strokeWidth={2} />
          {contracts.map((c, i) => (
            <circle key={c.id} cx={x(i)} cy={yPct(c.cumulativePct)} r={3.5} fill="var(--superficie)" stroke="var(--tinta)" strokeWidth={2} />
          ))}
        </svg>
      </div>
      <p className="m-0 mt-2 text-[13px] text-tinta-fraca">{ABC_EXPLICACAO}</p>
    </section>
  );
}
