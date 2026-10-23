// Dan: GET /api/contracts/:id (aba Contrato).
import { getContractDetail } from "@/lib/server/service";
import { ok, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return ok(await getContractDetail(id));
});
