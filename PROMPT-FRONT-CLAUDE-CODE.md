Estou num hackathon da OpenAI com ~4 horas até a entrega e preciso **planejar o front** de um produto antes de codar. Não escreva código ainda: primeiro leia os arquivos abaixo e me devolva um plano detalhado para eu revisar.

## Contexto
- Produto: **Conforme**, governança de contratos de licença de software com fornecedores de TI (desafio 8: conferidor de contrato e entregas). Empresa fictícia.
- Eu faço o **front**. Meu colega Dan faz o **back** (rotas em `app/api`, banco, regras, IA) no mesmo repo.
- Stack: **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui**, deploy na Vercel.
- Leia antes de planejar:
  - `PLANO-CONFORME.md`: plano completo de front + back. As seções 3 (tipos), 4 (rotas) e 9 (cronograma) são as mais importantes para mim.
  - `lib/contracts.ts`: tipos e schemas zod da API. **É o contrato com o back: não altere sem me avisar.**
  - `data/seed-demo.json`: dados da demo, que vão servir de mock.

## Limites
- Não toque em `app/api/**`, `lib/server/**` nem `prisma/**` (são do Dan).
- Toda chamada ao back passa por `lib/api-client.ts`, com funções tipadas usando os tipos de `lib/contracts.ts` e validação com zod na resposta.
- `NEXT_PUBLIC_USE_MOCKS=1` faz o `api-client` responder a partir do `seed-demo.json`, com os mesmos tipos, para eu trabalhar antes do back ficar pronto. Trocar para `0` não pode exigir mudança em nenhuma tela.
- Os números exibidos vêm sempre da API. O front não recalcula divergências.

## Telas (fluxo da demo, nesta ordem)
1. **Carteira (`/`)**: tabela dos 10 contratos com classe ABC (chip A/B/C), valor anual, % acumulado com barrinha, data de renovação e botão "Conferir" só no 042/2026. No topo, cards: gasto anual, quantos contratos em A/B/C.
2. **Contrato (`/contratos/[id]`, aba 1)**: texto do contrato à esquerda (fonte serifada, estilo documento) e tabela de itens extraídos à direita. Clicar num item destaca a(s) cláusula(s) de origem no texto, estilo marca-texto, e rola até ela. Botão "Extrair de novo com IA" com estado de carregamento. Mostrar a origem da extração (`ai` / `fallback` / `seed`) e alerta quando `quoteVerified = false`.
3. **Fatura e entregas (aba 2)**: upload do CSV (arrastar ou escolher arquivo; o texto vai em `{ csv }`), tabela das linhas com campos editáveis. Ao editar: `PATCH` na linha e depois `POST /check`. Marcar em vermelho a linha que tem ocorrência. Mostrar os `errors` do upload.
4. **Ocorrências (aba 3)**: cards com tipo (chip), título, impacto em R$, **evidência lado a lado** (trecho do contrato marcado × linha do fornecedor), explicação, botões Pendente / Confirmada / Descartada, campo de comentário e "confirmada por X em data/hora". Nome do revisor num campo no topo da página. Cards de totais acima: ocorrências, total em jogo, confirmado. Abaixo, a seção "Regras de utilização" com as oportunidades, separada visualmente das divergências.
5. **Relatório (aba 4)**: botão "Gerar relatório", texto em bloco estilo documento, botão copiar, origem (`ai`/`template`).

O número da aba de ocorrências (badge) e os totais se atualizam depois de cada `check` e de cada revisão.

## O que eu quero no plano
1. **Árvore de arquivos** do front (rotas, componentes, hooks, `api-client`, mocks), dizendo o que cada arquivo faz.
2. **Estado e dados:** como buscar e invalidar (React Query/SWR ou server components + client islands, com recomendação e motivo), o que fica em estado local (aba ativa, revisor, item selecionado) e o fluxo "editar célula → PATCH → check → atualizar ocorrências e badge".
3. **`api-client.ts` e mocks:** assinatura de cada função, mapeada para as rotas da seção 4 do plano, e como o mock simula latência, erros e o `check`. Para o check no modo mock, usar o `expectedCheck` do seed enriquecido com títulos e evidências fixas, sem reimplementar o motor.
4. **Componentes** com props tipadas (ex.: `ContractDocument`, `ItemsTable`, `InvoiceTable`, `OccurrenceCard`, `EvidencePanel`, `ReviewControls`, `AbcTable`, `TotalsBar`, `ReportView`).
5. **Tratamento de erro e carregamento** em cada tela, incluindo a API fora do ar e o formato `{ error: { code, message } }`.
6. **Ordem de implementação em blocos de 20–30 min**, encaixada no cronograma do plano (integração com o back às 13:30 e 14:15, congelamento às 14:30), e o que cortar se atrasar.
7. **Checklist de integração do meu lado**, espelhando a seção 10 do plano.
8. **Visual:** o produto vai aparecer num vídeo de 3 minutos, então as telas precisam ficar legíveis numa gravação (fonte grande nos números, contraste, trecho marcado bem visível). Proponha uma paleta e uma tipografia simples, que não pareçam template.

Depois que eu aprovar o plano, implementamos bloco por bloco.
