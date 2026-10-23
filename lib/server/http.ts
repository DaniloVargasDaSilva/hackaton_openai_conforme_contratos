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

export type DbProblem = { status: number; code: string; message: string };

const FIX_TABLES = "Rode uma vez, com o DATABASE_URL do deploy: npm run db:setup (ou npx prisma db push && npx tsx prisma/seed.ts).";

/**
 * Traduz erro do Prisma em algo que o usuário consegue agir. Sem isso a rota responde 500 genérico
 * e o motivo real (tabela ausente, senha errada, pooler mal configurado) só aparece no log da Vercel.
 * Devolve null quando o erro não é de banco.
 */
export function describeDbError(error: unknown): DbProblem | null {
  const text = error instanceof Error ? error.message : String(error);

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2021":
        return { status: 503, code: "DB_SEM_TABELAS", message: `O banco está conectado, mas não tem as tabelas do Conforme. ${FIX_TABLES}` };
      case "P2022":
        return { status: 503, code: "DB_SCHEMA_DESATUALIZADO", message: `O banco tem tabelas de uma versão antiga (falta uma coluna). Rode: npx prisma db push, com o DATABASE_URL do deploy.` };
      case "P1000":
      case "P1010":
        return { status: 503, code: "DB_ACESSO_NEGADO", message: "O banco recusou o usuário ou a senha do DATABASE_URL." };
      case "P1001":
      case "P1002":
      case "P1008":
      case "P1017":
        return { status: 503, code: "DB_INDISPONIVEL", message: "Não consegui falar com o banco. Confira o host e a porta do DATABASE_URL e se o banco está ativo." };
      case "P2024":
        return { status: 503, code: "DB_INDISPONIVEL", message: "Todas as conexões com o banco estão ocupadas. Use a URL com pooler no DATABASE_URL." };
    }
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return { status: 503, code: "DB_SEM_CONEXAO", message: "Não consegui abrir a conexão com o banco. Confira se DATABASE_URL está definida e correta no deploy." };
  }

  // Pooler em modo transação (Supabase :6543, PgBouncer) sem o parâmetro que desliga prepared statements.
  if (/prepared statement/i.test(text)) {
    return { status: 503, code: "DB_POOLER", message: "A URL do banco usa pooler sem `?pgbouncer=true`. Acrescente esse parâmetro ao DATABASE_URL." };
  }

  return null;
}

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
      const db = describeDbError(error);
      if (db) return errorBody(db.status, db.code, db.message);
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
