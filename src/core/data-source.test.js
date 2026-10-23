import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRunwayRows, parseCsv } from "./data-source.js";

test("parseRunwayRows reads the public_runway view", () => {
  assert.deepEqual(parseRunwayRows([{ funds: "64832.06", monthly_cost: 7208 }]), { funds: 64832.06, monthlyCost: 7208, source: "supabase" });
});

test("parseRunwayRows refuses an empty or incomplete view so the next source is tried", () => {
  assert.throws(() => parseRunwayRows([]), /no runway numbers/);
  assert.throws(() => parseRunwayRows([{ funds: null, monthly_cost: 7208 }]), /no runway numbers/);
});

test("parseCsv keeps quoted commas", () => {
  assert.deepEqual(parseCsv('funds,monthly_cost\n"64,798",7208\n'), [["funds", "monthly_cost"], ["64,798", "7208"]]);
});
