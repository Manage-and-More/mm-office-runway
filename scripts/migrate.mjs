// npm run db:migrate   (DATABASE_URL = postgres URL of role runway_app; locally: see docs/DATABASE.md)
// Applies db/migrations/*.sql that haven't run yet, in name order, each in its own transaction, then
// asks the platform whether the schema still follows the browser-lane rules and fails if not.
// CI runs this before every deploy (.github/workflows/pages.yml); nobody runs it against production by hand.
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const SCHEMA = "runway";
const dir = new URL("../db/migrations/", import.meta.url);
if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL is not set (docs/DATABASE.md → Local development).");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  const [{ current_user: user }] = await sql`select current_user`;
  if (user !== `${SCHEMA}_app`) throw new Error(`Connected as ${user}; migrations run as ${SCHEMA}_app only.`);

  await sql.begin(async (tx) => {
    // One migrator at a time, even if two deploys race.
    await tx`select pg_advisory_xact_lock(hashtext(${SCHEMA + ".migrations"}))`;
    await tx`create table if not exists runway.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    await tx`alter table runway.schema_migrations enable row level security`; // no grants, no policies: private
    const done = new Set((await tx`select name from runway.schema_migrations`).map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files.filter((f) => !done.has(f))) {
      await tx.unsafe(await readFile(new URL(file, dir), "utf8"));
      await tx`insert into runway.schema_migrations (name) values (${file})`;
      console.log(`✓ applied ${file}`);
    }
    if (files.every((f) => done.has(f))) console.log("✓ database is up to date");
  });

  const violations = await sql`select object, problem from platform.lane_violations(${SCHEMA})`;
  for (const v of violations) console.error(`✗ ${v.object}: ${v.problem}`);
  if (violations.length) throw new Error("The schema breaks the browser-lane rules (mm-platform docs/SECURITY.md § 1).");
  console.log("✓ browser-lane rules hold");
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
