// Marca-texto do contrato. Funções puras: nada aqui calcula divergência.
import type { Clause } from "./contracts";

export type Mark = "forte" | "leve";
export type Segment = { text: string; mark: Mark | null };
export type Needle = { text: string; mark: Mark };

const PESO: Record<Mark, number> = { leve: 1, forte: 2 };

/** Colapsa espaços/quebras em um espaço e guarda o índice original de cada caractere. */
function normalize(text: string): { norm: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (chars.length > 0 && chars[chars.length - 1] !== " ") {
        chars.push(" ");
        map.push(i);
      }
    } else {
      chars.push(ch);
      map.push(i);
    }
  }
  return { norm: chars.join(""), map };
}

/** Tira reticências e aspas das pontas do trecho citado. */
function cleanNeedle(raw: string): string {
  let s = normalize(raw).norm.trim();
  s = s.replace(/^(?:…|\.{3}|["“”'])+/, "").replace(/(?:…|\.{3}|["“”'])+$/, "");
  return s.trim();
}

/** Acha o trecho no texto ignorando diferenças de espaço. Devolve [início, fim) no texto original. */
export function findRange(text: string, needle: string): [number, number] | null {
  const n = cleanNeedle(needle);
  if (!n) return null;
  const { norm, map } = normalize(text);
  let at = norm.indexOf(n);
  if (at < 0 && norm.toLowerCase().length === norm.length) {
    at = norm.toLowerCase().indexOf(n.toLowerCase());
  }
  if (at < 0) return null;
  return [map[at], map[at + n.length - 1] + 1];
}

/** Divide o texto em segmentos marcados. Trecho não encontrado é ignorado; forte vence leve. */
export function segmentText(text: string, needles: Needle[]): Segment[] {
  if (!text) return [];
  const marks = new Uint8Array(text.length);
  for (const nd of needles) {
    const r = findRange(text, nd.text);
    if (!r) continue;
    for (let i = r[0]; i < r[1]; i++) marks[i] = Math.max(marks[i], PESO[nd.mark]);
  }
  const out: Segment[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      const m = marks[start];
      out.push({ text: text.slice(start, i), mark: m === 2 ? "forte" : m === 1 ? "leve" : null });
      start = i;
    }
  }
  return out;
}

/** Texto de uma cláusula pelo número ("2.1"), vindo de `clauses` ou da linha do contrato. */
function clauseText(text: string, clauses: Clause[], ref: string): string | null {
  const strip = (s: string) => (s.trimStart().startsWith(ref) ? s.trimStart().slice(ref.length).trim() : s.trim());
  const c = clauses.find((x) => x.ref === ref);
  if (c) {
    const t = strip(c.text);
    if (t && findRange(text, t)) return t;
  }
  const line = text.split(/\r?\n/).find((l) => l.trimStart().startsWith(`${ref} `));
  return line ? strip(line) : null;
}

/**
 * Quais trechos marcar para o item selecionado.
 * - quote achado: forte nele; leve nas outras cláusulas de clauseRefs.
 * - quote não achado (ou vazio): forte em cada cláusula de clauseRefs.
 */
export function buildNeedles(text: string, clauses: Clause[], quote: string | null, clauseRefs: string[]): Needle[] {
  const refTexts = clauseRefs.map((r) => clauseText(text, clauses, r)).filter((t): t is string => !!t);
  const qRange = quote ? findRange(text, quote) : null;
  if (quote && qRange) {
    const needles: Needle[] = [{ text: quote, mark: "forte" }];
    for (const t of refTexts) {
      const r = findRange(text, t);
      if (r && (r[1] <= qRange[0] || r[0] >= qRange[1])) needles.push({ text: t, mark: "leve" });
    }
    return needles;
  }
  return refTexts.map((t) => ({ text: t, mark: "forte" as const }));
}
