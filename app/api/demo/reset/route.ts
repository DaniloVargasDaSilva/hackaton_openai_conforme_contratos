// Dan: POST /api/demo/reset. Volta a demo ao seed para regravar o vídeo do zero.
// Só responde com DEMO_RESET_ENABLED=1; sem a flag, responde 404.
import { prisma } from "@/lib/server/db";
import { restoreDemoSeed } from "@/lib/server/demo";
import { ApiError, ok, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = route(async () => {
  if (process.env.DEMO_RESET_ENABLED !== "1") {
    throw new ApiError(404, "NOT_FOUND", "Rota não disponível");
  }

  await prisma.$transaction((tx) => restoreDemoSeed(tx), { timeout: 30_000 });
  return ok({ ok: true, resetAt: new Date().toISOString() });
});
