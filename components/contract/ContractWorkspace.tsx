"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useContract, useCheck } from "@/hooks/queries";
import { AbcChip } from "@/components/common/Chips";
import { ErrorState, Skeleton } from "@/components/common/States";
import { ApiClientError } from "@/lib/api-error";
import { ContractTab } from "./ContractTab";
import { BillingTab } from "@/components/billing/BillingTab";
import { OccurrencesTab } from "@/components/occurrences/OccurrencesTab";
import { ReportTab } from "@/components/report/ReportTab";

export const TABS = [
  { id: "contrato", label: "Contrato" },
  { id: "faturado", label: "Faturado × entregue" },
  { id: "ocorrencias", label: "Ocorrências" },
  { id: "relatorio", label: "Relatório" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

// Aba ativa mora na URL (?aba=), para dar link direto a cada passo da demo.
export function useTab(): [TabId, (t: TabId) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const raw = params.get("aba");
  const tab = (TABS.find((t) => t.id === raw)?.id ?? "contrato") as TabId;
  const setTab = (t: TabId) => {
    const next = new URLSearchParams(params.toString());
    next.set("aba", t);
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };
  return [tab, setTab];
}

export function ContractWorkspace({ contractId }: { contractId: string }) {
  const [tab, setTab] = useTab();
  const contract = useContract(contractId);
  const check = useCheck(contractId);
  const pending = check.data?.totals.pendingCount;

  if (contract.error) {
    const notFound = contract.error instanceof ApiClientError && contract.error.status === 404;
    return (
      <main className="p-7">
        <ErrorState
          error={contract.error}
          title={notFound ? "Contrato não encontrado" : undefined}
          onRetry={notFound ? undefined : () => contract.refetch()}
        />
        <Link href="/" className="mt-4 inline-block">
          ‹ Voltar para a carteira
        </Link>
      </main>
    );
  }

  const c = contract.data?.contract;
  return (
    <>
      <div className="cab max-sm:!px-4">
        <Link href="/" className="cab-trilha block no-underline">
          ‹ Carteira
        </Link>
        {c ? (
          <h1 className="flex-wrap">
            Contrato {c.number} · {c.supplier} <AbcChip value={c.abcClass} />
          </h1>
        ) : (
          <Skeleton style={{ height: 28, width: 420 }} />
        )}
        <nav className="abas overflow-x-auto" role="tablist">
          {TABS.map((t) => (
            <a
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              href={`?aba=${t.id}`}
              className={`shrink-0 cursor-pointer ${tab === t.id ? "on" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                setTab(t.id);
              }}
            >
              {t.label}
              {t.id === "ocorrencias" && pending != null && pending > 0 && <span className="cont">{pending}</span>}
            </a>
          ))}
        </nav>
      </div>
      <main className="p-7 max-sm:p-4">
        {tab === "contrato" && <ContractTab contractId={contractId} />}
        {tab === "faturado" && <BillingTab contractId={contractId} />}
        {tab === "ocorrencias" && <OccurrencesTab contractId={contractId} />}
        {tab === "relatorio" && <ReportTab contractId={contractId} />}
      </main>
    </>
  );
}
