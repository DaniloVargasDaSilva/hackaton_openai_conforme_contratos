// Dan: GET (DANFE da aba Fatura) e POST (upload do XML da NF, lado faturado da conferência em 3 vias).
import { UploadNfBody } from "@/lib/contracts-3vias";
import { getNf, uploadNf } from "@/lib/server/service";
import { ok, parseBody, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return ok(await getNf(id));
});

export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const body = await parseBody(req, UploadNfBody);
  return ok(await uploadNf(id, body.xml));
});
