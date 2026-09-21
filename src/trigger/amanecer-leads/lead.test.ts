import assert from "node:assert/strict";
import test from "node:test";
import { isDuplicate, leadKeys, mountainWeekKey, storedKeys, type Business } from "./lead.js";

test("matches the same business when Maps IDs change but phone stays the same", () => {
  const oldBusiness: Business = { title: "Example HVAC", place_id: "old", phone: "(208) 555-1234", website: "https://example.com" };
  const newBusiness: Business = { title: "Example HVAC", place_id: "new", phone: "+1 208 555 1234", website: "https://www.example.com" };
  assert.equal(isDuplicate(newBusiness, new Set(leadKeys(oldBusiness))), true);
});

test("does not merge two locations that only share a company website", () => {
  const first: Business = { title: "Example HVAC", place_id: "one", phone: "208-555-1234", website: "https://example.com" };
  const second: Business = { title: "Example HVAC", place_id: "two", phone: "208-555-5678", website: "https://example.com" };
  assert.equal(isDuplicate(second, new Set(leadKeys(first))), false);
});

test("reads persisted keys from a ClickUp description", () => {
  assert.deepEqual(storedKeys('Notes\nLEAD_KEYS_JSON: ["place:abc","phone:2085551234"]\n'), ["place:abc", "phone:2085551234"]);
});

test("uses Mountain Time to keep a Sunday evening run in the previous week", () => {
  assert.equal(mountainWeekKey(new Date("2026-09-21T03:12:30Z")), "2026-09-14");
  assert.equal(mountainWeekKey(new Date("2026-09-21T14:00:00Z")), "2026-09-21");
});
