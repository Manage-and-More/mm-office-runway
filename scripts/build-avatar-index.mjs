// Bundles data/avatars/*.json into data/avatar-index.json (generated, git-ignored).
// One file per donor keeps PRs conflict-free; this index is what the page loads.
// Full schema validation runs in CI (`npm run validate`); this only checks what would break the page.
import { readdir, readFile, writeFile } from "node:fs/promises";

const dir = new URL("../data/avatars/", import.meta.url);
const out = new URL("../data/avatar-index.json", import.meta.url);

const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
const avatars = [];
let failed = false;

for (const file of files) {
  const spec = JSON.parse(await readFile(new URL(file, dir), "utf8"));
  const expectedId = file.replace(/\.json$/, "");
  if (spec.id !== expectedId) {
    console.error(`✗ ${file}: id "${spec.id}" must equal the file name "${expectedId}"`);
    failed = true;
  } else if (spec.consent?.public !== true) {
    console.error(`✗ ${file}: consent.public must be true — no consent, no avatar`);
    failed = true;
  } else {
    avatars.push(spec);
  }
}

if (failed) process.exit(1);
await writeFile(out, JSON.stringify({ generatedAt: new Date().toISOString(), avatars }, null, 2) + "\n");
console.log(`✓ ${avatars.length} avatars → data/avatar-index.json`);
