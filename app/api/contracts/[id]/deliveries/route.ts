// Dan: POST /api/contracts/:id/deliveries (upload do CSV de entregas, lado entregue da conferência em 3 vias).
import { UploadDeliveriesBody } from "@/lib/contracts-3vias";
import { uploadDeliveries } from "@/lib/server/service";
import { ok, parseBody, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const body = await parseBody(req, UploadDeliveriesBody);
  return ok(await uploadDeliveries(id, body.csv));
});
