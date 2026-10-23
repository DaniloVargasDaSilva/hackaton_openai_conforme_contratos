// Contrato (/contratos/[id]) — abas: contrato | faturado | ocorrências | relatório — Felipe
import { ContractWorkspace } from "@/components/contract/ContractWorkspace";

export default async function ContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContractWorkspace contractId={id} />;
}
