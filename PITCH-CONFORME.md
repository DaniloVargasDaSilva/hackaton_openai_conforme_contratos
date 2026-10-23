# Conforme: como é a plataforma

Guia para o pitch. Hackathon OpenAI · **Desafio 8: conferidor de contrato e entregas**.

## Em uma frase

O Conforme confere, todo mês, se o fornecedor de software cobrou e entregou o que está no contrato, e mostra cada divergência com a prova dos dois lados.

> **A IA lê o contrato. O código confere. A pessoa decide.**

## O problema

Uma empresa média tem dezenas de contratos de software: suíte de escritório, CRM, ERP, backup, IA, suporte. Cada fatura mistura licenças, consumo, horas, entregas com prazo e nível de serviço (SLA). Conferir isso à mão contra o contrato é lento, e na prática ninguém faz. Os erros passam:
- licença cobrada além do contratado;
- preço acima do combinado, mesmo com preço fixo no contrato;
- consumo faturado acima do medido;
- entrega atrasada sem a multa descontada;
- SLA abaixo do mínimo sem o crédito aplicado;
- licenças pagas que ninguém usa.

## A solução: conferência em três vias

O Conforme cruza três fontes para cada item do contrato:

| Via | De onde vem | Exemplo na demo |
|---|---|---|
| **Contratado** | O texto do contrato, lido pela IA | 120 licenças da suíte a R$ 62,00 |
| **Faturado** | A nota fiscal do fornecedor (XML ou foto) | 135 licenças cobradas |
| **Entregue** | Relatórios de uso, medição, aceite e disponibilidade (CSV) | 98 licenças em uso |

Quando as vias não batem, vira uma **ocorrência**, com o trecho exato da cláusula, a linha da NF e o registro de entrega lado a lado.

## O caso da demo

Empresa fictícia **Rota Sul Logística**, fornecedor **NuvemSoft Tecnologia**, contrato **042/2026**, fatura **NF 8812** de outubro de 2026. Todos os documentos são fictícios e marcados como tal.

Resultado: **5 ocorrências e R$ 4.644,00 em jogo em um único mês de um único contrato.**

| Ocorrência | Cláusula | Em jogo |
|---|---|---|
| 15 licenças da suíte cobradas além das 120 contratadas | 2.1 | R$ 930,00 |
| CRM cobrado a R$ 198,00 em vez de R$ 180,00, com preço fixo até 31/12/2026 | 2.2 e 6.1 | R$ 720,00 |
| 66 milhões de tokens de IA faturados, 58 milhões medidos | 2.4 | R$ 720,00 |
| Implantação do CRM entregue com 12 dias de atraso, multa não descontada | 4.1 e 4.3 | R$ 720,00 |
| Disponibilidade de 98,9%, abaixo do mínimo de 99,5%, crédito não aplicado | 5.1 e 5.2 | R$ 1.554,00 |

Além das divergências, o Conforme aponta **oportunidades de economia**, que não são erro do fornecedor:
- **22 das 120 licenças da suíte contratadas e sem uso** (98 em uso): R$ 1.364,00 por mês, ou cerca de 18% da suíte parada;
- **9 usuários no plano Pro do CRM que só usam o básico**: candidatos a rebaixar de plano.

## Como a plataforma funciona (o fluxo da demo)

1. **Carteira:** os 10 contratos de software da empresa, com valor anual, renovação ("em X meses") e a classe na curva ABC. O botão **Novo contrato** cadastra um contrato a partir do texto.
2. **Painel:** a visão executiva. Mostra o gasto anual (R$ 1.550.000), quanto está em jogo, quanto se paga em licenças sem uso, as próximas renovações e a curva ABC.
3. **Contrato:** o texto do contrato à esquerda e os itens que a IA extraiu à direita. Clicar num item marca a cláusula de origem no texto, como um marca-texto. Cada item mostra se o trecho foi encontrado literalmente no contrato ("trecho conferido").
4. **Faturado × entregue:** o envio da NF (XML ou **foto pela câmera**) e do arquivo de entregas. A NF aparece renderizada ao lado de uma tabela Contratado | Faturado | Entregue | Diferença, com as linhas divergentes em vermelho. Os valores podem ser corrigidos na tela, e a conferência roda de novo.
5. **Ocorrências:** as divergências agrupadas por tipo (quantidade, valor, prazo, nível de serviço), com a evidência das três vias lado a lado. A pessoa marca cada uma como **Confirmada**, **Descartada** ou **Pendente**, comenta, e o histórico registra quem decidiu e quando.
6. **Relatório:** a IA redige o e-mail ao fornecedor só com as ocorrências confirmadas: cláusula, evidência, valor e total, pedindo nota corrigida ou crédito. A pessoa revisa e copia.

## Por que a curva ABC

Ninguém consegue conferir todos os contratos todo mês. A curva ABC ordena os contratos pelo gasto: **4 de 10 contratos somam 76% do dinheiro**. Conferindo só esses 4 (classe A), a empresa cobre 3/4 do gasto. O contrato da demo, o 042, é classe A. A curva diz por onde começar.

## O papel de cada um: IA, código e pessoa

| Quem | Faz | Não faz |
|---|---|---|
| **IA (OpenAI)** | Lê o contrato e extrai os itens (quantidade, preço, prazo, multa, franquia, SLA) com o trecho exato de origem. Lê a foto da NF. Redige o relatório ao fornecedor. | Não decide o que é divergência, não calcula valor, não inventa trecho. |
| **Código** | Compara as três vias com regras fixas e calcula o impacto de cada divergência, sempre do mesmo jeito. Confere se o trecho citado pela IA existe, palavra por palavra, no contrato. | Não interpreta juridicamente. |
| **Pessoa** | Revisa a evidência, confirma ou descarta, comenta e envia o relatório. | Não precisa refazer conta nem procurar cláusula. |

Isso torna o resultado **auditável**: cada número tem a cláusula e o documento de origem, e a conferência dá o mesmo resultado toda vez.

**Se a IA falhar,** a demo não quebra: a extração cai para os itens já cadastrados, e o relatório cai para um modelo de texto. A tela mostra a origem ("ai", "fallback", "template").

## Privacidade (LGPD)

O Conforme trabalha com **contratos, notas fiscais e contagens de uso agregadas** (quantas licenças estão em uso). Ele **não usa dados pessoais de funcionários** nem cruza listas do RH. O desligamento de pessoas é tratado no processo da empresa, que desativa a conta na saída. Por isso, o Conforme não tem nenhuma regra sobre "licenças de pessoas desligadas".

## Como atende os critérios

| Critério | Onde aparece |
|---|---|
| **Funcional** | O fluxo inteiro roda de ponta a ponta: carteira, contrato, NF, ocorrências, revisão e relatório. Os números batem com o gabarito da demo (R$ 4.644,00). |
| **Criatividade** | Conferência em **três vias** (contratado × faturado × entregue), evidência lado a lado com marca-texto na cláusula, NF por foto, curva ABC para priorizar e regras de utilização além das divergências. |
| **Apresentação** | Interface limpa, números grandes legíveis em vídeo, documentos com cara de documento (serifada) e cor usada só com significado: vermelho = divergência, verde = confere. |
| **Cumpre o desafio 8** | É exatamente um conferidor de contrato e entregas: lê o contrato, confere o que foi faturado e entregue, e documenta a divergência com evidência e decisão humana. |

## Tecnologia

- **App:** Next.js + TypeScript, publicado na Vercel.
- **Banco:** Postgres (Prisma).
- **IA:** API da OpenAI com saída estruturada (JSON Schema estrito) para a extração do contrato, e geração de texto para o relatório.
- **Motor de conferência:** função pura, sem IA dentro, coberta pelo gabarito da demo.

## Próximos passos (para fechar o pitch)

- Ler a NF direto da SEFAZ e o uso direto dos consoles dos fornecedores (Microsoft 365, Google Workspace, CRM), sem upload manual.
- Conferência automática todo mês, com alerta quando aparece uma divergência.
- Alerta de renovação com o histórico de divergências do fornecedor, para renegociar antes de renovar.
- Várias empresas e login com SSO.

## Cuidados no pitch

- **Números de mercado:** se usar alguma estatística de mercado (por exemplo, "x% das licenças ficam sem uso"), cite a fonte no slide. Os números da demo são os da tabela acima.
- **Desligados:** não falar em "pagar licenças de pessoas que já saíram". Saiu do produto por causa da LGPD (veja a seção de privacidade).
- **Dados fictícios:** a empresa, o fornecedor, o contrato e a NF são fictícios, e os documentos estão marcados como tal.
- **Foto da NF:** a tela está pronta, mas a leitura da foto com a IA depende de uma rota do back que ainda está sendo feita. Até lá, na demo, a foto devolve a NF 8812 como se tivesse sido lida. Apresente como "em demonstração", ou mostre o upload do XML.
