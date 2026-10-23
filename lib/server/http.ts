// Dan: respostas de erro no formato { error: { code, message } } e wrapper das rotas.
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Params = Record<string, string>;
type Ctx<P extends Params> = { params: Promise<P> };

function errorBody(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Envolve o handler: erro conhecido vira resposta com código; o resto vira 500 sem vazar detalhes. */
export function route<P extends Params = Params>(
  handler: (req: Request, ctx: Ctx<P>) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx<P>): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      if (error instanceof ApiError) return errorBody(error.status, error.code, error.message);
      if (error instanceof ZodError) {
        const first = error.issues[0];
        const where = first?.path.join(".") || "corpo";
        return errorBody(400, "VALIDATION_ERROR", `${where}: ${first?.message ?? "inválido"}`);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return errorBody(404, "NOT_FOUND", "Registro não encontrado");
      }
      console.error("[api]", error);
      return errorBody(500, "INTERNAL", "Erro interno no servidor");
    }
  };
}

/** Lê e valida o corpo JSON. */
export async function parseBody<T>(req: Request, schema: { parse(raw: unknown): T }): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Corpo da requisição não é um JSON válido");
  }
  return schema.parse(raw);
}

export function ok<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}
