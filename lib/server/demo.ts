// Dan: volta o banco ao estado do data/seed-demo.json. Usado pelo prisma/seed.ts e por POST /api/demo/reset.
import { Prisma } from "@prisma/client";
import seed from "@/data/seed-demo.json";
import { parseInvoiceCsv } from "./csv";

const DEMO_CONTRACT_ID = seed.demoContract.id;

/**
 * Apaga revisões, ocorrências, faturas, itens e cláusulas, remove os contratos criados por upload
 * e recria os contratos do seed. Roda dentro da transação do chamador (tudo ou nada).
 */
export async function restoreDemoSeed(tx: Prisma.TransactionClient): Promise<void> {
  const seedContractIds = seed.contracts.map((c) => c.id);

  await tx.review.deleteMany();
  await tx.occurrence.deleteMany();
  await tx.invoiceLine.deleteMany();
  await tx.usageFact.deleteMany();
  await tx.contractItem.deleteMany();
  await tx.clause.deleteMany();
  await tx.contract.deleteMany({ where: { id: { notIn: seedContractIds } } });

  for (const contract of seed.contracts) {
    const isDemo = contract.id === DEMO_CONTRACT_ID;
    const data = {
      number: contract.number,
      supplier: contract.supplier,
      object: contract.object,
      annualValue: contract.annualValue,
      renewsAt: contract.renewsAt,
      hasDemoData: contract.hasDemoData,
      text: isDemo ? seed.demoContract.text : null,
      extractionSource: isDemo ? "seed" : null,
      extractedAt: null,
      checkedAt: null,
      opportunities: Prisma.DbNull,
    };
    await tx.contract.upsert({
      where: { id: contract.id },
      create: { id: contract.id, ...data },
      update: data,
    });
  }

  await tx.clause.createMany({
    data: seed.demoContract.clauses.map((c) => ({ contractId: DEMO_CONTRACT_ID, ref: c.ref, text: c.text })),
  });

  await tx.contractItem.createMany({
    data: seed.expectedItems.map((item) => ({
      ...item,
      contractId: DEMO_CONTRACT_ID,
      quoteVerified: true,
    })),
  });

  await tx.usageFact.createMany({
    data: seed.usageFacts.map((f) => ({ ...f, contractId: DEMO_CONTRACT_ID })),
  });

  // A fatura sai do CSV da demo, pelo mesmo parser do upload. Assim o seed testa o caminho real.
  const { lines, errors } = parseInvoiceCsv(
    seed.invoiceCsv,
    new Set(seed.expectedItems.map((i) => i.id)),
  );
  if (errors.length > 0) {
    throw new Error(`CSV do seed inválido: ${JSON.stringify(errors)}`);
  }
  await tx.invoiceLine.createMany({
    data: lines.map((line, index) => ({ ...line, contractId: DEMO_CONTRACT_ID, row: index + 2 })),
  });

  await tx.contract.update({
    where: { id: DEMO_CONTRACT_ID },
    data: { extractionSource: "seed" },
  });
}
