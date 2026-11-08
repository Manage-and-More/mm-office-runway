// npm run db:seed: loads db/seed.local.sql (sample admin, numbers and Miis) into a LOCAL database only.
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url || !/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
  console.error("✗ db:seed only runs against the local platform stack (DATABASE_URL on 127.0.0.1).");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const seed = await readFile(new URL("../db/seed.local.sql", import.meta.url), "utf8");
  await sql.begin((tx) => tx.unsafe(seed));
  console.log("✓ seeded: admin@example.com is an admin; sample numbers and Miis loaded");
} finally {
  await sql.end();
}
