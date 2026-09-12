import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCHEMA = resolve(ROOT, "db/001_initial.sql");

/**
 * The database connection.
 *
 * Everything above this speaks one method (`query(text, params)`) which is
 * what lets the same query layer run against Postgres in production and against
 * PGlite in tests and local development. See server/db/queries.js.
 *
 * With no DATABASE_URL set, local development gets a real Postgres compiled to
 * WASM, persisted to .data/pglite. No container, no install, no service to
 * remember to start. That is the difference between this project being runnable
 * on a fresh machine and not.
 */

let client;

async function connectPostgres(url) {
  let pg;
  try {
    pg = await import("pg");
  } catch {
    throw new Error(
      "DATABASE_URL is set but the 'pg' package is not installed. " +
        "Run `npm install pg`, or unset DATABASE_URL to use the local PGlite database.",
    );
  }
  const pool = new pg.default.Pool({ connectionString: url });
  return {
    kind: "postgres",
    query: (text, params) => pool.query(text, params),
    exec: (sql) => pool.query(sql),
    close: () => pool.end(),
  };
}

async function connectPGlite(dir) {
  // PGlite will not create a missing parent, so a fresh checkout fails on the
  // very first run without this.
  mkdirSync(dir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { citext } = await import("@electric-sql/pglite/contrib/citext");
  const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
  const db = await PGlite.create(dir, { extensions: { pgcrypto, citext } });
  return {
    kind: "pglite",
    query: (text, params) => db.query(text, params),
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
  };
}

/** Apply the schema if this database has never seen it. */
export async function migrate(db) {
  const { rows } = await db.query(
    `SELECT to_regclass('public.tenants') IS NOT NULL AS present`,
  );
  if (rows[0]?.present) return false;
  await db.exec(readFileSync(SCHEMA, "utf8"));
  return true;
}

export async function getDb() {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  client = url
    ? await connectPostgres(url)
    : await connectPGlite(process.env.PGLITE_DIR ?? resolve(ROOT, ".data/pglite"));
  return client;
}

export async function closeDb() {
  if (!client) return;
  await client.close();
  client = undefined;
}
