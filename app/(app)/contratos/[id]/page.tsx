// Contrato (/contratos/[id]) — abas: contrato | fatura | ocorrências | relatório — Felipe
export default async function ContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="p-6">Contrato {id} (em construção)</main>;
}
