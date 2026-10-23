// Dan: POST /api/contracts/:id/report (aba Relatório, com as ocorrências confirmadas).
import { generateReport } from "@/lib/server/service";
import { ok, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return ok(await generateReport(id));
});
