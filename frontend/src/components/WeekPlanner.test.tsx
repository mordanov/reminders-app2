import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n";
import { WeekPlanner } from "./WeekPlanner";
import {
  buildWeekColumns,
  moveDayByKeyboard,
  reorderDayByDrag,
  serializeDayColumns,
} from "../lib/planner";
import {
  dayReminder,
  focusTag,
  nextDayReminder,
  ownedCalendar,
  secondDayReminder,
  timedReminder,
} from "../test/fixtures";

describe("weekly planner", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru");
  });

  it("builds, serializes, drags, and keyboard-moves day boards", () => {
    const reminders = [secondDayReminder, dayReminder, nextDayReminder, timedReminder];
    const columns = buildWeekColumns("2026-08-24", reminders);
    expect(columns).toHaveLength(6);
    expect(serializeDayColumns(columns)[0].reminder_ids).toEqual([dayReminder.id, secondDayReminder.id]);

    expect(reorderDayByDrag(columns, reminders, dayReminder.id, dayReminder.id)).toBeNull();
    expect(reorderDayByDrag(columns, reminders, "missing", nextDayReminder.id)).toBeNull();
    expect(reorderDayByDrag(columns, reminders, timedReminder.id, nextDayReminder.id)).toBeNull();
    expect(reorderDayByDrag(columns, [{ ...dayReminder, due_date: "2026-09-01" }], dayReminder.id, nextDayReminder.id)).toBeNull();
    expect(reorderDayByDrag(columns, reminders, dayReminder.id, "missing")).toBeNull();

    const withinDay = reorderDayByDrag(columns, reminders, secondDayReminder.id, dayReminder.id)!;
    expect(serializeDayColumns(withinDay)[0].reminder_ids).toEqual([secondDayReminder.id, dayReminder.id]);
    const nextDay = reorderDayByDrag(columns, reminders, dayReminder.id, "day:2026-08-25")!;
    expect(serializeDayColumns(nextDay)[1].reminder_ids).toEqual([nextDayReminder.id, dayReminder.id]);

    expect(moveDayByKeyboard(columns, { ...dayReminder, due_date: "2026-09-01" }, "down")).toBeNull();
    expect(moveDayByKeyboard(columns, dayReminder, "up")).toBeNull();
    expect(moveDayByKeyboard(columns, secondDayReminder, "down")).toBeNull();
    expect(moveDayByKeyboard(columns, dayReminder, "previous")).toBeNull();
    expect(moveDayByKeyboard(columns, { ...dayReminder, id: "missing" }, "down")).toBeNull();
    expect(serializeDayColumns(moveDayByKeyboard(columns, dayReminder, "down")!)[0].reminder_ids).toEqual([
      secondDayReminder.id,
      dayReminder.id,
    ]);
    expect(serializeDayColumns(moveDayByKeyboard(columns, secondDayReminder, "up")!)[0].reminder_ids).toEqual([
      secondDayReminder.id,
      dayReminder.id,
    ]);
    expect(serializeDayColumns(moveDayByKeyboard(columns, nextDayReminder, "previous")!)[0].reminder_ids).toEqual([
      dayReminder.id,
      secondDayReminder.id,
      nextDayReminder.id,
    ]);
    expect(serializeDayColumns(moveDayByKeyboard(columns, nextDayReminder, "next")!)[2].reminder_ids).toEqual([
      nextDayReminder.id,
    ]);
    const saturday = { ...dayReminder, id: "sat", due_date: "2026-08-29" };
    expect(moveDayByKeyboard(buildWeekColumns("2026-08-24", [saturday]), saturday, "next")).toBeNull();
  });

  it("renders day tasks before timed tasks and exposes all accessible actions", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onEdit = vi.fn();
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    const onReorder = vi.fn();
    render(
      <WeekPlanner
        week="2026-08-24"
        reminders={[dayReminder, secondDayReminder, nextDayReminder, timedReminder]}
        calendars={[ownedCalendar]}
        tags={[focusTag]}
        locale="ru"
        onCreate={onCreate}
        onEdit={onEdit}
        onToggle={onToggle}
        onDelete={onDelete}
        onReorder={onReorder}
      />,
    );

    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.getAllByText("#focus").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Work").some((element) => element.hasAttribute("title"))).toBe(true);
    expect(screen.getByText(/\d{2}:30/)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Выполнено" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Изменить" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Удалить" })[0]);
    expect(onToggle).toHaveBeenCalledWith(dayReminder);
    expect(onEdit).toHaveBeenCalledWith(dayReminder);
    expect(onDelete).toHaveBeenCalledWith(dayReminder);

    await user.click(screen.getAllByRole("button", { name: /Добавить на этот день/ })[0]);
    await user.click(screen.getAllByRole("button", { name: "Переместить ниже" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Переместить выше" })[1]);
    await user.click(screen.getAllByRole("button", { name: "Переместить на следующий день" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Переместить на предыдущий день" })[2]);
    expect(onCreate).toHaveBeenCalledWith("2026-08-24");
    expect(onReorder).toHaveBeenCalledTimes(4);
  });
});
