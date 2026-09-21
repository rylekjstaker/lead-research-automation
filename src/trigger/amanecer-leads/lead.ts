export interface Business {
  title: string;
  address?: string;
  phone?: string;
  website?: string;
  type?: string;
  reviews?: number;
  rating?: number;
  place_id?: string;
  data_id?: string;
}

export function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");
}

export function domainOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function leadKeys(business: Business): string[] {
  const keys: string[] = [];
  if (business.place_id) keys.push(`place:${business.place_id}`);
  if (business.data_id) keys.push(`data:${business.data_id}`);
  const phone = business.phone?.replace(/\D/g, "");
  const domain = domainOf(business.website);
  if (phone && phone.length >= 10) keys.push(`phone:${phone.slice(-10)}`);
  if (domain && phone && phone.length >= 10) keys.push(`domainphone:${domain}|${phone.slice(-10)}`);
  if (domain && business.address) keys.push(`domainaddress:${domain}|${normalize(business.address)}`);
  return keys;
}

export function storedKeys(description?: string): string[] {
  const line = description?.match(/^LEAD_KEYS_JSON:\s*(\[[^\n]*\])/m)?.[1];
  if (!line) return [];
  try {
    const value: unknown = JSON.parse(line);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function isDuplicate(business: Business, seen: Set<string>): boolean {
  return leadKeys(business).some((key) => seen.has(key));
}

export function scoreBusiness(business: Business, websiteText: string): number {
  let score = 0;
  const service = `${business.title} ${business.type ?? ""}`.toLowerCase();
  if (/hvac|heating|cooling|air condition|plumb|electric|restoration|roof/.test(service)) score += 3;
  if (business.phone) score += 2;
  if (business.website) score += 1;
  if (/call (us|now|today)|schedule|book (a|an|your)|request (service|an appointment)|24\/7|emergency service/i.test(websiteText)) score += 2;
  if (typeof business.reviews === "number" && business.reviews >= 5 && business.reviews <= 300) score += 1;
  return score;
}

export function titleFor(business: Business): string {
  return `[Lead] ${business.title} — ${business.address ?? "location unknown"}`;
}

export function outreachDraft(business: Business, hasCallSignal: boolean): string {
  const opening = hasCallSignal
    ? `I noticed your site invites customers to call or schedule service.`
    : `I came across your ${business.type ?? "service"} business in ${business.address ?? "your area"}.`;
  return `Hi ${business.title} team,\n\n${opening} Amanecer AI builds an AI receptionist that answers inbound calls, captures the details, books or updates appointments within your rules, and records each conversation in your CRM. If calls are arriving while your team is busy on jobs, would a 20-minute conversation about your current call flow be useful?\n\nRylek\nAmanecer AI`;
}

export function mountainWeekKey(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(at);
  const number = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const date = new Date(Date.UTC(number("year"), number("month") - 1, number("day")));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
