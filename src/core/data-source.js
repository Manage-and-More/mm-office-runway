// Loads { funds, monthlyCost } from a published Google Sheet (CSV), falling back to data.json.

function toNumber(raw) {
  const n = Number(String(raw).replace(/[^\d.\-]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Not a number: ${raw}`);
  return n;
}

// Tiny CSV parser: handles quoted fields ("1,234") and escaped quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function fromSheet(url) {
  // Cache-buster: published sheets are CDN-cached for a few minutes.
  const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`);
  if (!res.ok) throw new Error(`Sheet HTTP ${res.status}`);
  const [header, first] = parseCsv(await res.text());
  if (!first) throw new Error("Sheet has no data row");
  const col = (name) => {
    const i = header.findIndex((h) => h.trim().toLowerCase() === name);
    if (i < 0) throw new Error(`Sheet is missing the "${name}" column`);
    return toNumber(first[i]);
  };
  return { funds: col("funds"), monthlyCost: col("monthly_cost"), source: "sheet" };
}

async function fromJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`JSON HTTP ${res.status}`);
  const data = await res.json();
  return { funds: toNumber(data.funds), monthlyCost: toNumber(data.monthlyCost), source: "json" };
}

export async function loadFunds({ sheetCsvUrl, fallbackJsonUrl }) {
  if (sheetCsvUrl) {
    try {
      return await fromSheet(sheetCsvUrl);
    } catch (err) {
      console.warn("Sheet failed, using fallback:", err);
    }
  }
  return fromJson(fallbackJsonUrl);
}
