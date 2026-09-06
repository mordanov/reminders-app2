import type { Locale, Reminder } from "../types";

const dayMs = 86_400_000;
export const APP_TIME_ZONE = import.meta.env.VITE_APP_TIMEZONE ?? "Europe/Madrid";

function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentDateInTimeZone(
  now = new Date(),
  timeZone = APP_TIME_ZONE,
): Date {
  const parts = zonedParts(now, timeZone);
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
  );
}

export function startOfWorkWeek(date = currentDateInTimeZone()): Date {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = value.getDay();
  value.setDate(value.getDate() - (weekday === 0 ? 6 : weekday - 1));
  return value;
}

export function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function addWeeks(date: Date, amount: number): Date {
  return addDays(date, amount * 7);
}

export function visibleDays(weekStart: string): Date[] {
  const start = parseDate(weekStart);
  return Array.from({ length: 6 }, (_, index) => addDays(start, index));
}

export function localDateTimeValue(
  iso: string | null,
  timeZone = APP_TIME_ZONE,
): string {
  if (!iso) return "";
  const parts = zonedParts(new Date(iso), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function zonedDateTimeToIso(
  value: string,
  timeZone = APP_TIME_ZONE,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Invalid local date-time");
  const [, year, month, day, hour, minute] = match.map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  let instant = wallClock;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = zonedParts(new Date(instant), timeZone);
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    instant += wallClock - represented;
  }
  const result = new Date(instant);
  const roundTrip = zonedParts(result, timeZone);
  const expected = [year, month, day, hour, minute];
  const actual = [
    roundTrip.year,
    roundTrip.month,
    roundTrip.day,
    roundTrip.hour,
    roundTrip.minute,
  ].map(Number);
  if (actual.some((part, index) => part !== expected[index])) {
    throw new RangeError("Local date-time does not exist in the application timezone");
  }
  return result.toISOString();
}

export function reminderDateKey(reminder: Reminder): string {
  if (reminder.due_date) return reminder.due_date;
  const parts = zonedParts(
    new Date(reminder.due_at ?? reminder.created_at),
    APP_TIME_ZONE,
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatWeekRange(weekStart: string, locale: Locale): string {
  const start = parseDate(weekStart);
  const end = addDays(start, 5);
  const format = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" });
  return `${format.format(start)} — ${format.format(end)}, ${end.getFullYear()}`;
}

export function formatDay(date: Date, locale: Locale): { weekday: string; date: string } {
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date),
    date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date),
  };
}

export function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function isValidWeek(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseDate(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getDay() === 1;
}

export function compareDateKeys(a: string, b: string): number {
  return (parseDate(a).getTime() - parseDate(b).getTime()) / dayMs;
}

export function toYearMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function currentMonth(timeZone = APP_TIME_ZONE): string {
  return toYearMonth(currentDateInTimeZone(new Date(), timeZone));
}

export function prevMonth(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  const d = new Date(year, month - 2, 1);
  return toYearMonth(d);
}

export function nextMonth(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  const d = new Date(year, month, 1);
  return toYearMonth(d);
}

export function monthWeeks(ym: string): Date[][] {
  const [year, month] = ym.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const weekday = first.getDay();
  const startOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = addDays(first, startOffset);
  const rows: Date[][] = [];
  let cur = start;
  while (cur <= last || rows.length < 4) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur));
      cur = addDays(cur, 1);
    }
    rows.push(week);
    if (cur > last && rows.length >= 4) break;
  }
  return rows;
}

export function prevDay(dk: string): string {
  return toDateKey(addDays(parseDate(dk), -1));
}

export function nextDay(dk: string): string {
  return toDateKey(addDays(parseDate(dk), 1));
}

export function timeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 5; h <= 23; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 23) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}

export function slotKey(iso: string, timeZone = APP_TIME_ZONE): string {
  const parts = zonedParts(new Date(iso), timeZone);
  const h = Number(parts.hour);
  const m = Number(parts.minute) >= 30 ? 30 : 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatMonth(ym: string, locale: Locale): string {
  const [year, month] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
}

export function formatDayHeading(dk: string, locale: Locale): string {
  const date = parseDate(dk);
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(date);
}

export function isValidMonth(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}$/.test(value);
}

export function isValidDay(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(parseDate(value).getTime());
}

export function weekForDay(dk: string): string {
  return toDateKey(startOfWorkWeek(parseDate(dk)));
}

export function contrastColor(hex: string): "#000000" | "#ffffff" {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.179 ? "#000000" : "#ffffff";
}
