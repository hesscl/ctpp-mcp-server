import pg from "pg";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  if (!pool) {
    pool = new pg.Pool({ connectionString: url });
    pool.on("error", (err: Error) => {
      process.stderr.write(`[ctpp-mcp] DB pool error: ${err.message}\n`);
    });
  }
  return pool;
}

export async function getClient(): Promise<pg.PoolClient | null> {
  const p = getPool();
  if (!p) return null;
  try {
    return await p.connect();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[ctpp-mcp] DB connect error: ${message}\n`);
    return null;
  }
}
