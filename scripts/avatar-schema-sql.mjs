// Prints (or checks) the SQL that stores src/contracts/avatar.schema.json in the database, so the
// avatars table validates the same contract the crowd renders.
//   node scripts/avatar-schema-sql.mjs          → prints an upsert for a new migration
//   node scripts/avatar-schema-sql.mjs --check  → fails if the newest migration holding the schema is stale
import { readFile, readdir } from "node:fs/promises";

const contract = JSON.parse(await readFile(new URL("../src/contracts/avatar.schema.json", import.meta.url), "utf8"));
delete contract.$id; // a relative $id is not a valid base URL for the database's validator (pg_jsonschema)
const canonical = JSON.stringify(contract);
const upsert = `insert into public.avatar_schema (id, schema) values (true, $avatar_schema$${canonical}$avatar_schema$::jsonb)
on conflict (id) do update set schema = excluded.schema, updated_at = now();`;

if (process.argv.includes("--check")) {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort().reverse();
  for (const file of files) {
    const sql = await readFile(new URL(file, dir), "utf8");
    const m = sql.match(/\$avatar_schema\$(.*?)\$avatar_schema\$/s);
    if (!m) continue;
    if (JSON.stringify(JSON.parse(m[1])) === canonical) { console.log(`✓ avatar schema in ${file} matches src/contracts/avatar.schema.json`); process.exit(0); }
    console.error(`✗ ${file} holds an older AvatarSpec schema. Add a migration with the output of \`node scripts/avatar-schema-sql.mjs\`.`);
    process.exit(1);
  }
  console.error("✗ no migration holds the AvatarSpec schema");
  process.exit(1);
} else {
  console.log(`-- Generated from src/contracts/avatar.schema.json by \`node scripts/avatar-schema-sql.mjs\`.\n${upsert}`);
}
