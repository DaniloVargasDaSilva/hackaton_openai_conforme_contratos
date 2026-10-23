// Dan: GET /api/health (debug). Mostra se o banco e a IA estão disponíveis.
import { health } from "@/lib/server/service";
import { ok, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => ok(await health()));
