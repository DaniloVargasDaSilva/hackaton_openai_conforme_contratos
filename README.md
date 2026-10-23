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
OPENAI_API_KEY=          # só no servidor; sem ela a IA cai no fallback (seed / template)
OPENAI_MODEL=            # modelo liberado pela organização; sem ele a IA cai no fallback
DATABASE_URL=            # Postgres
NEXT_PUBLIC_USE_MOCKS=1  # 1 = front usa mocks do seed; 0 = API de verdade
NEXT_PUBLIC_MOCK_ROUTES= # opcional: rotas que ficam no mock mesmo com USE_MOCKS=0 (ex.: nf,deliveries)
DEMO_RESET_ENABLED=0     # 1 liga POST /api/demo/reset (só durante a gravação)
```

`NEXT_PUBLIC_*` entram no bundle **durante o build**: mudou o valor, faça um novo deploy.

## Deploy na Vercel

1. Crie um Postgres em nuvem e use a **URL com pooler** em `DATABASE_URL` (Supabase `:6543` com `?pgbouncer=true`,
   ou a URL "pooled" do Neon). Na Vercel cada requisição abre uma conexão nova.
2. Em *Settings → Environment Variables* (production e preview): `DATABASE_URL`, `OPENAI_API_KEY` (sensitive),
   `OPENAI_MODEL`, `NEXT_PUBLIC_USE_MOCKS=0`, `DEMO_RESET_ENABLED=1`. Não defina `NEXT_PUBLIC_MOCK_ROUTES`
   (as rotas `nf` e `deliveries` já existem no back).
3. Em *Settings → Functions*, escolha a **região da função próxima da região do banco**. Cada consulta é uma ida e
   volta de rede; com o banco longe, cada ação do front fica lenta.
4. Crie as tabelas e o seed **uma vez**, fora do build (o build só roda `prisma generate`):
   ```bash
   DATABASE_URL="<url direta, sem pooler>" npx prisma db push
   DATABASE_URL="<url direta, sem pooler>" npx tsx prisma/seed.ts
   ```
5. Confira o deploy com o teste de fumaça (valida cada resposta com os schemas zod do front):
   ```bash
   npm run check:deploy -- https://seu-app.vercel.app            # só leitura
   npm run check:deploy -- https://seu-app.vercel.app --write    # fluxo completo (precisa de DEMO_RESET_ENABLED=1)
   ```

Regressão de **todas** as rotas, com os caminhos de erro (altera dados e devolve a demo ao estado inicial;
precisa de `DEMO_RESET_ENABLED=1` no alvo):
```bash
npm run test:api -- http://localhost:3000
```

`POST /api/demo/reset` volta a demo ao estado inicial (NF 8812 e entregas carregadas).
Com `?estado=vazio` a fatura fica vazia, para enviar os arquivos durante a gravação.

## Arquivos

| Arquivo | O que é |
|---|---|
| [`PLANO-CONFORME.md`](PLANO-CONFORME.md) | Plano técnico completo: tipos, rotas, banco, motor de regras, IA, cronograma e checklist de integração |
| [`PROMPT-FRONT-CLAUDE-CODE.md`](PROMPT-FRONT-CLAUDE-CODE.md) | Prompt para planejar o front com o Claude Code |
| [`data/seed-demo.json`](data/seed-demo.json) | Dados da demo: mock do front, seed do banco e fallback da extração por IA |

## Branches

`front` e `back`, com merge na `main` a cada entrega pequena. Ninguém mexe na pasta do outro sem avisar.
