// Dan: POST /api/contracts/:id/extract (botão "Extrair de novo com IA"). Responde com o detalhe do contrato.
import { extractContract } from "@/lib/server/service";
import { ok, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";
// A extração chama a OpenAI com timeout de 20 s, então precisa de folga além do padrão.
export const maxDuration = 30;

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  return ok(await extractContract(id));
});
