import { describe, expect, it, vi } from "vitest";
import {
  addDays,
  addWeeks,
  compareDateKeys,
  currentDateInTimeZone,
  formatDay,
  formatDayHeading,
  formatMonth,
  formatTime,
  formatWeekRange,
  isValidDay,
  isValidMonth,
  isValidWeek,
  localDateTimeValue,
  monthWeeks,
  nextDay,
  nextMonth,
  parseDate,
  prevDay,
  prevMonth,
  reminderDateKey,
  slotKey,
  startOfWorkWeek,
  timeSlots,
  toDateKey,
  toYearMonth,
  visibleDays,
  weekForDay,
  zonedDateTimeToIso,
} from "./date";
import type { Reminder } from "../types";

describe("date utilities", () => {
  it("parses, formats, and moves calendar dates without UTC drift", () => {
    const date = parseDate("2026-08-24");
    expect(toDateKey(date)).toBe("2026-08-24");
    expect(toDateKey(addDays(date, 2))).toBe("2026-08-26");
    expect(toDateKey(addWeeks(date, 1))).toBe("2026-08-31");
    expect(visibleDays("2026-08-24").map(toDateKey)).toEqual([
      "2026-08-24", "2026-08-25", "2026-08-26",
      "2026-08-27", "2026-08-28", "2026-08-29",
    ]);
    expect(compareDateKeys("2026-08-26", "2026-08-24")).toBe(2);
  });

  it("finds Monday for weekdays and Sunday", () => {
    expect(toDateKey(startOfWorkWeek(new Date(2026, 7, 27)))).toBe("2026-08-24");
    expect(toDateKey(startOfWorkWeek(new Date(2026, 7, 30)))).toBe("2026-08-24");
    expect(
      toDateKey(currentDateInTimeZone(new Date("2026-08-30T23:30:00Z"), "Europe/Madrid")),
    ).toBe("2026-08-31");
  });

  it("validates bookmarkable Monday week values", () => {
    expect(isValidWeek("2026-08-24")).toBe(true);
    expect(isValidWeek("2026-08-25")).toBe(false);
    expect(isValidWeek("bad")).toBe(false);
    expect(isValidWeek(null)).toBe(false);
    expect(isValidWeek("2026-99-99")).toBe(false);
  });

  it("uses due date or local date-time for reminder grouping", () => {
    const base: Reminder = {
      id: "1",
      calendar_id: "c",
      kind: "DAY",
      text: "Task",
      due_date: "2026-08-24",
      due_at: null,
      day_order: 0,
      completed: false,
      version: 1,
      tag_ids: [],
      created_at: "2026-08-20T10:00:00Z",
    };
    expect(reminderDateKey(base)).toBe("2026-08-24");
    expect(reminderDateKey({ ...base, kind: "DATETIME", due_date: null, due_at: "2026-08-25T10:00:00" })).toBe("2026-08-25");
    expect(reminderDateKey({ ...base, kind: "DATETIME", due_date: null, due_at: null })).toBe("2026-08-20");
  });

  it("validates day and month params", () => {
    expect(isValidDay("2026-09-07")).toBe(true);
    expect(isValidDay("bad-format")).toBe(false);
    expect(isValidDay("bad")).toBe(false);
    expect(isValidDay(null)).toBe(false);
    expect(isValidMonth("2026-09")).toBe(true);
    expect(isValidMonth("bad")).toBe(false);
    expect(isValidMonth(null)).toBe(false);
  });

  it("navigates months, days, and locates week start for a day", () => {
    expect(prevMonth("2026-09")).toBe("2026-08");
    expect(nextMonth("2026-09")).toBe("2026-10");
    expect(prevMonth("2026-01")).toBe("2025-12");
    expect(nextMonth("2025-12")).toBe("2026-01");
    expect(prevDay("2026-09-07")).toBe("2026-09-06");
    expect(nextDay("2026-09-07")).toBe("2026-09-08");
    expect(weekForDay("2026-09-09")).toBe("2026-09-07"); // Wednesday → Monday
    expect(toYearMonth(new Date(2026, 8, 7))).toBe("2026-09");
  });

  it("generates a 37-slot time grid and resolves slot keys", () => {
    const slots = timeSlots();
    expect(slots).toHaveLength(37);
    expect(slots[0]).toBe("05:00");
    expect(slots[slots.length - 1]).toBe("23:00");
    // UTC 10:00 → 12:00 Europe/Madrid (UTC+2 in Sep) → slot "12:00"
    expect(slotKey("2026-09-07T10:00:00Z", "Europe/Madrid")).toBe("12:00");
    // UTC 10:31 → 12:31 → floor to 30-min → "12:30"
    expect(slotKey("2026-09-07T10:31:00Z", "Europe/Madrid")).toBe("12:30");
  });

  it("generates month week rows covering the full month", () => {
    const weeks = monthWeeks("2026-09");
    // September 2026 spans 5 weeks (Sep 1 is Tue, so first row has Aug dates)
    expect(weeks.length).toBeGreaterThanOrEqual(4);
    expect(weeks.length).toBeLessThanOrEqual(6);
    // Each row has 7 days
    expect(weeks[0]).toHaveLength(7);
    // The month includes September 1
    const allDays = weeks.flat().map(toDateKey);
    expect(allDays).toContain("2026-09-01");
    expect(allDays).toContain("2026-09-30");
  });

  it("formats month and day headings in locale", () => {
    expect(formatMonth("2026-09", "ru")).toMatch(/сентябр/i);
    expect(formatMonth("2026-09", "en")).toMatch(/September/);
    expect(formatDayHeading("2026-09-07", "en")).toMatch(/Monday/);
    expect(formatDayHeading("2026-09-07", "ru")).toMatch(/понедельник/i);
  });

  it("provides localized labels and input values", () => {
    expect(formatWeekRange("2026-08-24", "en")).toContain("August");
    expect(formatDay(parseDate("2026-08-24"), "en").weekday.toLowerCase()).toBe("monday");
    expect(formatTime("2026-08-24T09:15:00Z", "en")).toMatch(/11:15/);
    expect(localDateTimeValue(null)).toBe("");
    vi.stubEnv("TZ", "UTC");
    expect(localDateTimeValue("2026-08-24T09:15:00Z")).toBe("2026-08-24T11:15");
    expect(zonedDateTimeToIso("2026-08-24T11:15")).toBe("2026-08-24T09:15:00.000Z");
    expect(() => zonedDateTimeToIso("invalid")).toThrow(RangeError);
    expect(() =>
      zonedDateTimeToIso("2026-03-27T02:30", "Asia/Jerusalem"),
    ).toThrow(RangeError);
    vi.unstubAllEnvs();
  });
});
