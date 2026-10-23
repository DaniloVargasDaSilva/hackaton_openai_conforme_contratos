// Dan: acesso direto ao Postgres (driver pg), sem Prisma. O Prisma fica só para descrever o schema (db push).
//
// Funciona com a conexão direta e com o pooler do Supabase em modo transação (porta 6543): só usa
// consultas parametrizadas sem nome, que o pooler aceita. SSL é ligado para qualquer host que não seja local.
import { Pool, types, type QueryResultRow } from "pg";

// TIMESTAMP sem fuso: o driver interpretaria no fuso do servidor. Tudo é gravado e lido em UTC.
types.setTypeParser(1114, (value: string) => new Date(`${value.replace(" ", "T")}Z`));

/**
 * Conexão fixa no código: projeto, hosts do pooler, usuário e porta já estão aqui. Só a SENHA vem do ambiente,
 * numa variável de nome novo (SUPABASE_DB_PASSWORD), para não haver como ela apontar para outro banco, que era
 * o erro do DATABASE_URL antigo da Vercel. Com SUPABASE_DB_PASSWORD definida, o DATABASE_URL é ignorado.
 *
 * Este repositório é público: não escreva a senha neste arquivo. Ela ficaria no histórico do Git para sempre.
 * DB_USE_ENV=1 ignora a conexão fixa e usa o DATABASE_URL (é o que os testes locais fazem).
 */
const FIXED_CONNECTION = {
  project: "xymoparfkffdrpohfhjp",
  password: process.env.SUPABASE_DB_PASSWORD ?? "",
  database: "postgres",
  port: 6543,
  // Hosts do pooler (modo transação) tentados em ordem. Projetos novos usam aws-1; os antigos, aws-0.
  hosts: ["aws-1-us-east-1.pooler.supabase.com", "aws-0-us-east-1.pooler.supabase.com"],
};

/** DATABASE_URL ausente ou ilegível. */
export class DbConfigError extends Error {}

export type Db = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<T[]>;
};

export type ConnectionTarget = { host: string; port: string; database: string | null; project: string | null };

type Candidate = { config: ConstructorParameters<typeof Pool>[0]; target: ConnectionTarget };

const g = globalThis as unknown as { __conformePool?: Promise<Pool>; __conformeTarget?: ConnectionTarget };

const BASE = {
  max: Number(process.env.DB_POOL_MAX ?? 4),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
  query_timeout: 30_000,
};

// O certificado do pooler do Supabase não está na cadeia padrão do Node. Não é o ideal (a conexão é
// criptografada, mas o servidor não é verificado); aceitável para a demo.
const SSL = { rejectUnauthorized: false };

function candidates(): Candidate[] {
  if (FIXED_CONNECTION.password && process.env.DB_USE_ENV !== "1") {
    return FIXED_CONNECTION.hosts.map((host) => ({
      config: {
        ...BASE,
        host,
        port: FIXED_CONNECTION.port,
        user: `postgres.${FIXED_CONNECTION.project}`,
        password: FIXED_CONNECTION.password,
        database: FIXED_CONNECTION.database,
        ssl: SSL,
      },
      target: { host, port: String(FIXED_CONNECTION.port), database: FIXED_CONNECTION.database, project: FIXED_CONNECTION.project },
    }));
  }

  const raw = process.env.DATABASE_URL;
  if (!raw) throw new DbConfigError("DATABASE_URL não está definida");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DbConfigError("DATABASE_URL não é uma URL válida");
  }

  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || url.searchParams.get("sslmode") === "disable";
  const user = decodeURIComponent(url.username);
  const database = decodeURIComponent(url.pathname.replace(/^\//, "") || "postgres");
  return [
    {
      config: {
        ...BASE,
        host: url.hostname,
        port: Number(url.port || 5432),
        user,
        password: decodeURIComponent(url.password),
        database,
        ssl: local ? false : SSL,
      },
      target: {
        host: url.hostname,
        port: url.port || "5432",
        database,
        // Supabase: o usuário do pooler é "postgres.<ref>"; a conexão direta tem o host "db.<ref>.supabase.co".
        project: user.split(".")[1] ?? url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null,
      },
    },
  ];
}

/** Abre o pool no primeiro candidato que responder. Guarda qual foi. */
async function createPool(): Promise<Pool> {
  let lastError: unknown = new DbConfigError("Nenhuma conexão configurada");
  for (const candidate of candidates()) {
    const pool = new Pool(candidate.config);
    // Conexão ociosa derrubada pelo servidor não pode derrubar o processo.
    pool.on("error", (error) => console.error("[db] conexão ociosa com erro:", error.message));
    try {
      await pool.query("SELECT 1");
      g.__conformeTarget = candidate.target;
      return pool;
    } catch (error) {
      lastError = error;
      await pool.end().catch(() => undefined);
      console.error(`[db] sem conexão em ${candidate.target.host}:`, error instanceof Error ? error.message : error);
    }
  }
  throw lastError;
}

function getPool(): Promise<Pool> {
  if (!g.__conformePool) {
    g.__conformePool = createPool().catch((error) => {
      g.__conformePool = undefined; // a próxima requisição tenta de novo
      throw error;
    });
  }
  return g.__conformePool;
}

/** Para onde o app está conectado (sem senha). null se ainda não conectou. */
export function getConnectionTarget(): ConnectionTarget | null {
  return g.__conformeTarget ?? null;
}

/** Consulta avulsa. Devolve só as linhas. */
export const db: Db = {
  async query(text, values) {
    const result = await (await getPool()).query(text, values as unknown[]);
    return result.rows;
  },
};

/** Roda `fn` numa transação: confirma se terminar bem, desfaz se der erro. */
export async function transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const client = await (await getPool()).connect();
  const tx: Db = {
    async query(text, values) {
      const result = await client.query(text, values as unknown[]);
      return result.rows;
    },
  };

  let broken = false;
  try {
    await client.query("BEGIN");
    const out = await fn(tx);
    await client.query("COMMIT");
    return out;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true; // não deu nem para desfazer: descarta a conexão
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

/**
 * INSERT de várias linhas numa consulta só. Poucas idas ao banco de propósito: com o banco em outra
 * região cada consulta custa uma ida e volta de rede.
 */
export async function insertMany(db: Db, table: string, columns: string[], rows: unknown[][]): Promise<void> {
  if (rows.length === 0) return;
  const params: unknown[] = [];
  const tuples = rows.map(
    (row) =>
      `(${row
        .map((value) => {
          params.push(value);
          return `$${params.length}`;
        })
        .join(", ")})`,
  );
  const cols = columns.map((c) => `"${c}"`).join(", ");
  await db.query(`INSERT INTO "${table}" (${cols}) VALUES ${tuples.join(", ")}`, params);
}

/** Fecha o pool (scripts: o seed precisa terminar o processo). */
export async function closePool(): Promise<void> {
  if (g.__conformePool) {
    const pool = await g.__conformePool.catch(() => undefined);
    g.__conformePool = undefined;
    await pool?.end();
  }
}
