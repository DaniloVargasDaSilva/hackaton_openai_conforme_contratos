// Dan: POST /api/demo/reset. Volta a demo ao seed para regravar o vídeo do zero.
// Só responde com DEMO_RESET_ENABLED=1; sem a flag, responde 404.
import { prisma } from "@/lib/server/db";
import { restoreDemoSeed } from "@/lib/server/demo";
import { ApiError, ok, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = route(async (req) => {
  if (process.env.DEMO_RESET_ENABLED !== "1") {
    throw new ApiError(404, "NOT_FOUND", "Rota não disponível");
  }

  // ?estado=vazio deixa a fatura sem arquivos, para enviar NF e entregas durante a gravação.
  const filled = new URL(req.url).searchParams.get("estado") !== "vazio";
  await prisma.$transaction((tx) => restoreDemoSeed(tx, { filled }), { timeout: 30_000 });
  return ok({ ok: true, resetAt: new Date().toISOString() });
});
