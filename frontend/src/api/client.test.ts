import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpApi, request } from "./client";
import type { Calendar, Category, FloatingTask, Notebook, Reminder, ReminderDraft } from "../types";

const calendar: Calendar = {
  id: "calendar-1",
  owner_id: "user-1",
  name: "Work",
  color: "#556B58",
  text_color: "#FFFFFF",
  version: 3,
  is_owner: true,
};
const category: Category = {
  id: "category-1",
  owner_id: "user-1",
  name: "Books",
  position: 0,
  global_category: false,
  version: 2,
};
const reminder: Reminder = {
  id: "reminder-1",
  calendar_id: calendar.id,
  kind: "DAY",
  text: "Task",
  due_date: "2026-08-24",
  due_at: null,
  day_order: 0,
  completed: false,
  version: 4,
  tag_ids: [],
  created_at: "2026-08-20T00:00:00Z",
};
const notebook: Notebook = {
  id: "notebook-1",
  owner_id: "user-1",
  title: "My Notebook",
  content: "<p>Hello</p>",
  position: 0,
  version: 1,
  created_at: "2026-09-05T00:00:00Z",
  updated_at: "2026-09-05T00:00:00Z",
};
const floating: FloatingTask = {
  id: "floating-1",
  calendar_id: calendar.id,
  category_id: category.id,
  text: "Read",
  completed: false,
  position: 0,
  version: 5,
};
const draft: ReminderDraft = {
  calendar_id: calendar.id,
  kind: "DAY",
  text: "Task",
  due_date: "2026-08-24",
  due_at: null,
  completed: false,
  tag_ids: [],
  weekly_count: 1,
};

describe("HTTP API contract", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("matches every backend route, query name, method, and versioned payload", async () => {
    await httpApi.me();
    await httpApi.preferences();
    await httpApi.updatePreferences({ locale: "en", selected_calendar_ids: [calendar.id] });
    await httpApi.calendars();
    await httpApi.createCalendar({ name: "Work", color: "#556B58" });
    await httpApi.updateCalendar(calendar, { name: "Focus", color: "#37667A" });
    await httpApi.deleteCalendar(calendar);
    await httpApi.shares(calendar.id);
    await httpApi.addShare(calendar.id, "alex");
    await httpApi.removeShare(calendar.id, "user-2");
    await httpApi.tags(calendar.id);
    await httpApi.createTag(calendar.id, "focus");
    await httpApi.week("2026-08-24", [calendar.id, "calendar-2"]);
    await httpApi.search({ text: "plan", tag: "focus", calendarId: calendar.id });
    await httpApi.search({});
    await httpApi.createReminder(draft);
    await httpApi.updateReminder(reminder, { completed: true });
    await httpApi.deleteReminder(reminder);
    await httpApi.updateDayBoard(
      [{ date: "2026-08-24", reminder_ids: [reminder.id] }],
      { [reminder.id]: reminder.version },
    );
    await httpApi.categories();
    await httpApi.createCategory("Ideas");
    await httpApi.updateCategory(category, "Reading");
    await httpApi.deleteCategory(category);
    await httpApi.reorderCategories([category.id], { [category.id]: category.version });
    await httpApi.floatingTasks([calendar.id, "calendar-2"]);
    await httpApi.floatingTasks([]);
    await httpApi.createFloating({ calendar_id: calendar.id, category_id: category.id, text: "Read", completed: false });
    await httpApi.updateFloating(floating, { category_id: "category-2", completed: true });
    await httpApi.deleteFloating(floating);
    await httpApi.reorderFloating([floating.id], { [floating.id]: floating.version });
    await httpApi.notebooks();
    await httpApi.createNotebook("My Notebook");
    await httpApi.updateNotebook(notebook, { title: "Updated", content: "<p>hi</p>" });
    await httpApi.deleteNotebook(notebook);
    await httpApi.month("2026-09", [calendar.id]);
    await httpApi.weekNote("2026-09-01");
    await httpApi.updateWeekNote("2026-09-01", "Test note");

    const calls = fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method ?? "GET", init?.body]);
    expect(calls).toContainEqual(["/api/weeks/2026-08-24?calendar_ids=calendar-1&calendar_ids=calendar-2", "GET", undefined]);
    expect(calls).toContainEqual(["/api/search?text=plan&tag=focus&calendar_id=calendar-1", "GET", undefined]);
    expect(calls).toContainEqual(["/api/categories/order", "PUT", JSON.stringify({ ids: [category.id], versions: { [category.id]: category.version } })]);
    expect(calls).toContainEqual(["/api/floating-tasks/order", "PUT", JSON.stringify({ ids: [floating.id], versions: { [floating.id]: floating.version } })]);
    expect(calls).toContainEqual(["/api/reminders/day-board", "PUT", JSON.stringify({ columns: [{ date: "2026-08-24", reminder_ids: [reminder.id] }], versions: { [reminder.id]: reminder.version } })]);
    expect(calls).toContainEqual(["/api/calendars/calendar-1/shares", "POST", JSON.stringify({ username: "alex", role: "EDITOR" })]);
    expect(calls).toContainEqual(["/api/reminders/reminder-1", "PATCH", JSON.stringify({ completed: true, version: 4 })]);
    expect(calls).toContainEqual(["/api/categories/category-1", "PATCH", JSON.stringify({ name: "Reading", version: 2 })]);
    expect(calls).toContainEqual(["/api/floating-tasks/floating-1", "PATCH", JSON.stringify({ category_id: "category-2", completed: true, version: 5 })]);
    expect(calls).toContainEqual(["/api/months/2026-09?calendar_ids=calendar-1", "GET", undefined]);
    expect(calls).toContainEqual(["/api/week-notes/2026-09-01", "GET", undefined]);
    expect(calls).toContainEqual(["/api/week-notes/2026-09-01", "PUT", JSON.stringify({ content: "Test note" })]);
  });

  it("does not turn an empty calendar selection into backend 'all calendars'", async () => {
    await expect(httpApi.week("2026-08-24", [])).resolves.toEqual({
      start: "2026-08-24",
      end: "2026-08-29",
      reminders: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns undefined for 204 and exposes JSON and plain HTTP errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(request("/empty")).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "stale reminder version" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(request("/conflict")).rejects.toEqual(expect.objectContaining({
      status: 409,
      detail: "stale reminder version",
    }));

    fetchMock.mockResolvedValueOnce(new Response("bad gateway", { status: 502, statusText: "Bad Gateway" }));
    await expect(request("/gateway")).rejects.toEqual(expect.objectContaining({
      status: 502,
      detail: "Bad Gateway",
    }));
  });
});
