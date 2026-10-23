// Dan: POST /api/occurrences/:occId/review (Pendente / Confirmada / Descartada, com comentário e revisor).
import { ReviewBody } from "@/lib/contracts";
import { reviewOccurrence } from "@/lib/server/service";
import { ok, parseBody, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const POST = route<{ occId: string }>(async (req, { params }) => {
  const { occId } = await params;
  const body = await parseBody(req, ReviewBody);
  return ok(await reviewOccurrence(occId, body));
});
