import { describe, expect, it, vi } from "vitest";
import {
  addDays,
  addWeeks,
  compareDateKeys,
  currentDateInTimeZone,
  formatDay,
  formatTime,
  formatWeekRange,
  isValidWeek,
  localDateTimeValue,
  parseDate,
  reminderDateKey,
  startOfWorkWeek,
  toDateKey,
  visibleDays,
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
