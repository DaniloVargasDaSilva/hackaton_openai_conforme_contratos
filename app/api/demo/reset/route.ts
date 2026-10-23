// Dan: POST /api/demo/reset. Volta a demo ao seed para regravar o vídeo do zero.
// Só responde com DEMO_RESET_ENABLED=1; sem a flag, responde 404.
import { transaction } from "@/lib/server/db";
import { restoreDemoSeed } from "@/lib/server/demo";
import { ApiError, ok, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = route(async (req) => {
  if (process.env.DEMO_RESET_ENABLED !== "1") {
    throw new ApiError(404, "NOT_FOUND", "Rota não disponível");
  }

  // ?estado=limpo apaga tudo: o banco fica sem nenhum contrato (botão "Resetar dados" do topo).
  const estado = new URL(req.url).searchParams.get("estado");
  if (estado === "limpo") {
    await transaction(async (tx) => {
      await tx.query(`DELETE FROM "Contract"`);
    });
    return ok({ ok: true, resetAt: new Date().toISOString() });
  }

  // ?estado=vazio deixa a fatura sem arquivos, para enviar NF e entregas durante a gravação.
  const filled = estado !== "vazio";
  await transaction((tx) => restoreDemoSeed(tx, { filled }));
  return ok({ ok: true, resetAt: new Date().toISOString() });
});
