"use client";

import { useMemo, useState } from "react";
import { Chip } from "@/components/common/Chips";
import type { ContractItem, InvoiceLine, InvoiceLinePatch } from "@/lib/contracts";
import type { Occurrence3 } from "@/lib/contracts-3vias";
import { amount, dateShort, money, number, pct } from "@/lib/format";
import { EditableCell } from "./EditableCell";

type Row = { item: ContractItem; line: InvoiceLine | undefined; occs: Occurrence3[] };
type Filtro = "todos" | "div" | "ok";
type OnEdit = (lineId: string, patch: InvoiceLinePatch) => Promise<void>;

const ICONES = {
  contratado: <path d="M4 1.5h5l3 3v10H4z" />,
  faturado: <path d="M3 1.5h10v13l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2z" />,
  entregue: (
    <>
      <path d="M1.5 4.5h8v7h-8zM9.5 7h3l2 2.5v2h-5" />
      <circle cx="4.5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
    </>
  ),
};

function Th({ icon, children, className }: { icon?: keyof typeof ICONES; children: React.ReactNode; className?: string }) {
  return (
    <th className={className}>
      {icon && (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          {ICONES[icon]}
        </svg>
      )}
      {children}
    </th>
  );
}

const Vazio = () => <span className="text-tinta-tenue">—</span>;
const Sub = ({ children }: { children: React.ReactNode }) => (
  <span className="block text-[13px] leading-snug text-tinta-fraca" style={{ fontFamily: "var(--fonte-ui)", fontWeight: 400 }}>
    {children}
  </span>
);

/* ---------- Contratado: vem do ContractItem, só formatado ---------- */
function Contratado({ item }: { item: ContractItem }) {
  switch (item.kind) {
    case "recorrente":
      return (
        <span className="num">
          {number(item.quantity)} × {amount(item.unitPrice)}
        </span>
      );
    case "consumo":
      return (
        <span className="num">
          {number(item.franchiseQty)} mi + {amount(item.overageUnitPrice)}/mi
        </span>
      );
    case "entrega":
      return (
        <>
          <span className="num">até {dateShort(item.dueDate)}</span>
          {item.unitPrice != null && <Sub>{money(item.unitPrice)}</Sub>}
        </>
      );
    case "nivel_servico":
      return <span className="num">≥ {pct(item.slaMinPct)}</span>;
  }
}

/* ---------- Faturado: da InvoiceLine, com célula editável onde há valor ---------- */
function Faturado({ item, line, onEdit }: { item: ContractItem; line: InvoiceLine | undefined; onEdit: OnEdit }) {
  if (!line) return <Vazio />;
  if (item.kind === "nivel_servico") {
    return <span className="num">crédito {amount(line.creditApplied)}</span>;
  }
  const { billedQty: q, billedUnitPrice: p } = line;
  if (q == null && p == null) return <Vazio />;
  return (
    <span className="num inline-flex items-center gap-x-1 whitespace-nowrap">
      {q != null && (
        <EditableCell
          type="number"
          value={q}
          label="quantidade faturada"
          display={`${number(q)}${item.kind === "consumo" ? " mi" : ""}`}
          onSave={(v) => onEdit(line.id, { billedQty: Number(v) })}
        />
      )}
      {q != null && p != null && <span aria-hidden>×</span>}
      {p != null && (
        <EditableCell
          type="number"
          value={p}
          label="preço unitário faturado"
          display={amount(p)}
          onSave={(v) => onEdit(line.id, { billedUnitPrice: Number(v) })}
        />
      )}
    </span>
  );
}

/* ---------- Entregue: da InvoiceLine (uso, medição, data, disponibilidade) ---------- */
function Entregue({ item, line, onEdit }: { item: ContractItem; line: InvoiceLine | undefined; onEdit: OnEdit }) {
  if (!line) return <Vazio />;
  const parts: React.ReactNode[] = [];
  if (line.activeUsers != null)
    parts.push(
      <EditableCell
        key="u"
        type="number"
        value={line.activeUsers}
        label="usuários em uso"
        display={`${number(line.activeUsers)} em uso`}
        onSave={(x) => onEdit(line.id, { activeUsers: Number(x) })}
      />,
    );
  if (line.measuredQty != null)
    parts.push(
      <EditableCell
        key="q"
        type="number"
        value={line.measuredQty}
        label="quantidade medida"
        display={`${number(line.measuredQty)}${item.kind === "consumo" ? " mi" : ""}`}
        onSave={(x) => onEdit(line.id, { measuredQty: Number(x) })}
      />,
    );
  if (line.deliveredAt != null)
    parts.push(
      <EditableCell
        key="d"
        type="date"
        value={line.deliveredAt}
        label="data de entrega"
        display={dateShort(line.deliveredAt)}
        onSave={(x) => onEdit(line.id, { deliveredAt: String(x) })}
      />,
    );
  if (line.measuredPct != null)
    parts.push(
      <EditableCell
        key="p"
        type="number"
        value={line.measuredPct}
        label="disponibilidade medida"
        display={pct(line.measuredPct)}
        onSave={(x) => onEdit(line.id, { measuredPct: Number(x) })}
      />,
    );
  if (parts.length === 0) return <Vazio />;
  return (
    <span className="num inline-flex flex-wrap items-center gap-x-2">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {i > 0 && (
            <span aria-hidden className="text-tinta-tenue">
              ·
            </span>
          )}
          {p}
        </span>
      ))}
    </span>
  );
}

/* ---------- Diferença: SOMENTE o que a API devolveu nas ocorrências do item ---------- */
function Diferenca({ row, align }: { row: Row; align: "dir" | "esq" }) {
  if (!row.line) return <Vazio />;
  if (row.occs.length === 0) return <Chip tone="ok">confere</Chip>;
  return (
    <div className={align === "dir" ? "text-right" : ""}>
      {row.occs.map((o) => (
        <div key={o.id} className="mb-1 last:mb-0">
          {o.impact > 0 && <span className="num font-semibold text-falta">{money(o.impact)}</span>}
          <Sub>{o.title}</Sub>
        </div>
      ))}
    </div>
  );
}

const TD: React.CSSProperties = { padding: "11px 10px", fontSize: 14 };

export function ThreeWayTable({
  items,
  lines,
  occurrences,
  atStake,
  competence,
  onEdit,
  savingLineId,
}: {
  items: ContractItem[];
  lines: InvoiceLine[];
  occurrences: Occurrence3[];
  atStake: number; // check.totals.atStake, vindo da API
  competence?: string | null; // "out/2026"
  onEdit: OnEdit;
  savingLineId: string | null;
}) {
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const semLinhas = lines.length === 0;

  const rows = useMemo<Row[]>(() => {
    const all = items.map((item) => ({
      item,
      line: lines.find((l) => l.itemId === item.id),
      occs: occurrences.filter((o) => o.itemId === item.id),
    }));
    return semLinhas ? all : all.filter((r) => r.line);
  }, [items, lines, occurrences, semLinhas]);

  // Contagens de exibição dos filtros (não é cálculo de divergência: só conta quem tem ocorrência).
  const nDiv = rows.filter((r) => r.occs.length > 0).length;
  const nOk = rows.length - nDiv;
  const ativo: Filtro = semLinhas ? "todos" : (filtro ?? (nDiv > 0 ? "div" : "todos"));
  const visiveis = rows.filter((r) => (ativo === "div" ? r.occs.length > 0 : ativo === "ok" ? r.occs.length === 0 : true));
  const saving = savingLineId != null;

  const pilulas: { id: Filtro; label: string; n: number }[] = [
    { id: "todos", label: "Todos", n: rows.length },
    { id: "div", label: "Divergentes", n: nDiv },
    { id: "ok", label: "Conferidos", n: nOk },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {semLinhas ? (
          <span className="text-[14px] text-tinta-fraca">Itens do contrato</span>
        ) : (
          <div className="filtros" role="group" aria-label="Filtrar itens">
            {pilulas.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pilula ${ativo === p.id ? "on" : ""}`}
                aria-pressed={ativo === p.id}
                onClick={() => setFiltro(p.id)}
              >
                {p.label} <b>{p.n}</b>
              </button>
            ))}
          </div>
        )}
        {competence && <span className="text-[13px] text-tinta-tenue">Competência {competence}</span>}
      </div>

      {semLinhas && (
        <p className="mb-3 rounded-lg border border-alerta-borda bg-alerta-leve px-3 py-2 text-[14px] text-alerta">
          Envie a NF e o CSV de entregas para conferir.
        </p>
      )}

      {/* Tela larga: tabela */}
      <div className="hidden overflow-hidden rounded-xl border border-filete md:block">
        <table className="tab">
          <thead>
            <tr>
              <Th>Item</Th>
              <Th icon="contratado">Contratado</Th>
              <Th icon="faturado">Faturado</Th>
              <Th icon="entregue">Entregue</Th>
              <Th className="dir">Diferença</Th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((r) => (
              <tr key={r.item.id} className={r.occs.length > 0 ? "div" : undefined}>
                <td style={TD}>
                  <b className="font-semibold">{r.item.name}</b>
                  <Sub>{r.item.clauseRefs.join(" · ")}</Sub>
                </td>
                <td style={TD}>
                  <Contratado item={r.item} />
                </td>
                <td style={TD}>
                  <Faturado item={r.item} line={r.line} onEdit={onEdit} />
                </td>
                <td style={TD}>
                  <Entregue item={r.item} line={r.line} onEdit={onEdit} />
                </td>
                <td className="dir" style={TD}>
                  <Diferenca row={r} align="dir" />
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-tinta-fraca">
                  Nenhum item nesta visão.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="rodape-tab flex justify-between gap-3">
          <span>{semLinhas ? `${rows.length} itens do contrato` : `${visiveis.length} de ${rows.length} itens nesta visão`}</span>
          {saving ? (
            <span aria-live="polite">reconferindo…</span>
          ) : (
            !semLinhas && (
              <span>
                A revisar <b className="num text-falta">{money(atStake)}</b>
              </span>
            )
          )}
        </div>
      </div>

      {/* Celular: um cartão por item */}
      <div className="md:hidden">
        {visiveis.map((r) => {
          const div = r.occs.length > 0;
          return (
            <div
              key={r.item.id}
              className="mb-2.5 rounded-[10px] border p-3.5"
              style={
                div
                  ? { background: "var(--falta-leve)", borderColor: "var(--falta-borda)", borderLeft: "3px solid var(--falta)" }
                  : { background: "var(--superficie)", borderColor: "var(--filete)" }
              }
            >
              <div className="flex items-start justify-between gap-3">
                <b className="font-semibold">
                  {r.item.name} <span className="font-normal text-tinta-fraca">· {r.item.clauseRefs.join(" · ")}</span>
                </b>
                {!div && r.line && <Chip tone="ok">confere</Chip>}
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2 text-[14px]">
                <div>
                  <Sub>Contratado</Sub>
                  <Contratado item={r.item} />
                </div>
                <div>
                  <Sub>Faturado</Sub>
                  <Faturado item={r.item} line={r.line} onEdit={onEdit} />
                </div>
                <div>
                  <Sub>Entregue</Sub>
                  <Entregue item={r.item} line={r.line} onEdit={onEdit} />
                </div>
              </div>
              {div && (
                <div className="mt-2.5 border-t border-falta-borda pt-2">
                  <Diferenca row={r} align="esq" />
                </div>
              )}
            </div>
          );
        })}
        {visiveis.length === 0 && <p className="py-4 text-center text-tinta-fraca">Nenhum item nesta visão.</p>}
        <div className="text-center text-[13px] text-tinta-tenue" aria-live="polite">
          {saving ? (
            "reconferindo…"
          ) : (
            <>
              {visiveis.length} de {rows.length} itens nesta visão
              {!semLinhas && (
                <>
                  {" · a revisar "}
                  <b className="num text-falta">{money(atStake)}</b>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
