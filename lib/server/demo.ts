// Dan: volta o banco ao estado do data/seed-demo.json. Usado pelo prisma/seed.ts e por POST /api/demo/reset.
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import seed from "@/data/seed-demo.json";
import { applyDeliveries, applyNf } from "./billing";

const DEMO_CONTRACT_ID = seed.demoContract.id;

// Arquivos da demo: a NF 8812 e as entregas de outubro (os mesmos que o Felipe usa na gravação).
const demoFile = (name: string) => readFileSync(path.join(process.cwd(), "data", "demo", name), "utf8");

export type RestoreOptions = {
  /** true (padrão): carrega a NF e as entregas da demo. false: deixa a fatura vazia, para enviar os arquivos na gravação. */
  filled?: boolean;
};

/**
 * Apaga revisões, ocorrências, faturas, itens e cláusulas, remove os contratos criados por upload
 * e recria os contratos do seed. Roda dentro da transação do chamador (tudo ou nada).
 */
export async function restoreDemoSeed(tx: Prisma.TransactionClient, options: RestoreOptions = {}): Promise<void> {
  const { filled = true } = options;
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
      nf: Prisma.DbNull,
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
    data: seed.expectedItems.map((item, position) => ({
      ...item,
      contractId: DEMO_CONTRACT_ID,
      quoteVerified: true,
      position,
    })),
  });

  await tx.usageFact.createMany({
    data: seed.usageFacts.map((f) => ({ ...f, contractId: DEMO_CONTRACT_ID })),
  });

  // A fatura passa pelos mesmos leitores do upload (NF em XML e entregas em CSV), então o seed testa o caminho real.
  if (filled) {
    const nf = await applyNf(tx, DEMO_CONTRACT_ID, demoFile("nf-8812-ficticia.xml"));
    const deliveries = await applyDeliveries(tx, DEMO_CONTRACT_ID, demoFile("entregas-outubro.csv"));
    const errors = [...nf.errors, ...deliveries.errors];
    if (errors.length > 0) throw new Error(`Arquivos da demo inválidos: ${JSON.stringify(errors)}`);
  }

  await tx.contract.update({
    where: { id: DEMO_CONTRACT_ID },
    data: { extractionSource: "seed" },
  });
}
