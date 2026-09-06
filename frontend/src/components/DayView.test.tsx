import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "../i18n";
import { DayView } from "./DayView";
import type { Calendar, Reminder } from "../types";

const calendar: Calendar = {
  id: "cal-1",
  owner_id: "user-1",
  name: "Work",
  color: "#556B58",
  text_color: "#FFFFFF",
  version: 1,
  is_owner: true,
};

const dayReminder: Reminder = {
  id: "rem-day",
  calendar_id: calendar.id,
  kind: "DAY",
  text: "All-day task",
  due_date: "2026-09-07",
  due_at: null,
  day_order: 0,
  completed: false,
  version: 1,
  tag_ids: [],
  created_at: "2026-09-01T00:00:00Z",
};

// UTC 10:00 → 12:00 in Europe/Madrid (UTC+2 in September)
const timedReminder: Reminder = {
  id: "rem-timed",
  calendar_id: calendar.id,
  kind: "DATETIME",
  text: "Timed meeting",
  due_date: null,
  due_at: "2026-09-07T10:00:00Z",
  day_order: null,
  completed: false,
  version: 1,
  tag_ids: [],
  created_at: "2026-09-01T00:00:00Z",
};

function renderDayView(reminders: Reminder[] = []) {
  return render(
    <DayView
      date="2026-09-07"
      reminders={reminders}
      calendars={[calendar]}
      tags={[]}
      locale="ru"
      canCreate={false}
      onEdit={vi.fn()}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
      onCreate={vi.fn()}
    />,
  );
}

describe("DayView", () => {
  it("renders 37 time-slot rows", () => {
    const { container } = renderDayView();
    expect(container.querySelectorAll(".day-view-slot")).toHaveLength(37);
  });

  it("renders the first (05:00) and last (23:00) time labels", () => {
    renderDayView();
    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.getByText("23:00")).toBeInTheDocument();
  });

  it("shows an all-day reminder in the all-day section", () => {
    const { container } = renderDayView([dayReminder]);
    const allDay = container.querySelector(".day-view-allday");
    expect(allDay).toBeInTheDocument();
    expect(allDay).toHaveTextContent("All-day task");
  });

  it("shows a DATETIME reminder inside the time-slot grid", () => {
    const { container } = renderDayView([timedReminder]);
    const slots = container.querySelector(".day-view-slots");
    expect(slots).toHaveTextContent("Timed meeting");
    // all-day section is not rendered when there are no DAY reminders
    expect(container.querySelector(".day-view-allday")).toBeNull();
  });

  it("calls onToggle, onEdit, and onDelete when action buttons are clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <DayView
        date="2026-09-07"
        reminders={[timedReminder]}
        calendars={[calendar]}
        tags={[]}
        locale="ru"
        canCreate={false}
        onEdit={onEdit}
        onToggle={onToggle}
        onDelete={onDelete}
        onCreate={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Выполнено" }));
    expect(onToggle).toHaveBeenCalledWith(timedReminder);
    await user.click(screen.getByRole("button", { name: "Изменить" }));
    expect(onEdit).toHaveBeenCalledWith(timedReminder);
    await user.click(screen.getByRole("button", { name: "Удалить" }));
    expect(onDelete).toHaveBeenCalledWith(timedReminder);
  });

  it("shows an add button in empty slots when canCreate is true", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <DayView
        date="2026-09-07"
        reminders={[]}
        calendars={[]}
        tags={[]}
        locale="ru"
        canCreate={true}
        onEdit={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onCreate={onCreate}
      />,
    );
    const addButtons = screen.getAllByRole("button", { name: "Новое напоминание" });
    await user.click(addButtons[0]);
    expect(onCreate).toHaveBeenCalledWith("2026-09-07");
  });
});
