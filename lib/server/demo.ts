// Dan: volta o banco ao estado do data/seed-demo.json. Usado pelo prisma/seed.ts e por POST /api/demo/reset.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import seed from "@/data/seed-demo.json";
import { applyDeliveries, applyNf } from "./billing";
import { insertMany, type Db } from "./db";

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
export async function restoreDemoSeed(tx: Db, options: RestoreOptions = {}): Promise<void> {
  const { filled = true } = options;

  // As chaves estrangeiras têm ON DELETE CASCADE: apagar os contratos leva junto revisões, ocorrências,
  // faturas, itens, cláusulas e fatos de uso. Isso também remove os contratos criados por upload.
  // Poucas consultas de propósito: com o banco em outra região cada uma custa uma ida e volta de rede.
  await tx.query(`DELETE FROM "Contract"`);

  await insertMany(
    tx,
    "Contract",
    ["id", "number", "supplier", "object", "annualValue", "renewsAt", "hasDemoData", "text", "extractionSource"],
    seed.contracts.map((c) => {
      const isDemo = c.id === DEMO_CONTRACT_ID;
      return [c.id, c.number, c.supplier, c.object, c.annualValue, c.renewsAt, c.hasDemoData, isDemo ? seed.demoContract.text : null, isDemo ? "seed" : null];
    }),
  );

  await insertMany(
    tx,
    "Clause",
    ["id", "contractId", "ref", "text"],
    seed.demoContract.clauses.map((c) => [randomUUID(), DEMO_CONTRACT_ID, c.ref, c.text]),
  );

  await insertMany(
    tx,
    "ContractItem",
    ["id", "contractId", "position", "name", "kind", "unit", "quantity", "unitPrice", "dueDate", "penaltyPerDayPct", "penaltyCapPct", "franchiseQty", "overageUnitPrice", "slaMinPct", "slaCreditPct", "slaBaseItemIds", "clauseRefs", "quote", "quoteVerified"],
    seed.expectedItems.map((i, position) => [
      i.id, DEMO_CONTRACT_ID, position, i.name, i.kind, i.unit, i.quantity, i.unitPrice, i.dueDate,
      i.penaltyPerDayPct, i.penaltyCapPct, i.franchiseQty, i.overageUnitPrice, i.slaMinPct, i.slaCreditPct,
      i.slaBaseItemIds, i.clauseRefs, i.quote, true,
    ]),
  );

  await insertMany(
    tx,
    "UsageFact",
    ["id", "contractId", "itemId", "terminatedAssigned", "overPlanUsers"],
    seed.usageFacts.map((f) => [randomUUID(), DEMO_CONTRACT_ID, f.itemId, f.terminatedAssigned, f.overPlanUsers]),
  );

  // A fatura passa pelos mesmos leitores do upload (NF em XML e entregas em CSV), então o seed testa o caminho real.
  if (filled) {
    const nf = await applyNf(tx, DEMO_CONTRACT_ID, demoFile("nf-8812-ficticia.xml"));
    const deliveries = await applyDeliveries(tx, DEMO_CONTRACT_ID, demoFile("entregas-outubro.csv"));
    const errors = [...nf.errors, ...deliveries.errors];
    if (errors.length > 0) throw new Error(`Arquivos da demo inválidos: ${JSON.stringify(errors)}`);
  }
}
