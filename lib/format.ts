// Formatação de exibição. Nada aqui calcula divergência.

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlInt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const dec2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** R$ 4.644,00 */
export const money = (v: number | null | undefined) => (v == null ? "—" : brl.format(v));
/** R$ 1.550.000 (sem centavos, para cards grandes) */
export const moneyInt = (v: number | null | undefined) => (v == null ? "—" : brlInt.format(v));
/** 62,00 (valor sem "R$", para células de tabela) */
export const amount = (v: number | null | undefined) => (v == null ? "—" : dec2.format(v));
/** 1.234 ou 98,9 */
export const number = (v: number | null | undefined) => (v == null ? "—" : num.format(v));
/** 98,9% */
export const pct = (v: number | null | undefined) => (v == null ? "—" : `${num.format(v)}%`);

/** 2026-10-27 → 27/10/2026 */
export function date(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** 2026-10-27 → 27/10 */
export function dateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** ISO completo → 23/10 13:52 */
export function dateTime(iso: string): string {
  const dt = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

/** "em 10 meses" / "em 2 meses" / "este mês" / "vencido" */
export function inMonths(iso: string, today = new Date()): string {
  const [y, m] = iso.split("-").map(Number);
  const diff = (y - today.getFullYear()) * 12 + (m - 1 - today.getMonth());
  if (diff < 0) return "vencido";
  if (diff === 0) return "este mês";
  return diff === 1 ? "em 1 mês" : `em ${diff} meses`;
}

/** 2026-10 → out/2026 */
export function competence(ym: string): string {
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [y, m] = ym.split("-").map(Number);
  return `${meses[m - 1]}/${y}`;
}
