// Dan: curva ABC (80/20) da carteira.
// Ordena por valor anual. O % acumulado inclui o próprio contrato.
// A: até 80% · B: até 95% · C: o resto.

export type AbcClass = "A" | "B" | "C";

export function classifyAbc(contracts: { id: string; annualValue: number }[]) {
  const total = contracts.reduce((sum, c) => sum + c.annualValue, 0);
  const sorted = [...contracts].sort((a, b) => b.annualValue - a.annualValue);

  const result = new Map<string, { abcClass: AbcClass; cumulativePct: number }>();
  let running = 0;

  for (const contract of sorted) {
    running += contract.annualValue;
    const cumulativePct = total > 0 ? Math.round((running / total) * 10000) / 100 : 0;
    const abcClass: AbcClass = cumulativePct <= 80 ? "A" : cumulativePct <= 95 ? "B" : "C";
    result.set(contract.id, { abcClass, cumulativePct });
  }

  return result;
}
