// Textos fixos que o mock usa para enriquecer o expectedCheck do seed.
// Não é o motor: os números vêm do seed; aqui só entram títulos e evidências.
import type { Opportunity } from "../contracts";
import type { NfDocument, Occurrence3 as Occurrence } from "../contracts-3vias";

type OccurrenceType = Occurrence["type"];

type OccurrenceFixture = Pick<Occurrence, "itemName" | "type" | "title" | "explanation" | "evidence">;

export const occurrenceFixtures: Record<string, OccurrenceFixture> = {
  "suite:quantidade": {
    itemName: "Suíte de produtividade",
    type: "quantidade",
    title: "15 licenças cobradas além do contratado",
    explanation:
      "A NF 8812 cobra 135 licenças da suíte; o contrato limita a 120 (cláusula 2.1). As 15 licenças a mais somam R$ 930,00.",
    evidence: {
      contract: [
        { clauseRef: "2.1", quote: "Suíte de produtividade (e-mail e escritório): 120 licenças, a R$ 62,00 por licença por mês." },
      ],
      invoice: { source: "NF 8812 · linha 1", text: "135 licenças × R$ 62,00 = R$ 8.370,00" },
      delivery: { source: "Console de administração · uso em 30 dias", text: "98 licenças com uso nos últimos 30 dias" },
    },
  },
  "crm:valor": {
    itemName: "CRM de vendas (Pro)",
    type: "valor",
    title: "CRM cobrado a R$ 198,00 em vez de R$ 180,00",
    explanation:
      "O preço é fixo até 31/12/2026 (cláusula 6.1). A diferença de R$ 18,00 em 40 licenças soma R$ 720,00.",
    evidence: {
      contract: [
        { clauseRef: "2.2", quote: "CRM de vendas, plano Pro: 40 licenças, a R$ 180,00 por licença por mês." },
        { clauseRef: "6.1", quote: "Os preços deste contrato são fixos até 31/12/2026, sem reajuste." },
      ],
      invoice: { source: "NF 8812 · linha 2", text: "40 licenças × R$ 198,00 = R$ 7.920,00" },
      delivery: { source: "Console do CRM", text: "40 licenças ativas" },
    },
  },
  "tokens:quantidade": {
    itemName: "API de IA generativa",
    type: "quantidade",
    title: "8 milhões de tokens faturados sem consumo medido",
    explanation:
      "A NF cobra 66 mi de tokens (franquia de 50 mi + 16 mi de excedente); o painel de consumo mediu 58 mi. São 8 mi de excedente a mais, a R$ 90,00 por milhão.",
    evidence: {
      contract: [
        {
          clauseRef: "2.4",
          quote:
            "API de IA generativa: franquia de 50 milhões de tokens por mês por R$ 4.000,00; o excedente é cobrado a R$ 90,00 por milhão de tokens, conforme a medição do painel de consumo.",
        },
      ],
      invoice: { source: "NF 8812 · linhas 7 e 8", text: "Franquia R$ 4.000,00 + 16 mi × R$ 90,00 = R$ 1.440,00" },
      delivery: { source: "Painel de consumo", text: "58 milhões de tokens consumidos em outubro" },
    },
  },
  "implantacao:prazo": {
    itemName: "Implantação do CRM",
    type: "prazo",
    title: "Implantação entregue com 12 dias de atraso, sem multa",
    explanation:
      "O prazo era 15/10/2026 (cláusula 4.1) e o aceite saiu em 27/10/2026. A multa de 0,5% ao dia por 12 dias (6% de R$ 12.000,00) não foi descontada na NF.",
    evidence: {
      contract: [
        { clauseRef: "4.1", quote: "Implantação do CRM concluída até 15/10/2026, pelo valor único de R$ 12.000,00." },
        {
          clauseRef: "4.3",
          quote: "Em caso de atraso na implantação, multa de 0,5% do valor da implantação por dia de atraso, limitada a 10%.",
        },
      ],
      invoice: { source: "NF 8812 · linha 5", text: "Implantação R$ 12.000,00 · sem desconto de multa" },
      delivery: { source: "Termo de aceite", text: "Aceite assinado em 27/10/2026" },
    },
  },
  "sla:sla": {
    itemName: "Disponibilidade (SLA)",
    type: "sla",
    title: "Disponibilidade de 98,9%, abaixo de 99,5%, sem crédito",
    explanation:
      "O relatório de setembro mostra 98,9% (mínimo de 99,5%, cláusula 5.1). O crédito de 10% sobre suíte, CRM e backup (R$ 15.540,00 por mês) não foi aplicado.",
    evidence: {
      contract: [
        { clauseRef: "5.1", quote: "Disponibilidade mínima mensal de 99,5% para os serviços das cláusulas 2.1 a 2.3." },
        {
          clauseRef: "5.2",
          quote:
            "Abaixo desse nível, a Contratada concede crédito de 10% da mensalidade desses serviços na fatura do mês seguinte.",
        },
      ],
      invoice: { source: "NF 8812 · descontos", text: "Descontos: R$ 0,00 · nenhum crédito de SLA" },
      delivery: { source: "Relatório de disponibilidade de setembro", text: "Disponibilidade medida: 98,9%" },
    },
  },
};

export const opportunityFixtures: Record<string, Pick<Opportunity, "title" | "detail">> = {
  "suite:sem_uso": {
    title: "22 licenças da suíte sem uso em 30 dias",
    detail: "120 contratadas, 98 com uso. Dá para reduzir na renovação.",
  },
  "suite:desligados": {
    title: "6 licenças atribuídas a pessoas desligadas",
    detail: "Cruzamento da lista do RH de outubro com o console da suíte.",
  },
  "crm:plano_acima": {
    title: "9 usuários do CRM Pro usam só recursos do plano básico",
    detail: "Rebaixar o plano desses usuários na renovação.",
  },
};

export const typeOrder: OccurrenceType[] = ["quantidade", "valor", "prazo", "sla"];

export const nf8812: NfDocument = {
  number: "8812",
  series: "1",
  issuedAt: "2026-10-31",
  competence: "2026-10",
  issuer: { name: "NuvemSoft Tecnologia Ltda.", cnpj: "00.000.000/0001-00", city: "Porto Alegre/RS" },
  recipient: { name: "Rota Sul Logística Ltda.", cnpj: "11.111.111/0001-11", city: "Canoas/RS" },
  items: [
    { line: 1, itemId: "suite", description: "Suíte de produtividade · licença/mês", unit: "licença", qty: 135, unitPrice: 62, total: 8370 },
    { line: 2, itemId: "crm", description: "CRM de vendas Pro · licença/mês", unit: "licença", qty: 40, unitPrice: 198, total: 7920 },
    { line: 3, itemId: "backup", description: "Backup em nuvem 2 TB", unit: "pacote", qty: 1, unitPrice: 900, total: 900 },
    { line: 4, itemId: "suporte", description: "Suporte técnico nível 2", unit: "hora", qty: 38, unitPrice: 150, total: 5700 },
    { line: 5, itemId: "implantacao", description: "Implantação do CRM", unit: "entrega", qty: 1, unitPrice: 12000, total: 12000 },
    { line: 6, itemId: "treinamento", description: "Treinamento · turmas", unit: "turma", qty: 2, unitPrice: 2500, total: 5000 },
    { line: 7, itemId: "tokens", description: "API de IA · franquia 50 mi tokens", unit: "franquia", qty: 1, unitPrice: 4000, total: 4000 },
    { line: 8, itemId: "tokens", description: "API de IA · excedente", unit: "mi tokens", qty: 16, unitPrice: 90, total: 1440 },
  ],
  discounts: [],
  totalProducts: 45330,
  totalDiscounts: 0,
  total: 45330,
  notes: "Contrato 042/2026 · competência 10/2026. DOCUMENTO FICTÍCIO · SEM VALOR FISCAL.",
  fictitious: true,
};

export const deliverySources: Record<string, string> = {
  suite: "Console de administração · uso em 30 dias",
  crm: "Console do CRM",
  backup: "Painel de backup",
  tokens: "Painel de consumo",
  suporte: "Relatório de chamados",
  implantacao: "Termo de aceite",
  treinamento: "Lista de presença",
  sla: "Relatório de disponibilidade de setembro",
};

export function reportText(confirmed: Occurrence[], total: string): string {
  const linhas = confirmed.length
    ? confirmed
        .map((o, i) => {
          const refs = o.evidence.contract.map((c) => c.clauseRef).join(", ");
          return `${i + 1}. ${o.title} (cláusula ${refs}). ${o.explanation}`;
        })
        .join("\n\n")
    : "Nenhuma ocorrência confirmada até agora.";
  return [
    "Assunto: Contrato 042/2026 · divergências na NF 8812 (competência 10/2026)",
    "",
    "Prezados, NuvemSoft Tecnologia,",
    "",
    "Na conferência da NF 8812 com o contrato 042/2026 e com os registros de entrega de outubro, encontramos as divergências abaixo:",
    "",
    linhas,
    "",
    `Total a corrigir: ${total}.`,
    "",
    "Pedimos a emissão de nota corrigida ou o crédito correspondente na próxima fatura.",
    "",
    "Atenciosamente,",
    "TI · Rota Sul Logística Ltda.",
  ].join("\n");
}
