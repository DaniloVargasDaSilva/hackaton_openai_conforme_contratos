"use client";

import { useEffect } from "react";

// Painel lateral (gaveta à direita). No celular ocupa a tela inteira.
export function SidePanel({
  open,
  onClose,
  title,
  children,
  width = 760,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0" style={{ background: "rgba(20,18,15,.35)" }} onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className="absolute top-0 right-0 flex h-full w-full flex-col bg-superficie"
        style={{ maxWidth: width, boxShadow: "var(--sombra-painel)" }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-filete px-6 py-4">
          <div className="min-w-0 flex-1">{title}</div>
          <button className="btn btn-peq" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>
  );
}
