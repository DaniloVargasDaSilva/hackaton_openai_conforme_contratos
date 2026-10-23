"use client";

import { Fragment, useEffect, useMemo, useRef } from "react";
import type { Clause } from "@/lib/contracts";
import { buildNeedles, segmentText, type Segment } from "@/lib/highlight";

type Props = {
  text: string;
  clauses: Clause[];
  highlight: { quote: string | null; clauseRefs: string[] };
};

// Quebra os segmentos em linhas, mantendo a marca de trechos que atravessam quebras.
function toLines(segments: Segment[]): Segment[][] {
  const lines: Segment[][] = [[]];
  for (const seg of segments) {
    const parts = seg.text.split(/\r?\n/);
    parts.forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ text: p, mark: seg.mark });
    });
  }
  return lines;
}

function Piece({ seg }: { seg: Segment }) {
  if (seg.mark === "forte") {
    return (
      <span className="mt" data-mark="forte">
        {seg.text}
      </span>
    );
  }
  if (seg.mark === "leve") {
    return (
      <span
        data-mark="leve"
        style={{
          background: "color-mix(in srgb, var(--marca-texto) 45%, transparent)",
          boxShadow: "inset 0 -2px 0 color-mix(in srgb, var(--marca-texto-linha) 55%, transparent)",
          padding: "1px 0",
        }}
      >
        {seg.text}
      </span>
    );
  }
  return <>{seg.text}</>;
}

// Renderiza os segmentos de uma linha, com o número da cláusula ("2.1") em negrito.
function Line({ segs, boldLen }: { segs: Segment[]; boldLen: number }) {
  const out: React.ReactNode[] = [];
  let used = 0;
  segs.forEach((s, i) => {
    if (used >= boldLen) {
      out.push(<Piece key={i} seg={s} />);
    } else if (used + s.text.length <= boldLen) {
      out.push(
        <b key={i}>
          <Piece seg={s} />
        </b>,
      );
    } else {
      const cut = boldLen - used;
      out.push(
        <Fragment key={i}>
          <b>
            <Piece seg={{ text: s.text.slice(0, cut), mark: s.mark }} />
          </b>
          <Piece seg={{ text: s.text.slice(cut), mark: s.mark }} />
        </Fragment>,
      );
    }
    used += s.text.length;
  });
  return <>{out}</>;
}

export function ContractDocument({ text, clauses, highlight }: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const first = useRef(true);
  const refsKey = highlight.clauseRefs.join("|");

  const lines = useMemo(
    () => toLines(segmentText(text, buildNeedles(text, clauses, highlight.quote, highlight.clauseRefs))),
    // refsKey representa clauseRefs por valor
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, clauses, highlight.quote, refsKey],
  );

  // Ao trocar de item, rola até a primeira marca forte.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    rootRef.current?.querySelector('[data-mark="forte"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight.quote, refsKey]);

  let titleDone = false;
  return (
    <article
      ref={rootRef}
      className="folha px-5 py-6 text-[17px] leading-[1.7] sm:text-[18px] lg:px-12 lg:py-12"
      aria-label="Texto do contrato"
    >
      <div className="mb-2.5 font-[family-name:var(--fonte-ui)] text-[13px] uppercase tracking-[.08em] text-tinta-tenue">
        Texto do contrato
      </div>
      {lines.map((segs, i) => {
        const plain = segs.map((s) => s.text).join("");
        if (!plain.trim()) return null;
        if (/^CL[ÁA]USULA\b/i.test(plain.trim())) {
          return (
            <h3 key={i} className="mb-2 mt-[22px] text-[17px] font-semibold uppercase">
              <Line segs={segs} boldLen={0} />
            </h3>
          );
        }
        const ref = /^\s*(\d+\.\d+)\s/.exec(plain);
        if (ref) {
          return (
            <p key={i} className="mb-3.5" data-ref={ref[1]}>
              <Line segs={segs} boldLen={ref[0].trimEnd().length} />
            </p>
          );
        }
        if (!titleDone) {
          titleDone = true;
          return (
            <h2 key={i} className="mb-2 text-[20px] font-semibold">
              <Line segs={segs} boldLen={0} />
            </h2>
          );
        }
        return (
          <p key={i} className="mb-3.5 text-tinta-fraca">
            <Line segs={segs} boldLen={0} />
          </p>
        );
      })}
    </article>
  );
}
