// Dan: seed do banco com data/seed-demo.json (npm run db:seed). A mesma rotina serve ao POST /api/demo/reset.
import { closePool, transaction } from "../lib/server/db";
import { restoreDemoSeed } from "../lib/server/demo";

async function main() {
  await transaction((tx) => restoreDemoSeed(tx));
  console.log("Seed da demo aplicado.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
