import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoApi, resetDemoState } from "./demo";

describe("demo API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetDemoState();
  });

  it("supports preferences, calendars, sharing, and tags", async () => {
    expect((await demoApi.me()).username).toBe("demo");
    const preferences = await demoApi.preferences();
    expect(preferences.selected_calendar_ids).toHaveLength(3);
    expect((await demoApi.updatePreferences({ locale: "en" })).locale).toBe("en");
    demoApi.setLocale("ru");
    expect((await demoApi.preferences()).locale).toBe("ru");

    const original = await demoApi.calendars();
    const created = await demoApi.createCalendar({ name: "Travel", color: "#37667A" });
    expect(await demoApi.updateCalendar(created, { name: "Trips", color: "#556B58" })).toMatchObject({ name: "Trips", version: 2 });
    expect(await demoApi.shares(created.id)).toEqual([]);
    const share = await demoApi.addShare(created.id, "maria");
    expect((await demoApi.shares(created.id))[0].user.username).toBe("maria");
    await demoApi.removeShare(created.id, share.user.id);
    expect(await demoApi.shares(created.id)).toEqual([]);

    const tag = await demoApi.createTag(created.id, "packing");
    expect(await demoApi.tags(created.id)).toContainEqual(tag);
    await demoApi.deleteCalendar(created);
    expect(await demoApi.calendars()).toHaveLength(original.length);
  });

  it("creates, finds, updates, reorders, and deletes both reminder kinds", async () => {
    const calendars = await demoApi.calendars();
    const calendarId = calendars[0].id;
    const existingWeek = await demoApi.week("2026-08-24", calendars.map((calendar) => calendar.id));
    expect(existingWeek.end).toBe("2026-08-29");

    const dayResult = await demoApi.createReminder({
      calendar_id: calendarId,
      kind: "DAY",
      text: "Coverage task",
      due_date: "2026-08-24",
      due_at: null,
      completed: false,
      tag_ids: [],
      weekly_count: 2,
    });
    expect(dayResult.items).toHaveLength(2);
    const duplicate = await demoApi.createReminder({
      calendar_id: calendarId,
      kind: "DAY",
      text: "Coverage task",
      due_date: "2026-08-24",
      due_at: null,
      completed: false,
      tag_ids: [],
      weekly_count: 1,
    });
    expect(duplicate.warnings).toHaveLength(1);

    const timed = await demoApi.createReminder({
      calendar_id: calendarId,
      kind: "DATETIME",
      text: "Timed coverage",
      due_date: null,
      due_at: "2026-08-25T09:00:00Z",
      completed: true,
      tag_ids: [],
      weekly_count: 1,
    });
    expect(timed.items[0].day_order).toBeNull();

    const found = await demoApi.search({ text: "coverage", calendarId, tag: "missing" });
    expect(found).toEqual([]);
    expect(await demoApi.search({ text: "timed", calendarId })).toHaveLength(1);
    expect(await demoApi.search({})).not.toHaveLength(0);

    const updated = await demoApi.updateReminder(dayResult.items[0], { completed: true });
    expect(updated).toMatchObject({ completed: true, version: 2 });
    const changed = await demoApi.updateDayBoard(
      [{ date: "2026-08-27", reminder_ids: [updated.id, "missing"] }],
      { [updated.id]: updated.version, missing: 1 },
    );
    expect(changed).toHaveLength(1);
    await demoApi.deleteReminder(updated);
    expect((await demoApi.search({ text: "Coverage task" })).some((item) => item.id === updated.id)).toBe(false);
  });

  it("supports personal/global categories and floating task lifecycle", async () => {
    const calendar = (await demoApi.calendars())[0];
    const originalCategories = await demoApi.categories();
    const category = await demoApi.createCategory("Later");
    expect(await demoApi.updateCategory(category, "Soon")).toMatchObject({ name: "Soon", version: 2 });
    await demoApi.reorderCategories(["missing", category.id], { missing: 1, [category.id]: 1 });
    expect((await demoApi.categories()).find((item) => item.id === category.id)?.position).toBe(1);

    const task = await demoApi.createFloating({
      calendar_id: calendar.id,
      category_id: category.id,
      text: "Floating",
      completed: false,
    });
    expect(await demoApi.floatingTasks([calendar.id])).toContainEqual(task);
    const updated = await demoApi.updateFloating(task, { completed: true });
    expect(updated.version).toBe(2);
    await demoApi.reorderFloating(["missing", task.id], { missing: 1, [task.id]: task.version });
    expect((await demoApi.floatingTasks([calendar.id])).find((item) => item.id === task.id)?.position).toBe(1);
    await demoApi.deleteFloating(task);
    await demoApi.deleteCategory(category);
    expect(await demoApi.categories()).toHaveLength(originalCategories.length);
  });

  it("keeps working when browser storage rejects writes", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    await expect(demoApi.updatePreferences({ locale: "en" })).resolves.toMatchObject({ locale: "en" });
  });
});
