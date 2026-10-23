// Dan: extração de itens e relatório com OpenAI (Structured Outputs), com fallback.
// A IA lê o contrato e escreve textos. Não decide divergência, não calcula valor, não inventa trecho.
import OpenAI from "openai";
import { z } from "zod";
import { ContractItem, type Occurrence } from "@/lib/contracts";
import type { NfDocument } from "@/lib/contracts-3vias";
import seed from "@/data/seed-demo.json";

/** Limite da extração e do relatório. Estourou, cai no fallback. */
const AI_TIMEOUT_MS = 20_000;

/** Formato que a IA devolve. O id e quoteVerified são calculados no código. */
const AiItem = ContractItem.omit({ id: true, quoteVerified: true, slaBaseItemIds: true }).extend({
  slaBaseItemNames: z.array(z.string()),
});
const AiExtraction = z.object({ items: z.array(AiItem) });
type AiItem = z.infer<typeof AiItem>;

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name", "kind", "unit", "quantity", "unitPrice", "dueDate", "penaltyPerDayPct",
          "penaltyCapPct", "franchiseQty", "overageUnitPrice", "slaMinPct", "slaCreditPct",
          "slaBaseItemNames", "clauseRefs", "quote",
        ],
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["recorrente", "consumo", "entrega", "nivel_servico"] },
          unit: { type: ["string", "null"] },
          quantity: { type: ["number", "null"] },
          unitPrice: { type: ["number", "null"] },
          dueDate: { type: ["string", "null"] },
          penaltyPerDayPct: { type: ["number", "null"] },
          penaltyCapPct: { type: ["number", "null"] },
          franchiseQty: { type: ["number", "null"] },
          overageUnitPrice: { type: ["number", "null"] },
          slaMinPct: { type: ["number", "null"] },
          slaCreditPct: { type: ["number", "null"] },
          slaBaseItemNames: { type: "array", items: { type: "string" } },
          clauseRefs: { type: "array", items: { type: "string" } },
          quote: { type: "string" },
        },
      },
    },
  },
} as const;

const EXTRACTION_INSTRUCTIONS = `Você extrai itens de contratos de TI.
Para cada item contratado, devolva: nome, tipo de regra (recorrente, consumo, entrega, nivel_servico), unidade, quantidade, preço unitário, prazo (YYYY-MM-DD), multa, franquia, SLA e as cláusulas de origem.
Em "quote", copie o trecho exato do contrato, sem reescrever.
Não interprete juridicamente. Se um campo não existir no contrato, use null.
Em "slaBaseItemNames", liste os nomes dos itens cuja mensalidade compõe a base do SLA.`;

const REPORT_INSTRUCTIONS = `Redija um e-mail curto e neutro para o fornecedor listando as divergências confirmadas, com a cláusula, a evidência e o valor de cada uma, e o total.
Peça nota corrigida ou crédito. Não faça interpretação jurídica nem ameaças. Use só os dados fornecidos.
Responda somente com o texto do e-mail, em português.`;

/** Cliente só existe se houver chave e modelo. Sem eles, tudo cai no fallback. */
function getAi() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) return null;
  return {
    model,
    client: new OpenAI({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 0 }),
  };
}

export function isAiEnabled() {
  return getAi() !== null;
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

const slug = (s: string) =>
  normalize(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Transforma o que a IA devolveu no formato final: id estável, quoteVerified e slaBaseItemIds.
 * Quando o nome bate com um item do seed, mantém o id do seed para as linhas da fatura continuarem ligadas.
 */
function finalizeItems(raw: AiItem[], contractText: string, seedItems: ContractItem[]): ContractItem[] {
  const seedByName = new Map(seedItems.map((i) => [slug(i.name), i.id]));
  const used = new Set<string>();
  const idByName = new Map<string, string>();

  const ids = raw.map((item) => {
    const id = seedByName.get(slug(item.name)) ?? slug(item.name) ?? "item";
    let candidate = id;
    for (let n = 2; used.has(candidate); n++) candidate = `${id}-${n}`;
    used.add(candidate);
    idByName.set(slug(item.name), candidate);
    return candidate;
  });

  const haystack = normalize(contractText);

  return raw.map((item, index) => {
    const { slaBaseItemNames, ...rest } = item;
    return {
      ...rest,
      id: ids[index],
      slaBaseItemIds: slaBaseItemNames.map((n) => idByName.get(slug(n))).filter((x): x is string => !!x),
      quoteVerified: haystack.includes(normalize(item.quote)),
    };
  });
}

export type ExtractionOutcome = { items: ContractItem[]; source: "ai" | "fallback" };

/** Itens do seed para um contrato. Só o contrato de demo tem itens no seed. */
export function seedItemsFor(contractId: string): ContractItem[] {
  if (contractId !== seed.demoContract.id) return [];
  return seed.expectedItems.map((i) => ContractItem.parse({ ...i, quoteVerified: true }));
}

/**
 * Extrai os itens do contrato com OpenAI. Sem chave, erro ou timeout, devolve o seed com source "fallback".
 * A demo nunca quebra por causa da IA.
 */
export async function extractItems(contractId: string, contractText: string): Promise<ExtractionOutcome> {
  const seedItems = seedItemsFor(contractId);
  const ai = getAi();
  if (!ai) return { items: seedItems, source: "fallback" };

  try {
    const response = await ai.client.responses.create({
      model: ai.model,
      instructions: EXTRACTION_INSTRUCTIONS,
      input: contractText,
      text: {
        format: { type: "json_schema", name: "contract_items", strict: true, schema: EXTRACTION_SCHEMA },
      },
    });
    const parsed = AiExtraction.parse(JSON.parse(response.output_text));
    const items = finalizeItems(parsed.items, contractText, seedItems).map((i) => ContractItem.parse(i));
    return { items, source: "ai" };
  } catch (error) {
    console.error("[ai] extração falhou, usando fallback:", error);
    return { items: seedItems, source: "fallback" };
  }
}

export type ReportOutcome = { text: string; source: "ai" | "template" };

/** Template em código. Usado sem IA e quando a IA falha. Só usa os dados recebidos. */
export function reportTemplate(
  contractNumber: string,
  supplier: string,
  confirmed: Pick<Occurrence, "title" | "impact" | "evidence">[],
): string {
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const total = confirmed.reduce((sum, o) => sum + o.impact, 0);

  if (confirmed.length === 0) {
    return `Prezados, ${supplier}.\n\nReferente ao contrato ${contractNumber}, nenhuma divergência foi confirmada até o momento.`;
  }

  const list = confirmed
    .map((o, i) => {
      const clauses = o.evidence.contract.map((c) => `cláusula ${c.clauseRef}`).join(", ");
      return `${i + 1}. ${o.title}${clauses ? ` (${clauses})` : ""}: ${brl.format(o.impact)}.`;
    })
    .join("\n");

  return [
    `Prezados, ${supplier}.`,
    "",
    `Na conferência da fatura referente ao contrato ${contractNumber}, identificamos as divergências abaixo, confirmadas pela nossa revisão:`,
    "",
    list,
    "",
    `Total em jogo: ${brl.format(total)}.`,
    "",
    "Solicitamos a emissão de nota corrigida ou o crédito correspondente na próxima fatura.",
  ].join("\n");
}

export async function writeReport(
  contractNumber: string,
  supplier: string,
  confirmed: Pick<Occurrence, "title" | "impact" | "evidence">[],
): Promise<ReportOutcome> {
  const ai = getAi();
  if (!ai || confirmed.length === 0) {
    return { text: reportTemplate(contractNumber, supplier, confirmed), source: "template" };
  }

  try {
    const payload = JSON.stringify({ contrato: contractNumber, fornecedor: supplier, divergencias: confirmed });
    const response = await ai.client.responses.create({
      model: ai.model,
      instructions: REPORT_INSTRUCTIONS,
      input: payload,
    });
    const text = response.output_text.trim();
    if (!text) throw new Error("resposta vazia");
    return { text, source: "ai" };
  } catch (error) {
    console.error("[ai] relatório falhou, usando template:", error);
    return { text: reportTemplate(contractNumber, supplier, confirmed), source: "template" };
  }
}


/* ---------- NF por foto ---------- */

/** A IA não está configurada ou falhou; a mensagem já serve para mostrar ao usuário. */
export class NfPhotoError extends Error {}

const AiNfParty = z.object({ name: z.string(), cnpj: z.string(), city: z.string().nullable() });
const AiNfRead = z.object({
  number: z.string(),
  series: z.string(),
  issuedAt: z.string(),
  competence: z.string(),
  issuer: AiNfParty,
  recipient: AiNfParty,
  items: z.array(
    z.object({
      line: z.number(),
      productCode: z.string().nullable(),
      description: z.string(),
      unit: z.string(),
      qty: z.number(),
      unitPrice: z.number(),
      total: z.number(),
    }),
  ),
  discounts: z.array(z.object({ description: z.string(), amount: z.number() })),
  notes: z.string().nullable(),
});

const NF_PARTY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "cnpj", "city"],
  properties: { name: { type: "string" }, cnpj: { type: "string" }, city: { type: ["string", "null"] } },
} as const;

const NF_READ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["number", "series", "issuedAt", "competence", "issuer", "recipient", "items", "discounts", "notes"],
  properties: {
    number: { type: "string" },
    series: { type: "string" },
    issuedAt: { type: "string" },
    competence: { type: "string" },
    issuer: NF_PARTY_SCHEMA,
    recipient: NF_PARTY_SCHEMA,
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["line", "productCode", "description", "unit", "qty", "unitPrice", "total"],
        properties: {
          line: { type: "number" },
          productCode: { type: ["string", "null"] },
          description: { type: "string" },
          unit: { type: "string" },
          qty: { type: "number" },
          unitPrice: { type: "number" },
          total: { type: "number" },
        },
      },
    },
    discounts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "amount"],
        properties: { description: { type: "string" }, amount: { type: "number" } },
      },
    },
    notes: { type: ["string", "null"] },
  },
} as const;

const NF_READ_INSTRUCTIONS = `Você lê a foto de uma nota fiscal de software e serviços de TI e devolve os dados em JSON.
Copie números, datas e nomes como aparecem na imagem, sem corrigir nem calcular nada. Datas em YYYY-MM-DD; competência em YYYY-MM.
Valores em reais, como número (ex.: 1234.5).
Para cada linha de produto, em "productCode" devolva o id do item do contrato que a linha representa, escolhendo só entre os ids da lista recebida. Se nenhuma servir, use null.
Em "discounts" liste só descontos escritos na nota (crédito, multa, abatimento). Se não houver, devolva a lista vazia.
Se algo não estiver legível, use string vazia ou 0. Não invente linhas.`;

const PHOTO_TIMEOUT_MS = 40_000;

/** Lê a foto de uma NF e devolve o documento no mesmo formato do XML. Falha com NfPhotoError. */
export async function readNfFromImage(
  imageBase64: string,
  mimeType: string,
  items: ContractItem[],
): Promise<NfDocument> {
  const ai = getAi();
  if (!ai) {
    throw new NfPhotoError("A leitura por foto precisa da IA configurada (OPENAI_API_KEY e OPENAI_MODEL). Envie o XML da NF.");
  }

  const catalog = items.map((i) => `- ${i.id}: ${i.name}${i.unit ? ` (${i.unit})` : ""}`).join("\n");

  let parsed: z.infer<typeof AiNfRead>;
  try {
    const response = await ai.client.responses.create(
      {
        model: ai.model,
        instructions: NF_READ_INSTRUCTIONS,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: `Itens do contrato (ids permitidos em productCode):\n${catalog}` },
              { type: "input_image", image_url: `data:${mimeType};base64,${imageBase64}`, detail: "high" },
            ],
          },
        ],
        text: { format: { type: "json_schema", name: "nota_fiscal", strict: true, schema: NF_READ_SCHEMA } },
      },
      { timeout: PHOTO_TIMEOUT_MS },
    );
    parsed = AiNfRead.parse(JSON.parse(response.output_text));
  } catch (error) {
    console.error("[ai] leitura da foto da NF falhou:", error);
    throw new NfPhotoError("Não consegui ler a foto. Tire outra com a nota inteira e bem iluminada, ou envie o XML.");
  }

  if (!parsed.number || parsed.items.length === 0) {
    throw new NfPhotoError("Não encontrei o número nem as linhas da NF na foto. Tire outra, com a nota inteira à vista.");
  }

  const allowed = new Set(items.map((i) => i.id));
  const nfItems = parsed.items.map((it) => ({
    line: it.line,
    itemId: it.productCode && allowed.has(it.productCode) ? it.productCode : null,
    description: it.description,
    unit: it.unit,
    qty: it.qty,
    unitPrice: it.unitPrice,
    total: it.total,
  }));
  const totalProducts = nfItems.reduce((sum, it) => sum + it.total, 0);
  const totalDiscounts = parsed.discounts.reduce((sum, d) => sum + d.amount, 0);

  return {
    number: parsed.number,
    series: parsed.series,
    issuedAt: parsed.issuedAt,
    competence: parsed.competence,
    issuer: parsed.issuer,
    recipient: parsed.recipient,
    items: nfItems,
    discounts: parsed.discounts,
    totalProducts,
    totalDiscounts,
    total: totalProducts - totalDiscounts,
    notes: parsed.notes,
    // O DANFE da demo é sempre fictício (o tipo do front exige o literal true).
    fictitious: true,
  };
}
