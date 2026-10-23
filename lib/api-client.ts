// Toda chamada ao back passa por aqui. Com NEXT_PUBLIC_USE_MOCKS=1 responde do seed,
// com os mesmos tipos e o mesmo schema zod; as telas não sabem a diferença.
import { z } from "zod";
import {
  ContractDetail,
  ContractSummary,
  InvoiceLine,
  type InvoiceLinePatch,
  Report,
  ReviewBody as ReviewBodySchema,
  ApiError,
} from "./contracts";
import {
  CheckResult3 as CheckResult,
  Health,
  NfResponse,
  Occurrence3 as Occurrence,
  UploadDeliveriesResult,
  UploadNfResult,
  type CheckResult3,
  type NfDocument,
  type Occurrence3,
  type UploadNfResult as UploadNfResultT,
  type UploadDeliveriesResult as UploadDeliveriesResultT,
  type Health as HealthT,
} from "./contracts-3vias";
import { ApiClientError } from "./api-error";
import { mocks } from "./mocks";

export type ReviewBody = z.input<typeof ReviewBodySchema>;

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "1";
// Integração parcial: NEXT_PUBLIC_MOCK_ROUTES=nf,deliveries deixa só essas no mock.
const MOCK_ROUTES = new Set(
  (process.env.NEXT_PUBLIC_MOCK_ROUTES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);

export const usingMocks = USE_MOCKS;

function mocked(route: string): boolean {
  return USE_MOCKS || MOCK_ROUTES.has(route);
}

async function request<S extends z.ZodTypeAny>(
  path: string,
  init: RequestInit | undefined,
  schema: S,
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiClientError("api_fora_do_ar", "Não consegui falar com o servidor.", 0);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const parsed = ApiError.safeParse(body);
    if (parsed.success) {
      throw new ApiClientError(parsed.data.error.code, parsed.data.error.message, res.status);
    }
    throw new ApiClientError(
      res.status >= 500 ? "erro_servidor" : "erro_requisicao",
      `O servidor respondeu ${res.status}.`,
      res.status,
    );
  }

  return parse(schema, body, path);
}

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown, where: string): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.error(`[api-client] resposta fora do contrato em ${where}`, parsed.error.issues);
    throw new ApiClientError("resposta_invalida", "A resposta do servidor veio num formato inesperado.", 200);
  }
  return parsed.data;
}

async function viaMock<S extends z.ZodTypeAny>(schema: S, run: () => Promise<unknown>, where: string) {
  return parse(schema, await run(), `mock:${where}`);
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export function getHealth(): Promise<HealthT> {
  if (mocked("health")) return viaMock(Health, mocks.getHealth, "health");
  return request("/api/health", undefined, Health);
}

export function getContracts(): Promise<z.infer<typeof ContractSummary>[]> {
  if (mocked("contracts")) return viaMock(z.array(ContractSummary), mocks.getContracts, "contracts");
  return request("/api/contracts", undefined, z.array(ContractSummary));
}

export function getContract(id: string): Promise<z.infer<typeof ContractDetail>> {
  if (mocked("contract")) return viaMock(ContractDetail, () => mocks.getContract(id), "contract");
  return request(`/api/contracts/${id}`, undefined, ContractDetail);
}

export function extractContract(id: string): Promise<z.infer<typeof ContractDetail>> {
  if (mocked("extract")) return viaMock(ContractDetail, () => mocks.extractContract(id), "extract");
  return request(`/api/contracts/${id}/extract`, { method: "POST" }, ContractDetail);
}

export function getLines(id: string): Promise<z.infer<typeof InvoiceLine>[]> {
  if (mocked("lines")) return viaMock(z.array(InvoiceLine), () => mocks.getLines(id), "lines");
  return request(`/api/contracts/${id}/invoice-lines`, undefined, z.array(InvoiceLine));
}

export async function getNf(id: string): Promise<NfDocument | null> {
  if (mocked("nf")) return (await viaMock(NfResponse, () => mocks.getNf(id), "nf")).nf;
  return (await request(`/api/contracts/${id}/nf`, undefined, NfResponse)).nf;
}

export function uploadNf(id: string, xml: string): Promise<UploadNfResultT> {
  if (mocked("nf")) return viaMock(UploadNfResult, () => mocks.uploadNf(id, xml), "uploadNf");
  return request(`/api/contracts/${id}/nf`, json({ xml }), UploadNfResult);
}

export function uploadDeliveries(id: string, csv: string): Promise<UploadDeliveriesResultT> {
  if (mocked("deliveries")) {
    return viaMock(UploadDeliveriesResult, () => mocks.uploadDeliveries(id, csv), "deliveries");
  }
  return request(`/api/contracts/${id}/deliveries`, json({ csv }), UploadDeliveriesResult);
}

export function patchLine(lineId: string, patch: InvoiceLinePatch): Promise<z.infer<typeof InvoiceLine>> {
  if (mocked("lines")) return viaMock(InvoiceLine, () => mocks.patchLine(lineId, patch), "patchLine");
  return request(`/api/invoice-lines/${lineId}`, { method: "PATCH", body: JSON.stringify(patch) }, InvoiceLine);
}

export function runCheck(id: string): Promise<CheckResult3> {
  if (mocked("check")) return viaMock(CheckResult, () => mocks.runCheck(id), "check");
  return request(`/api/contracts/${id}/check`, { method: "POST" }, CheckResult);
}

export function getCheck(id: string): Promise<CheckResult3> {
  if (mocked("check")) return viaMock(CheckResult, () => mocks.getCheck(id), "check");
  return request(`/api/contracts/${id}/check`, undefined, CheckResult);
}

export function reviewOccurrence(occId: string, body: ReviewBody): Promise<Occurrence3> {
  if (mocked("review")) return viaMock(Occurrence, () => mocks.reviewOccurrence(occId, body), "review");
  return request(`/api/occurrences/${occId}/review`, json(body), Occurrence);
}

export function generateReport(id: string): Promise<z.infer<typeof Report>> {
  if (mocked("report")) return viaMock(Report, () => mocks.generateReport(id), "report");
  return request(`/api/contracts/${id}/report`, { method: "POST" }, Report);
}
