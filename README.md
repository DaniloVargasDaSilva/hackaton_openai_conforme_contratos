# Conforme

Governança de contratos de licença de software com fornecedores de TI.
Hackathon OpenAI · **Desafio 8: conferidor de contrato e entregas**. A empresa e os dados são fictícios.

O Conforme lê o contrato, compara o que foi contratado com o que o fornecedor faturou e entregou, e aponta cada divergência com a evidência dos dois lados: o trecho da cláusula e a linha da fatura.

> **Regra de ouro:** a IA lê o contrato e escreve textos. **Quem decide se é divergência é o código**, sempre do mesmo jeito. **Quem decide o que fazer é a pessoa.**

## Fluxo da demo

1. **Carteira:** os 10 contratos de software em curva ABC (80/20). O 042/2026 (NuvemSoft) é classe A e é o que vamos conferir.
2. **Contrato:** o texto do contrato e os itens extraídos pela IA, cada um ligado à cláusula e ao trecho exato de origem.
3. **Fatura e entregas:** upload do CSV do fornecedor, com valores editáveis na tela.
4. **Ocorrências:** as divergências com evidência lado a lado. Cada uma pode ser confirmada, descartada ou ficar pendente, com comentário e revisor.
5. **Relatório:** texto para o fornecedor com as ocorrências confirmadas.

Com os dados da demo, o resultado esperado é de **5 ocorrências, com R$ 4.644 em jogo**. Veja a tabela na seção 1 do [plano](PLANO-CONFORME.md).

## Time

| Quem | Parte |
|---|---|
| Felipe | Front: telas, estado, `lib/api-client.ts`, mocks |
| Dan | Back: `app/api`, banco, motor de regras, IA |

O ponto de contato entre os dois é `lib/contracts.ts`, com os tipos e schemas zod da API. Quem for mudar esse arquivo avisa o outro antes.

## Stack

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui · Postgres + Prisma · OpenAI (Structured Outputs) · deploy na Vercel.

## Variáveis de ambiente

```
OPENAI_API_KEY=          # só no servidor
OPENAI_MODEL=            # modelo liberado pela organização
DATABASE_URL=            # Postgres
NEXT_PUBLIC_USE_MOCKS=1  # 1 = front usa mocks do seed; 0 = API de verdade
```

## Arquivos

| Arquivo | O que é |
|---|---|
| [`PLANO-CONFORME.md`](PLANO-CONFORME.md) | Plano técnico completo: tipos, rotas, banco, motor de regras, IA, cronograma e checklist de integração |
| [`PROMPT-FRONT-CLAUDE-CODE.md`](PROMPT-FRONT-CLAUDE-CODE.md) | Prompt para planejar o front com o Claude Code |
| [`data/seed-demo.json`](data/seed-demo.json) | Dados da demo: mock do front, seed do banco e fallback da extração por IA |

## Branches

`front` e `back`, com merge na `main` a cada entrega pequena. Ninguém mexe na pasta do outro sem avisar.
