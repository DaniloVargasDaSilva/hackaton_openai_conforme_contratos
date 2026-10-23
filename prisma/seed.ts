// Dan: seed do banco com data/seed-demo.json (npm run db:seed). A mesma rotina serve ao POST /api/demo/reset.
import { PrismaClient } from "@prisma/client";
import { restoreDemoSeed } from "../lib/server/demo";

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction((tx) => restoreDemoSeed(tx), { timeout: 30_000 });
  console.log("Seed da demo aplicado.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
