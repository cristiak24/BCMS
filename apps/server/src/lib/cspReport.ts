/**
 * Content-Security-Policy violation reports from bcms.ro (the Report-Only
 * policy in apps/client/public/_headers). Before enforcing the full policy
 * the club needs to see what it would block; until now nothing collected the
 * reports. Pure helpers, see cspReport.test.ts; routes/cspReport.ts logs them.
 */
export type CspViolation = { directive: string; blocked: string; page: string };

const MAX_FIELD = 200;
const clip = (value: unknown) => String(value ?? '').slice(0, MAX_FIELD);

/** Origin + path only: a blocked URL or page may carry tokens in its query. */
function withoutQuery(value: unknown) {
  const text = clip(value);
  try {
    const url = new URL(text);
    return `${url.origin}${url.pathname}`;
  } catch {
    return text; // 'inline', 'eval', 'data', …
  }
}

/**
 * Both report formats: `report-uri` sends {"csp-report": {...}}
 * (application/csp-report), the Reporting API an array of
 * {type: "csp-violation", body: {...}} (application/reports+json).
 */
export function parseCspReports(body: unknown): CspViolation[] {
  const items = Array.isArray(body) ? body : [body];
  const out: CspViolation[] = [];
  for (const item of items.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const legacy = record['csp-report'] as Record<string, unknown> | undefined;
    const modern = record.type === 'csp-violation' ? record.body as Record<string, unknown> | undefined : undefined;
    const report = legacy ?? modern;
    if (!report || typeof report !== 'object') continue;
    out.push({
      directive: clip(report['effective-directive'] ?? report['violated-directive'] ?? report.effectiveDirective),
      blocked: withoutQuery(report['blocked-uri'] ?? report.blockedURL),
      page: withoutQuery(report['document-uri'] ?? report.documentURL),
    });
  }
  return out;
}

/** Logs each distinct violation once per window, so a busy page can't flood the log. */
export function createViolationDeduper(windowMs = 60 * 60 * 1000, maxKeys = 500) {
  const seen = new Map<string, number>();
  return (violation: CspViolation, now = Date.now()) => {
    const key = `${violation.directive}|${violation.blocked}`;
    const last = seen.get(key);
    if (last != null && now - last < windowMs) return false;
    if (seen.size >= maxKeys) seen.clear();
    seen.set(key, now);
    return true;
  };
}
