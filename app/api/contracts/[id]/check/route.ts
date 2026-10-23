// Dan: GET (aba Ocorrências, última conferência) e POST (reconferir depois de upload ou edição).
import { getCheck, runCheck } from "@/lib/server/service";
import { ok, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return ok(await getCheck(id));
});

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return ok(await runCheck(id));
});
