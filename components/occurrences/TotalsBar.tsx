import { money } from "@/lib/format";

// Totais vêm prontos de check.totals; aqui só se exibe.
export function TotalsBar({
  count,
  pending,
  atStake,
  confirmed,
}: {
  count: number;
  pending: number;
  atStake: number;
  confirmed: number;
}) {
  return (
    <div className="mb-[22px] grid max-w-[720px] grid-cols-1 gap-3.5 sm:grid-cols-3">
      <div className="card">
        <div className="card-rot">Ocorrências</div>
        <div className="card-val">{count}</div>
        <div className="card-meta">{pending === 1 ? "1 pendente" : `${pending} pendentes`}</div>
      </div>
      <div className="card">
        <div className="card-rot">Em jogo</div>
        <div className="card-val text-falta" style={{ fontSize: 34 }}>
          {money(atStake)}
        </div>
        <div className="card-meta">soma das ocorrências</div>
      </div>
      <div className="card">
        <div className="card-rot">Confirmado</div>
        <div className="card-val text-dinheiro" style={{ fontSize: 34 }}>
          {money(confirmed)}
        </div>
        <div className="card-meta">{confirmed === 0 ? "nada revisado ainda" : "já revisado e confirmado"}</div>
      </div>
    </div>
  );
}
