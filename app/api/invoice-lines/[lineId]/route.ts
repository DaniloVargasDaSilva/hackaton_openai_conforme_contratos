// Dan: PATCH /api/invoice-lines/:lineId (edição de célula na aba Fatura).
import { InvoiceLinePatch } from "@/lib/contracts";
import { patchInvoiceLine } from "@/lib/server/service";
import { ok, parseBody, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const PATCH = route<{ lineId: string }>(async (req, { params }) => {
  const { lineId } = await params;
  const patch = await parseBody(req, InvoiceLinePatch);
  return ok(await patchInvoiceLine(lineId, patch));
});
