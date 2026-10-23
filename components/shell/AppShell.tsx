"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { usingMocks } from "@/lib/api-client";
import { useApiStatus } from "@/hooks/useApiStatus";
import { ReviewerField } from "./ReviewerField";
import { ResetDataButton } from "./ResetDataButton";

const DEMO = "/contratos/c-042";

// Barra de topo do design (design/conforme/tokens/base.css → .topo).
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const aba = useSearchParams().get("aba");
  const { down } = useApiStatus();

  const nav = [
    { href: "/", label: "Carteira", on: path === "/" },
    { href: "/painel", label: "Painel", on: path === "/painel" },
    { href: `${DEMO}?aba=contrato`, label: "Contratos", on: path.startsWith("/contratos") && aba !== "ocorrencias" },
    { href: `${DEMO}?aba=ocorrencias`, label: "Ocorrências", on: path.startsWith("/contratos") && aba === "ocorrencias" },
  ];

  return (
    <div className="min-h-screen">
      <header className="topo sticky top-0 z-30 max-sm:!gap-3 max-sm:!px-4">
        <Link href="/" className="marca no-underline">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático da marca */}
          <img src="/brand/conforme-logo.svg" alt="Conforme" width={92} height={22} />
        </Link>
        <nav className="nav max-sm:!hidden">
          {nav.map((n) => (
            <Link key={n.label} href={n.href} className={n.on ? "on" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="topo-dir">
          <span className="max-md:hidden">Rota Sul Logística</span>
          {usingMocks && <span className="chip chip-neutro">demo</span>}
          {!usingMocks && <ResetDataButton />}
          <ReviewerField />
        </div>
      </header>
      {down && (
        <div role="alert" className="chip-falta border-b px-7 py-2 text-[14px] font-semibold">
          API fora do ar · tentando de novo. Os dados na tela podem estar desatualizados.
        </div>
      )}
      {children}
    </div>
  );
}
