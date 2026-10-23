# Conforme · plano técnico (front + back)

**Hackathon OpenAI · Desafio 8 (Conferidor de contrato e entregas)**
Governança de contratos de licença de software com fornecedores de TI. Empresa fictícia.

- **Felipe:** front (telas, estado, chamadas à API)
- **Dan:** back (rotas de API, banco, regras, IA)
- **Ponto de contato entre os dois:** o arquivo `lib/contracts.ts`, com os tipos e schemas da API. Ele é a lei: quem mudar avisa o outro antes.

MVP de referência (clicável, com todas as telas e números): o artifact "Plano Hackathon Conforme" que o Felipe mandou no grupo.

---

## 1. O que o produto faz (fluxo da demo)

1. **Carteira:** lista dos 10 contratos de software com curva ABC (80/20). O 042/2026 é classe A e é o único com dados para conferir.
2. **Contrato:** texto do contrato + itens extraídos pela IA (quantidade, preço, prazo, regra), cada um com a cláusula e o **trecho exato** de origem.
3. **Fatura e entregas:** upload do CSV da fatura/relatórios do fornecedor. Os valores são editáveis na tela.
4. **Ocorrências:** o código compara contratado × entregue/faturado e gera as divergências com a evidência dos dois lados. Cada uma pode ser confirmada, descartada ou ficar pendente, com comentário, revisor e data.
5. **Relatório:** texto para o fornecedor com as ocorrências confirmadas (IA redige, com fallback por template).

**Regra de ouro (e argumento do vídeo):** a IA lê o contrato e escreve textos. **Quem decide se é divergência é o código**, sempre do mesmo jeito. **Quem decide o que fazer é a pessoa.**

**Resultado esperado com os dados da demo** (teste de aceite do back):

| Ocorrência (`key`) | Tipo | Impacto |
|---|---|---|
| `suite:quantidade` | 15 licenças além das 120 | R$ 930 |
| `crm:valor` | R$ 198 em vez de R$ 180, preço fixo | R$ 720 |
| `tokens:quantidade` | 66 mi faturados × 58 mi medidos | R$ 720 |
| `implantacao:prazo` | 12 dias de atraso, multa não descontada | R$ 720 |
| `sla:sla` | 98,9% < 99,5%, crédito não aplicado | R$ 1.554 |
| **Total em jogo** | | **R$ 4.644** |

Oportunidades (regras de utilização, não são divergência): 22 licenças da suíte sem uso (R$ 1.364/mês), 6 de pessoas desligadas (R$ 372/mês), 9 usuários do CRM Pro que só usam o básico (sem valor).

---

## 2. Estrutura do repositório (um repo Next.js só)

Front e back no **mesmo app Next.js (App Router)**. Sem CORS, um deploy só.

```
app/
  (app)/page.tsx                    → Carteira                         [Felipe]
  (app)/contratos/[id]/page.tsx     → Abas: contrato | fatura | ocorrências | relatório  [Felipe]
  api/                              → Route handlers                   [Dan]
components/                         → UI                               [Felipe]
lib/
  contracts.ts                      → TIPOS + SCHEMAS DA API           [os dois, combinado]
  api-client.ts                     → funções tipadas que chamam /api  [Felipe]
  mocks/                            → respostas fake a partir do seed  [Felipe]
  server/db.ts                      → Prisma client                    [Dan]
  server/rules.ts                   → motor de conferência (puro)      [Dan]
  server/abc.ts                     → curva ABC                        [Dan]
  server/ai.ts                      → extração e relatório com OpenAI  [Dan]
  server/csv.ts                     → parse e validação do CSV         [Dan]
prisma/schema.prisma, prisma/seed.ts                                   [Dan]
data/seed-demo.json                 → dados da demo (anexo)            [os dois]
```

**Branches:** `front` e `back`, merge na `main` a cada entrega pequena. Ninguém mexe na pasta do outro sem avisar.

**Variáveis de ambiente**

```
OPENAI_API_KEY=        # só no servidor
OPENAI_MODEL=          # o modelo liberado pela organização
DATABASE_URL=          # Postgres
NEXT_PUBLIC_USE_MOCKS=1  # 1 = front usa mocks; 0 = usa a API de verdade
```

---

## 3. O contrato entre front e back: `lib/contracts.ts`

Colar isto **antes de qualquer outra coisa**. Convenções:
- Datas: string `YYYY-MM-DD` (ou ISO completo em `createdAt`/`checkedAt`).
- Dinheiro: `number` em reais, 2 casas.
- IDs: `string`.
- Erro: sempre `{ error: { code, message } }` com status HTTP 4xx/5xx.

```ts
// lib/contracts.ts
import { z } from "zod";

/* ---------- carteira ---------- */
export const AbcClass = z.enum(["A", "B", "C"]);
export const ContractSummary = z.object({
  id: z.string(),
  number: z.string(),            // "042/2026"
  supplier: z.string(),
  object: z.string(),
  annualValue: z.number(),
  renewsAt: z.string(),          // YYYY-MM-DD
  hasDemoData: z.boolean(),
  abcClass: AbcClass,            // calculado no back
  cumulativePct: z.number(),     // 0–100, calculado no back
});
export type ContractSummary = z.infer<typeof ContractSummary>;

/* ---------- contrato ---------- */
export const Clause = z.object({ ref: z.string(), text: z.string() }); // ref "2.1"
export type Clause = z.infer<typeof Clause>;

export const RuleKind = z.enum(["recorrente", "consumo", "entrega", "nivel_servico"]);
export const ContractItem = z.object({
  id: z.string(),
  name: z.string(),
  kind: RuleKind,
  unit: z.string().nullable(),
  quantity: z.number().nullable(),          // máximo contratado (recorrente) ou qtd a entregar (entrega)
  unitPrice: z.number().nullable(),         // preço unitário; em "consumo" é o preço da franquia
  dueDate: z.string().nullable(),           // entrega
  penaltyPerDayPct: z.number().nullable(),  // entrega: 0.5 = 0,5% ao dia
  penaltyCapPct: z.number().nullable(),     // entrega: 10 = 10%
  franchiseQty: z.number().nullable(),      // consumo: 50 (milhões de tokens)
  overageUnitPrice: z.number().nullable(),  // consumo: 90 por milhão
  slaMinPct: z.number().nullable(),         // nivel_servico: 99.5
  slaCreditPct: z.number().nullable(),      // nivel_servico: 10
  slaBaseItemIds: z.array(z.string()),      // nivel_servico: itens que compõem a mensalidade
  clauseRefs: z.array(z.string()),          // ["2.1", "6.1"]
  quote: z.string(),                        // trecho exato do contrato
  quoteVerified: z.boolean(),               // true se o trecho existe literalmente no texto
});
export type ContractItem = z.infer<typeof ContractItem>;

export const ContractDetail = z.object({
  contract: ContractSummary.extend({ text: z.string() }),
  clauses: z.array(Clause),
  items: z.array(ContractItem),
  extraction: z.object({
    source: z.enum(["ai", "fallback", "seed"]),
    at: z.string().nullable(),
  }),
});
export type ContractDetail = z.infer<typeof ContractDetail>;

/* ---------- fatura e entregas ---------- */
export const InvoiceLine = z.object({
  id: z.string(),
  contractId: z.string(),
  itemId: z.string(),
  source: z.string(),                   // "NF 8812 · linha 1"
  billedQty: z.number().nullable(),
  billedUnitPrice: z.number().nullable(),
  deliveredAt: z.string().nullable(),
  measuredQty: z.number().nullable(),   // tokens medidos, turmas realizadas…
  activeUsers: z.number().nullable(),   // licenças com uso em 30 dias
  measuredPct: z.number().nullable(),   // disponibilidade medida
  creditApplied: z.number().nullable(),
  penaltyApplied: z.number().nullable(),
});
export type InvoiceLine = z.infer<typeof InvoiceLine>;
export const InvoiceLinePatch = InvoiceLine.omit({ id: true, contractId: true, itemId: true, source: true }).partial();
export type InvoiceLinePatch = z.infer<typeof InvoiceLinePatch>;

/* ---------- ocorrências e revisão ---------- */
export const OccurrenceType = z.enum(["quantidade", "prazo", "valor", "sla"]);
export const ReviewStatus = z.enum(["pendente", "confirmada", "descartada"]);
export const Review = z.object({
  id: z.string(),
  status: ReviewStatus,
  comment: z.string(),
  reviewer: z.string(),
  createdAt: z.string(),
});
export type Review = z.infer<typeof Review>;

export const Occurrence = z.object({
  id: z.string(),
  key: z.string(),              // `${itemId}:${type}` — estável entre conferências
  contractId: z.string(),
  itemId: z.string(),
  itemName: z.string(),
  type: OccurrenceType,
  title: z.string(),            // "15 licenças cobradas além do contratado"
  impact: z.number(),           // R$; 0 quando não há valor
  explanation: z.string(),      // 1–2 frases, gerado no back (template)
  evidence: z.object({
    contract: z.array(z.object({ clauseRef: z.string(), quote: z.string() })),
    delivery: z.object({ source: z.string(), text: z.string() }),
  }),
  status: ReviewStatus,         // status da revisão mais recente
  reviews: z.array(Review),     // histórico, mais recente primeiro
});
export type Occurrence = z.infer<typeof Occurrence>;

export const Opportunity = z.object({
  id: z.string(),
  itemId: z.string(),
  rule: z.enum(["sem_uso", "desligados", "plano_acima"]),
  title: z.string(),
  monthlyValue: z.number().nullable(),
  detail: z.string(),
});
export type Opportunity = z.infer<typeof Opportunity>;

export const CheckResult = z.object({
  contractId: z.string(),
  checkedAt: z.string(),
  occurrences: z.array(Occurrence),
  opportunities: z.array(Opportunity),
  totals: z.object({
    atStake: z.number(),        // soma de impact de todas
    confirmed: z.number(),      // soma das confirmadas
    pendingCount: z.number(),
  }),
});
export type CheckResult = z.infer<typeof CheckResult>;

export const Report = z.object({
  text: z.string(),
  source: z.enum(["ai", "template"]),
  generatedAt: z.string(),
});
export type Report = z.infer<typeof Report>;

/* ---------- corpos de requisição ---------- */
export const CreateContractBody = z.object({
  number: z.string(), supplier: z.string(), object: z.string(),
  annualValue: z.number(), renewsAt: z.string(), text: z.string().min(50),
});
export const UploadInvoiceBody = z.object({ csv: z.string().min(10) });
export const ReviewBody = z.object({
  status: ReviewStatus, comment: z.string().default(""), reviewer: z.string().min(1),
});

export const ApiError = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export type ApiError = z.infer<typeof ApiError>;
```

---

## 4. Rotas da API (Dan implementa, Felipe consome)

| Método | Rota | Corpo | Resposta | Usado na tela |
|---|---|---|---|---|
| GET | `/api/health` | — | `{ ok: true, db: boolean, ai: boolean }` | (debug) |
| GET | `/api/contracts` | — | `ContractSummary[]` ordenado por valor desc | Carteira |
| POST | `/api/contracts` | `CreateContractBody` | `ContractDetail` (sem itens ainda) | Upload de contrato (opcional) |
| GET | `/api/contracts/:id` | — | `ContractDetail` | Aba Contrato |
| POST | `/api/contracts/:id/extract` | — | `ContractDetail` (itens novos) | Botão "Extrair com IA" |
| GET | `/api/contracts/:id/invoice-lines` | — | `InvoiceLine[]` | Aba Fatura |
| POST | `/api/contracts/:id/invoice-lines` | `UploadInvoiceBody` | `{ lines: InvoiceLine[], errors: {row, message}[] }` | Upload do CSV (substitui as linhas) |
| PATCH | `/api/invoice-lines/:lineId` | `InvoiceLinePatch` | `InvoiceLine` | Edição de célula |
| POST | `/api/contracts/:id/check` | — | `CheckResult` | Depois de upload/edição |
| GET | `/api/contracts/:id/check` | — | `CheckResult` (última, ou roda se não houver) | Aba Ocorrências |
| POST | `/api/occurrences/:occId/review` | `ReviewBody` | `Occurrence` | Botões Confirmar/Descartar/Pendente |
| POST | `/api/contracts/:id/report` | — | `Report` | Aba Relatório |

**Fluxo de chamadas do front**

```
Carteira:     GET /api/contracts
Contrato:     GET /api/contracts/c-042            (botão: POST …/extract)
Fatura:       GET …/invoice-lines                 (upload: POST …/invoice-lines → POST …/check)
              edição de célula: PATCH /api/invoice-lines/:id → POST …/check
Ocorrências:  GET …/check                         (revisão: POST /api/occurrences/:id/review)
Relatório:    POST …/report
```

**Regra importante:** ao reconferir (`POST …/check`), o back recalcula as ocorrências mas **mantém as revisões** pela `key` (`itemId:type`). Se uma ocorrência deixar de existir, as revisões dela ficam no banco, mas ela não volta na resposta.

**Mocks (Felipe):** `lib/api-client.ts` checa `NEXT_PUBLIC_USE_MOCKS`. Com `1`, responde a partir de `data/seed-demo.json` com os mesmos tipos. Assim o front anda sem esperar o back, e a troca é uma variável.

---

## 5. Banco de dados (Dan)

Postgres (Railway ou Neon) + Prisma. Se o banco atrasar, o back responde de um store em memória com a mesma interface, e o front nem percebe.

```prisma
model Contract {
  id           String   @id
  number       String
  supplier     String
  object       String
  annualValue  Float
  renewsAt     String
  hasDemoData  Boolean  @default(false)
  text         String?
  extractionSource String?   // ai | fallback | seed
  extractedAt  DateTime?
  clauses      Clause[]
  items        ContractItem[]
  lines        InvoiceLine[]
  occurrences  Occurrence[]
}

model Clause {
  id         String   @id @default(cuid())
  contractId String
  ref        String
  text       String
  contract   Contract @relation(fields: [contractId], references: [id])
}

model ContractItem {
  id               String   @id          // "suite", "crm"… (único por contrato na demo)
  contractId       String
  name             String
  kind             String                // recorrente | consumo | entrega | nivel_servico
  unit             String?
  quantity         Float?
  unitPrice        Float?
  dueDate          String?
  penaltyPerDayPct Float?
  penaltyCapPct    Float?
  franchiseQty     Float?
  overageUnitPrice Float?
  slaMinPct        Float?
  slaCreditPct     Float?
  slaBaseItemIds   String[]
  clauseRefs       String[]
  quote            String
  quoteVerified    Boolean  @default(false)
  contract         Contract @relation(fields: [contractId], references: [id])
}

model InvoiceLine {
  id              String   @id @default(cuid())
  contractId      String
  itemId          String
  source          String
  billedQty       Float?
  billedUnitPrice Float?
  deliveredAt     String?
  measuredQty     Float?
  activeUsers     Float?
  measuredPct     Float?
  creditApplied   Float?
  penaltyApplied  Float?
  contract        Contract @relation(fields: [contractId], references: [id])
}

model Occurrence {
  id          String   @id @default(cuid())
  contractId  String
  key         String                 // itemId:type
  itemId      String
  itemName    String
  type        String
  title       String
  impact      Float
  explanation String
  evidence    Json
  active      Boolean  @default(true) // false quando sumiu na última conferência
  reviews     Review[]
  contract    Contract @relation(fields: [contractId], references: [id])
  @@unique([contractId, key])
}

model Review {
  id           String     @id @default(cuid())
  occurrenceId String
  status       String     // pendente | confirmada | descartada
  comment      String     @default("")
  reviewer     String
  createdAt    DateTime   @default(now())
  occurrence   Occurrence @relation(fields: [occurrenceId], references: [id])
}

model UsageFact {
  id                 String @id @default(cuid())
  contractId         String
  itemId             String
  terminatedAssigned Int    @default(0)  // licenças de desligados (lista do RH)
  overPlanUsers      Int    @default(0)  // usuários em plano acima do uso
}
```

**Seed (`prisma/seed.ts`):** lê `data/seed-demo.json` → `contracts`, `demoContract` (texto + cláusulas), `invoiceLines`, `usageFacts`. Os itens (`expectedItems`) entram com `extractionSource = "seed"`, para a demo abrir já pronta. O botão "Extrair com IA" refaz com a OpenAI.

---

## 6. Motor de conferência (`lib/server/rules.ts`, Dan)

Função pura: `conferir(items, lines, usageFacts) → { occurrences, opportunities }`. Sem banco nem IA dentro. É o coração do produto e tem que bater com a tabela da seção 1.

Para cada `InvoiceLine`, pega o `ContractItem` do mesmo `itemId`:

**recorrente** (licenças, pacote, horas)
- `quantidade`: `billedQty > quantity` → impacto `(billedQty − quantity) × billedUnitPrice`
- `valor`: `billedUnitPrice > unitPrice` → impacto `(billedUnitPrice − unitPrice) × min(billedQty, quantity)`

**consumo** (tokens de IA)
- `quantidade`: `billedQty > measuredQty` → excedente faturado `max(0, billedQty − franchiseQty)` menos o excedente devido `max(0, measuredQty − franchiseQty)`, vezes `overageUnitPrice`
- `valor`: `billedUnitPrice > overageUnitPrice` → `(diferença) × excedente medido`

**entrega** (implantação, treinamento)
- `prazo`: `deliveredAt > dueDate` → dias de atraso; se houver multa: `min(dias × penaltyPerDayPct, penaltyCapPct)% × unitPrice × quantity − penaltyApplied`; sem multa: impacto 0 (fica o registro)
- `quantidade`: `measuredQty < quantity` com `billedQty ≥ quantity` → cobrança sem entrega, `(quantity − measuredQty) × unitPrice`
- `valor`: `billedUnitPrice > unitPrice`

**nivel_servico** (SLA)
- `sla`: `measuredPct < slaMinPct` → crédito devido = `slaCreditPct% × Σ(quantity × unitPrice dos slaBaseItemIds)`; impacto `devido − creditApplied` (só gera se > 0)

**Oportunidades (regras de utilização)**
- `sem_uso`: `min(billedQty, quantity) − activeUsers` licenças × `unitPrice`
- `desligados`: `UsageFact.terminatedAssigned × unitPrice`
- `plano_acima`: `UsageFact.overPlanUsers` (valor `null`)

`title`, `explanation` e `evidence` saem do código (templates), com os números e as cláusulas de `clauseRefs`. O texto de `evidence.contract[].quote` vem da tabela `Clause`, não da IA.

---

## 7. Onde entra a IA (`lib/server/ai.ts`, Dan)

### 7.1 Extração do contrato: `POST /api/contracts/:id/extract`
- **Entrada:** `contract.text`.
- **Chamada:** OpenAI Responses API com **Structured Outputs** (JSON Schema estrito), ou o helper `zodTextFormat` do SDK com o schema `ContractItem` (sem `id` e `quoteVerified`). Em modo estrito todos os campos são obrigatórios: os opcionais vão como `number | null`.
- **Prompt (resumo):** "Você extrai itens de contratos de TI. Para cada item contratado, devolva nome, tipo de regra (recorrente, consumo, entrega, nivel_servico), quantidade, preço, prazos, multa, franquia, SLA e as cláusulas de origem. Em `quote`, copie o trecho exato do contrato, sem reescrever. Não interprete juridicamente. Se um campo não existir, use null."
- **Pós-validação (no código):**
  - `quoteVerified = text.includes(quote)` (normalizando espaços). Se falso, o front mostra o aviso "trecho não encontrado, revisar".
  - Gera `id` a partir do nome (slug) e mantém os ids do seed quando o nome bater (para as linhas da fatura continuarem ligadas).
  - Valida com zod antes de salvar.
- **Fallback:** sem chave, com erro ou timeout de 20 s → devolve `expectedItems` do seed com `extraction.source = "fallback"`. **A demo nunca quebra.**

### 7.2 Relatório: `POST /api/contracts/:id/report`
- **Entrada:** ocorrências confirmadas (título, cláusulas, evidência, impacto, comentário da revisão) e o total.
- **Prompt:** "Redija um e-mail curto e neutro para o fornecedor listando as divergências confirmadas, com a cláusula, a evidência e o valor de cada uma, e o total. Peça nota corrigida ou crédito. Não faça interpretação jurídica nem ameaças. Use só os dados fornecidos."
- **Fallback:** template em código, com `source = "template"`.

### 7.3 O que a IA NÃO faz
Não decide se é divergência, não calcula valor, não inventa trecho. Isso é do motor (seção 6). Vale repetir no vídeo.

---

## 8. CSV da fatura (upload)

Colunas (cabeçalho obrigatório, vazio = null):

```
item_id,fonte,qtd_faturada,preco_unitario_faturado,data_entrega,qtd_medida,usuarios_ativos,disponibilidade_pct,credito_aplicado,multa_aplicada
```

O CSV da demo está em `seed-demo.json` → `invoiceCsv`. O back valida: `item_id` precisa existir no contrato, números são números, data no formato `YYYY-MM-DD`. Linhas inválidas voltam em `errors` sem derrubar o upload.

---

## 9. Cronograma e pontos de integração

| Hora | Felipe (front) | Dan (back) |
|---|---|---|
| 12:10–12:25 | **Juntos:** criar repo, colar `lib/contracts.ts` e `data/seed-demo.json`, deploy vazio | |
| 12:25–13:30 | Telas com mocks: Carteira, Contrato (trecho destacado), Fatura (tabela editável), Ocorrências | Banco + seed, `GET /contracts`, `GET /contracts/:id`, `GET/POST invoice-lines`, `rules.ts` batendo com a tabela da seção 1 |
| **13:30** | **Integração 1:** `NEXT_PUBLIC_USE_MOCKS=0` nas leituras e no check | `POST /check` e `GET /check` prontos |
| 13:30–14:15 | Revisão (botões, comentário, histórico), upload do CSV, aba Relatório | `POST /review`, `POST /extract` com IA + fallback, `POST /report` |
| **14:15** | **Integração 2:** fluxo da demo de ponta a ponta no deploy | |
| **14:30** | **Congela features.** Só bug. | |
| 14:30–15:30 | Gravar a tela no roteiro | Narração com TTS da OpenAI |
| 15:30–15:50 | Legendas, exportar, subir, cadastrar no desafio 8 | |

**Ordem de corte se apertar:** relatório com IA (fica o template) → upload de contrato novo (fica o seed) → oportunidades → edição de célula (fica só o upload).

---

## 10. Checklist de integração (os dois conferem às 13:30 e 14:15)

- [ ] `GET /api/contracts` devolve 10 contratos, 042 é classe A, `cumulativePct` do 4º ≈ 76
- [ ] `GET /api/contracts/c-042` devolve 11 cláusulas e 8 itens com `quoteVerified = true`
- [ ] Upload do `invoiceCsv` devolve 8 linhas e `errors: []`
- [ ] `POST /check` devolve as 5 ocorrências da seção 1, `atStake = 4644`
- [ ] Mudar `billedQty` da suíte para 120 e reconferir → `suite:quantidade` some e o total cai para 3.714
- [ ] Confirmar uma ocorrência, reconferir → ela continua confirmada
- [ ] Sem `OPENAI_API_KEY`, `POST /extract` responde com `source: "fallback"` e a tela funciona
- [ ] Erros sempre no formato `{ error: { code, message } }`
