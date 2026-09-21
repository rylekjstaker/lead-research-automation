import { schedules, logger } from "@trigger.dev/sdk";
import { config as loadEnv } from "dotenv";
import { dirname, join, basename } from "node:path";
import { existsSync } from "node:fs";
import { isDuplicate, leadKeys, mountainWeekKey, normalize, outreachDraft, scoreBusiness, storedKeys, titleFor, type Business } from "./lead.js";

// Local development uses the shared SecondBrain key file. Trigger.dev production
// receives the same variables through its dashboard, where this file is absent.
let ancestor = process.cwd();
for (let depth = 0; depth < 10; depth++) {
  if (basename(ancestor) === "RylekSecondBrain") {
    const shared = join(ancestor, ".env");
    if (existsSync(shared)) loadEnv({ path: shared, quiet: true });
    break;
  }
  const parent = dirname(ancestor);
  if (parent === ancestor) break;
  ancestor = parent;
}
loadEnv({ path: ".env", quiet: true });

const CLICKUP_API = "https://api.clickup.com/api/v2";
const MARKETS = [
  "Boise Idaho", "Spokane Washington", "Fort Collins Colorado",
  "Reno Nevada", "Des Moines Iowa", "Knoxville Tennessee",
  "Wichita Kansas", "Madison Wisconsin", "Tulsa Oklahoma",
  "Colorado Springs Colorado", "Grand Rapids Michigan", "Chattanooga Tennessee",
];
const SERVICES = ["HVAC contractors", "plumbers", "electricians", "water damage restoration"];

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.json() as Promise<T>;
}

interface ClickUpTask {
  id: string;
  name: string;
  date_created?: string;
  description?: string;
  markdown_description?: string;
}

async function existingLeads(token: string, listId: string, weekKey: string): Promise<{ keys: Set<string>; names: Set<string>; weeklyCount: number }> {
  const keys = new Set<string>();
  const names = new Set<string>();
  const weeklyIds = new Set<string>();
  for (const archived of [false, true]) {
    for (let page = 0; page < 100; page++) {
      const params = new URLSearchParams({ page: String(page), include_closed: "true", archived: String(archived) });
      const data = await jsonRequest<{ tasks: ClickUpTask[] }>(`${CLICKUP_API}/list/${listId}/task?${params}`, {
        headers: { Authorization: token },
      });
      for (const task of data.tasks ?? []) {
        names.add(normalize(task.name.replace(/^\[Lead\]\s*/i, "")));
        const description = task.description ?? task.markdown_description;
        const taskKeys = storedKeys(description);
        for (const key of taskKeys) keys.add(key);
        if (taskKeys.length > 0 && (description?.includes(`RUN_WEEK: ${weekKey}`) ||
          (task.date_created && mountainWeekKey(new Date(Number(task.date_created))) === weekKey))) {
          weeklyIds.add(task.id);
        }
      }
      if (!data.tasks || data.tasks.length < 100) break;
    }
  }
  return { keys, names, weeklyCount: weeklyIds.size };
}

async function searchBusinesses(apiKey: string, query: string): Promise<Business[]> {
  const params = new URLSearchParams({ engine: "google_maps", type: "search", q: query, api_key: apiKey });
  const data = await jsonRequest<{ local_results?: Business[]; error?: string }>(`https://serpapi.com/search.json?${params}`);
  if (data.error) throw new Error(`SerpApi search failed: ${data.error}`);
  return data.local_results ?? [];
}

async function websiteText(url: string): Promise<string> {
  try {
    let current = url;
    let response: Response | undefined;
    for (let redirects = 0; redirects < 4; redirects++) {
      const parsed = new URL(current);
      const host = parsed.hostname.toLowerCase();
      if (!["http:", "https:"].includes(parsed.protocol) ||
          host === "localhost" || host.endsWith(".local") ||
          /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
          host === "[::1]") return "";
      response = await fetch(parsed, { signal: AbortSignal.timeout(5_000), redirect: "manual" });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) return "";
      current = new URL(location, parsed).toString();
    }
    if (!response || [301, 302, 303, 307, 308].includes(response.status)) return "";
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return "";
    return (await response.text()).slice(0, 150_000).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  } catch {
    return "";
  }
}

function taskDescription(business: Business, score: number, signal: boolean, weekKey: string): string {
  const keys = leadKeys(business);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business.title} ${business.address ?? ""}`)}`;
  const evidence = signal
    ? "The business website invites visitors to call or schedule service."
    : "Google Maps lists a public business phone and website; appointment flow is unverified.";
  return [
    `LEAD_KEYS_JSON: ${JSON.stringify(keys)}`,
    `RUN_WEEK: ${weekKey}`,
    "",
    `## ${business.title}`,
    `- Industry: ${business.type ?? "Local service"}`,
    `- Location: ${business.address ?? "Unknown"}`,
    `- Phone: ${business.phone ?? "Unknown"}`,
    `- Website: ${business.website ?? "Unknown"}`,
    `- Google Maps: ${mapsUrl}`,
    `- Google place ID: ${business.place_id ?? "Unavailable"}`,
    `- Google data ID: ${business.data_id ?? "Unavailable"}`,
    `- Fit score: ${score}/9`,
    "- Fit rationale: Trade service with a public phone and website; website call or booking language and moderate review count raise the score when present. Business size remains unverified.",
    `- Observed evidence: ${evidence}`,
    "- Opportunity hypothesis: Calls may go unanswered while staff are on jobs. This is unverified; ask the owner.",
    "- Discovery questions: Monthly inbound calls, missed-call rate, appointment value, current booking rules, CRM access, and who handles exceptions.",
    "",
    "## Draft outreach — review before sending",
    outreachDraft(business, signal),
    "",
    "Next action: Review the business and draft, then decide whether to contact the owner.",
  ].join("\n");
}

async function createLead(token: string, listId: string, business: Business, score: number, signal: boolean, weekKey: string): Promise<void> {
  await jsonRequest(`${CLICKUP_API}/list/${listId}/task`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ name: titleFor(business), markdown_content: taskDescription(business, score, signal, weekKey) }),
  });
}

export const amanecerMondayLeads = schedules.task({
  id: "amanecer-monday-leads",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 2 },
  run: async () => {
    const serpKey = required("SERPAPI_API_KEY");
    const clickupToken = required("CLICKUP_API_TOKEN");
    const listId = required("CLICKUP_LIST_ID");
    const weekKey = mountainWeekKey(new Date());
    const seen = await existingLeads(clickupToken, listId, weekKey);
    if (seen.weeklyCount >= 5) {
      logger.info("Amanecer weekly lead quota already met", { weekKey, existing: seen.weeklyCount });
      return { candidates: 0, eligible: 0, created: 0, alreadyPresentThisWeek: seen.weeklyCount };
    }
    const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const candidates: Business[] = [];

    // Three searches per week keep the monthly SerpApi use modest.
    for (let index = 0; index < 3; index++) {
      const market = MARKETS[(week * 3 + index) % MARKETS.length];
      const service = SERVICES[(week + index) % SERVICES.length];
      candidates.push(...await searchBusinesses(serpKey, `${service} in ${market}`));
    }

    const ranked: Array<{ business: Business; score: number; signal: boolean }> = [];
    for (const business of candidates) {
      if (!business.title || !business.phone || !business.website || (!business.place_id && !business.data_id)) continue;
      if (typeof business.reviews === "number" && business.reviews > 300) continue;
      const keys = leadKeys(business);
      if (keys.length < 2 || isDuplicate(business, seen.keys) || seen.names.has(normalize(titleFor(business).replace(/^\[Lead\]\s*/i, "")))) continue;
      const text = await websiteText(business.website);
      const signal = /call (us|now|today)|schedule|book (a|an|your)|request (service|an appointment)|24\/7|emergency service/i.test(text);
      const score = scoreBusiness(business, text);
      if (score < 6) continue;
      ranked.push({ business, score, signal });
      for (const key of keys) seen.keys.add(key);
    }

    ranked.sort((a, b) => b.score - a.score);
    let created = 0;
    for (const candidate of ranked) {
      if (created >= 5) break;
      // Re-read before every write so a retry or manual addition cannot silently duplicate a lead.
      const fresh = await existingLeads(clickupToken, listId, weekKey);
      if (fresh.weeklyCount >= 5) break;
      if (isDuplicate(candidate.business, fresh.keys) || fresh.names.has(normalize(titleFor(candidate.business).replace(/^\[Lead\]\s*/i, "")))) continue;
      await createLead(clickupToken, listId, candidate.business, candidate.score, candidate.signal, weekKey);
      created++;
    }
    logger.info("Amanecer lead search complete", { candidates: candidates.length, eligible: ranked.length, created });
    return { candidates: candidates.length, eligible: ranked.length, created };
  },
});
