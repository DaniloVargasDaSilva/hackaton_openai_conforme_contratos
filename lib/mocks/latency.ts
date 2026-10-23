// Atraso e falha simulados do mock.
// Falha: NEXT_PUBLIC_MOCK_FAIL=check,report ou ?falha=check na URL; ?falha=rede derruba tudo.
import { ApiClientError } from "../api-error";

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function failures(): Set<string> {
  const set = new Set(
    (process.env.NEXT_PUBLIC_MOCK_FAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("falha");
    q?.split(",").forEach((s) => set.add(s.trim()));
  }
  return set;
}

export async function simulate(route: string, ms?: number) {
  await sleep(ms ?? 250 + Math.random() * 450);
  const f = failures();
  if (f.has("rede")) throw new ApiClientError("api_fora_do_ar", "Não consegui falar com o servidor.", 0);
  if (f.has(route)) {
    throw new ApiClientError("falha_simulada", `Falha simulada em "${route}" (mock).`, 500);
  }
}

export function seedCheio(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("seed") === "cheio";
}
