"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { usingMocks } from "@/lib/api-client";
import { useApiStatus } from "@/hooks/useApiStatus";
import { useMainContractId } from "@/hooks/queries";
import { ReviewerField } from "./ReviewerField";
import { ResetDataButton } from "./ResetDataButton";

// Barra de topo do design (design/conforme/tokens/base.css → .topo).
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const aba = useSearchParams().get("aba");
  const { down } = useApiStatus();
  const mainId = useMainContractId();
  // Sem contrato (banco vazio ou depois de "Resetar dados") os atalhos levam à Carteira, não a uma página 404.
  const DEMO = mainId ? `/contratos/${mainId}` : "/";

  const nav = [
    { href: "/", label: "Carteira", on: path === "/" },
    { href: "/painel", label: "Painel", on: path === "/painel" },
    { href: mainId ? `${DEMO}?aba=contrato` : DEMO, label: "Contratos", on: path.startsWith("/contratos") && aba !== "ocorrencias" },
    { href: mainId ? `${DEMO}?aba=ocorrencias` : DEMO, label: "Ocorrências", on: path.startsWith("/contratos") && aba === "ocorrencias" },
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
