# Exemplos da demo

Os arquivos que vamos usar na demo e no vídeo do Conforme. Todos são **fictícios**: o contrato tem a marca "MODELO FICTÍCIO · DEMONSTRAÇÃO", a NF tem a marca "DOCUMENTO FICTÍCIO · SEM VALOR FISCAL", e os CNPJs e a chave de acesso são de zeros.

Rota Sul Logística (contratante) × NuvemSoft Tecnologia (fornecedor) · contrato 042/2026 · competência outubro/2026.

## O que enviar em cada tela

| Arquivo | Onde usar | Para quê |
|---|---|---|
| [`contrato-042-2026-ficticio.txt`](contrato-042-2026-ficticio.txt) | Carteira → **Novo contrato**, no campo do texto (colar ou soltar o arquivo) | A API recebe o texto do contrato; a IA extrai os itens |
| [`contrato-042-2026-ficticio.pdf`](contrato-042-2026-ficticio.pdf) | Só para mostrar no vídeo | O mesmo contrato, com cara de documento. O app não lê PDF |
| [`nf-8812-ficticia.xml`](nf-8812-ficticia.xml) | Faturado × entregue → caixa **Nota fiscal · XML** | O que o fornecedor faturou |
| [`nf-8812-ficticia.pdf`](nf-8812-ficticia.pdf) | Só para mostrar no vídeo, ou fotografar no teste da câmera | O DANFE da mesma NF |
| [`entregas-outubro.csv`](entregas-outubro.csv) | Faturado × entregue → caixa **Entregas · CSV** | O que foi entregue e medido |

## Resultado esperado

Depois de enviar a NF e as entregas, a aba Ocorrências mostra **5 ocorrências e R$ 4.644,00 em jogo**:

| Ocorrência | Cláusula | Em jogo |
|---|---|---|
| Suíte: 135 licenças faturadas, 120 contratadas | 2.1 | R$ 930,00 |
| CRM Pro: R$ 198,00 faturado, R$ 180,00 contratado (preço fixo) | 2.2 e 6.1 | R$ 720,00 |
| API de IA: 66 mi de tokens faturados, 58 mi medidos | 2.4 | R$ 720,00 |
| Implantação do CRM: 12 dias de atraso, multa não descontada | 4.1 e 4.3 | R$ 720,00 |
| SLA: 98,9% medido, mínimo de 99,5%, crédito não aplicado | 5.1 e 5.2 | R$ 1.554,00 |

Nas regras de utilização: 22 licenças da suíte sem uso (R$ 1.364/mês), 6 de pessoas desligadas (R$ 372/mês) e 9 usuários do CRM Pro que só usam o básico.

## De onde vêm

Cópias de `public/demo/`, que é de onde o app serve os arquivos. As fontes HTML e o script que gera os PDFs estão em `data/demo/fontes/`. Os números batem com `data/seed-demo.json`.
