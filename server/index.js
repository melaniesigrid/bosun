import { closeDb, getDb, migrate } from "./db/client.js";
import { createApp } from "./http/app.js";

/**
 * The Bosun API.
 *
 *   npm run api        the server alone
 *   npm run start      the server and the Vite dev server together
 *
 * With no DATABASE_URL it runs against a local PGlite database in .data/pglite,
 * so a fresh checkout needs no container and no service.
 */

const PORT = Number(process.env.PORT ?? 8787);

const db = await getDb();
const applied = await migrate(db);

const app = createApp(db);
const server = app.listen(PORT, () => {
  console.log(`
  Bosun API  http://localhost:${PORT}
  database   ${db.kind}${applied ? " (schema applied)" : ""}
  dev login  ${process.env.BOSUN_DEV_LOGIN === "1" ? "enabled" : "disabled"}
`);
});

const shutdown = async () => {
  server.close();
  await closeDb();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
