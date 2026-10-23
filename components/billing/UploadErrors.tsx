import type { UploadError } from "@/lib/contracts-3vias";

// Erros de validação do arquivo: "Linha N: mensagem", ou só a mensagem quando é do arquivo todo.
export function UploadErrors({ errors }: { errors: UploadError[] }) {
  if (errors.length === 0) return null;
  const shown = errors.slice(0, 6);
  const rest = errors.length - shown.length;
  return (
    <ul
      role="alert"
      className="mt-2 list-none space-y-1 rounded-lg border border-falta-borda bg-falta-leve px-3 py-2 text-[13px] text-falta"
    >
      {shown.map((e, i) => (
        <li key={i}>{e.row == null ? e.message : `Linha ${e.row}: ${e.message}`}</li>
      ))}
      {rest > 0 && <li>e mais {rest} problema(s)</li>}
    </ul>
  );
}
