// Date normalization for user-supplied travel dates.
// Handles absolute dates, day-only/relative phrases, and dates embedded in sentences.

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function pad(n: number | string): string {
  return String(n).padStart(2, "0");
}

function monthNum(name: string): string | null {
  return MONTHS[name.slice(0, 3).toLowerCase()] ?? null;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function fmt(year: string, month: string, day: string): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Choose the next upcoming occurrence of a month/day relative to now. */
function pickYear(now: Date, day: number, month: string): number {
  const candidate = new Date(now.getFullYear(), Number(month) - 1, day);
  return candidate.getTime() >= startOfDay(now).getTime()
    ? now.getFullYear()
    : now.getFullYear() + 1;
}

/**
 * Normalize common date formats (including dates inside sentences) to ISO
 * (YYYY-MM-DD). Returns the raw input when nothing parseable is found.
 */
export function normalizeDate(raw: string, now: Date = new Date()): string {
  const s = raw.trim();
  if (!s) return s;

  // Already ISO (idempotent).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  let m: RegExpMatchArray | null;

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  m = s.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return fmt(m[3], m[2], m[1]);

  // "15 October 2026" / "15th October 2026"
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (m && monthNum(m[2])) return fmt(m[3], monthNum(m[2])!, m[1]);

  // "October 15, 2026" / "October 15 2026"
  m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m && monthNum(m[1])) return fmt(m[3], monthNum(m[1])!, m[2]);

  // "14 of this month" / "14th of next month" / "14 this month"
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(this|next)\s+month/);
  if (m) {
    const base = new Date(
      now.getFullYear(),
      now.getMonth() + (m[2] === "next" ? 1 : 0),
      1,
    );
    return fmt(String(base.getFullYear()), String(base.getMonth() + 1), m[1]);
  }

  // "15 October" / "15th October" (no year -> next upcoming occurrence)
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})/);
  if (m && monthNum(m[2])) {
    const year = pickYear(now, Number(m[1]), monthNum(m[2])!);
    return fmt(String(year), monthNum(m[2])!, m[1]);
  }

  // "October 15" (no year)
  m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?/);
  if (m && monthNum(m[1])) {
    const year = pickYear(now, Number(m[2]), monthNum(m[1])!);
    return fmt(String(year), monthNum(m[1])!, m[2]);
  }

  // Bare day "14" / "14th" -> current month (roll forward if already passed)
  m = s.match(/(?:^|\s)(\d{1,2})(?:st|nd|rd|th)?(?:\s|$)/);
  if (m && /^\d{1,2}$/.test(m[1])) {
    const day = Number(m[1]);
    if (day >= 1 && day <= 31) {
      let base = new Date(now.getFullYear(), now.getMonth(), 1);
      if (day < now.getDate()) {
        base = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      }
      return fmt(
        String(base.getFullYear()),
        String(base.getMonth() + 1),
        String(day),
      );
    }
  }

  const lower = s.toLowerCase();

  // Relative phrases.
  if (lower.includes("today")) return iso(now);
  if (lower.includes("day after tomorrow")) return iso(addDays(now, 2));
  if (lower.includes("tomorrow")) return iso(addDays(now, 1));
  if (lower.includes("next week")) return iso(addDays(now, 7));
  if (lower.includes("next month")) {
    return iso(new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()));
  }
  m = lower.match(/in\s+(\d+)\s+days?/);
  if (m) return iso(addDays(now, Number(m[1])));
  m = lower.match(/in\s+(\d+)\s+weeks?/);
  if (m) return iso(addDays(now, Number(m[1]) * 7));

  // Best-effort JS parse for anything date-ish.
  if (/[A-Za-z]{3,}|\d{4}|[/\-.]/.test(s)) {
    const d = new Date(s);
    if (
      !Number.isNaN(d.getTime()) &&
      d.getFullYear() >= 1970 &&
      d.getFullYear() < 2100
    ) {
      return iso(d);
    }
  }

  return raw;
}
