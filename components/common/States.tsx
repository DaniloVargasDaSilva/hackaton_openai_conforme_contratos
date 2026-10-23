"use client";

import { ApiClientError, errorMessage, isApiDown } from "@/lib/api-error";

// Estados de carregamento e erro comuns a todas as telas.

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skel ${className}`} style={{ height: 16, ...style }} />;
}

export function Spinner() {
  return <span className="spin" aria-hidden />;
}

export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const code = error instanceof ApiClientError ? error.code : null;
  const heading = title ?? (isApiDown(error) ? "API fora do ar" : "Não deu para carregar");
  return (
    <div role="alert" className="card" style={{ borderColor: "var(--falta-borda)", background: "var(--falta-leve)" }}>
      <div className="font-semibold text-falta">{heading}</div>
      <p className="mt-1 text-tinta-fraca">{errorMessage(error)}</p>
      <div className="mt-3 flex items-center gap-3">
        {onRetry && (
          <button className="btn btn-peq" onClick={onRetry}>
            Tentar de novo
          </button>
        )}
        {code && <span className="num text-[13px] text-tinta-tenue">código: {code}</span>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card text-center" style={{ padding: "32px 20px" }}>
      <div className="font-semibold">{title}</div>
      {children && <div className="mt-1 text-tinta-fraca">{children}</div>}
    </div>
  );
}
