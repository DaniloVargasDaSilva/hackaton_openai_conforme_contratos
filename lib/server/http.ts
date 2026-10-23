// Dan: respostas de erro no formato { error: { code, message } } e wrapper das rotas.
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DbConfigError } from "./db";

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

const FIX_TABLES = "Rode uma vez, com o DATABASE_URL do deploy: npm run db:setup (ou npx prisma db push --skip-generate && npx tsx prisma/seed.ts).";

const NETWORK_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"]);

/**
 * Traduz erro de banco em algo que o usuário consegue agir. Sem isso a rota responde 500 genérico
 * e o motivo real (tabela ausente, senha errada, pooler mal configurado) só aparece no log da Vercel.
 * Devolve null quando o erro não é de banco.
 */
export function describeDbError(error: unknown): DbProblem | null {
  if (error instanceof DbConfigError) {
    return { status: 503, code: "DB_SEM_CONEXAO", message: `${error.message}. Confira se DATABASE_URL está definida e correta no deploy.` };
  }

  const text = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown } | null)?.code;
  const sqlstate = typeof code === "string" ? code : "";

  // SQLSTATE do Postgres
  if (sqlstate === "42P01") {
    return { status: 503, code: "DB_SEM_TABELAS", message: `O banco está conectado, mas não tem as tabelas do Conforme. ${FIX_TABLES}` };
  }
  if (sqlstate === "42703") {
    return { status: 503, code: "DB_SCHEMA_DESATUALIZADO", message: "O banco tem tabelas de uma versão antiga (falta uma coluna). Rode: npx prisma db push --skip-generate, com o DATABASE_URL do deploy." };
  }
  if (sqlstate === "28P01" || sqlstate === "28000") {
    return { status: 503, code: "DB_ACESSO_NEGADO", message: "O banco recusou o usuário ou a senha do DATABASE_URL." };
  }
  if (sqlstate === "3D000") {
    return { status: 503, code: "DB_INDISPONIVEL", message: "O banco indicado no DATABASE_URL não existe nesse servidor." };
  }
  if (["53300", "53400", "57P03", "08000", "08001", "08003", "08004", "08006"].includes(sqlstate)) {
    return { status: 503, code: "DB_INDISPONIVEL", message: "O banco está indisponível ou sem conexões livres. Use a URL com pooler no DATABASE_URL e confira se o banco está ativo." };
  }

  // Rede
  if (NETWORK_CODES.has(sqlstate) || /connect(ion)? (timeout|terminated)|timeout exceeded when trying to connect/i.test(text)) {
    return { status: 503, code: "DB_INDISPONIVEL", message: "Não consegui falar com o banco. Confira o host e a porta do DATABASE_URL e se o banco está ativo." };
  }

  // Pooler do Supabase com usuário ou projeto errado
  if (/tenant or user not found/i.test(text)) {
    return { status: 503, code: "DB_ACESSO_NEGADO", message: "O pooler não reconheceu o usuário do DATABASE_URL. No Supabase o usuário é postgres.<ref-do-projeto> e o host precisa ser o do pooler do mesmo projeto." };
  }

  // Pooler em modo transação com prepared statements nomeados
  if (/prepared statement/i.test(text)) {
    return { status: 503, code: "DB_POOLER", message: "O pooler recusou prepared statements. Use a porta 6543 (modo transação) do Supabase." };
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
