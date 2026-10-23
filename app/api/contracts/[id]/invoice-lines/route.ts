// Dan: GET (aba Fatura) e POST (upload do CSV, substitui as linhas do contrato).
import { UploadInvoiceBody } from "@/lib/contracts";
import { listInvoiceLines, uploadInvoiceCsv } from "@/lib/server/service";
import { ok, parseBody, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return ok(await listInvoiceLines(id));
});

export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const body = await parseBody(req, UploadInvoiceBody);
  return ok(await uploadInvoiceCsv(id, body.csv));
});
