// Dan: GET /api/contracts (carteira) e POST /api/contracts (upload de contrato).
import { CreateContractBody } from "@/lib/contracts";
import { createContract, listContracts } from "@/lib/server/service";
import { ok, parseBody, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => ok(await listContracts()));

export const POST = route(async (req) => {
  const body = await parseBody(req, CreateContractBody);
  return ok(await createContract(body), 201);
});
