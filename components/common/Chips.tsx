import type { AbcClass } from "@/lib/contracts";
import type { z } from "zod";

// Chips do design (.chip + trio semântico). Cor nunca é decoração:
// falta = divergência, alerta = pendente/atenção, ok = confere/confirmado.
type Tone = "falta" | "alerta" | "ok" | "neutro";

export function Chip({ tone = "neutro", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span className={`chip chip-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function AbcChip({ value }: { value: z.infer<typeof AbcClass> }) {
  return <Chip>classe {value}</Chip>;
}

const statusTone = { pendente: "alerta", confirmada: "ok", descartada: "neutro" } as const;
const statusLabel = { pendente: "Pendente", confirmada: "Confirmada", descartada: "Descartada" } as const;

export function StatusChip({ status }: { status: keyof typeof statusTone }) {
  return <Chip tone={statusTone[status]}>{statusLabel[status]}</Chip>;
}

// Origem da extração/relatório: ai e seed neutros, fallback/template em alerta.
const sourceInfo = {
  ai: { tone: "neutro", label: "origem: IA" },
  seed: { tone: "neutro", label: "origem: seed" },
  fallback: { tone: "alerta", label: "origem: modelo de referência (IA indisponível)" },
  template: { tone: "alerta", label: "origem: template" },
} as const;

export function SourceChip({ source }: { source: keyof typeof sourceInfo }) {
  const s = sourceInfo[source];
  return <Chip tone={s.tone}>{s.label}</Chip>;
}
