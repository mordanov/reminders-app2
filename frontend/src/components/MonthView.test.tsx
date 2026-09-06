import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "../i18n";
import { MonthView } from "./MonthView";
import type { Reminder } from "../types";

const reminder: Reminder = {
  id: "rem-1",
  calendar_id: "cal-1",
  kind: "DAY",
  text: "September task",
  due_date: "2026-09-07",
  due_at: null,
  day_order: 0,
  completed: false,
  version: 1,
  tag_ids: [],
  created_at: "2026-09-01T00:00:00Z",
};

describe("MonthView", () => {
  it("renders 7 weekday header columns", () => {
    const { container } = render(
      <MonthView month="2026-09" reminders={[]} locale="ru" onDayClick={vi.fn()} />,
    );
    expect(container.querySelectorAll(".month-view-weekday")).toHaveLength(7);
  });

  it("renders day cells for all dates in September 2026", () => {
    render(
      <MonthView month="2026-09" reminders={[]} locale="ru" onDayClick={vi.fn()} />,
    );
    // September 7 is inside the month — its button should exist
    expect(screen.getByRole("button", { name: /2026-09-07/ })).toBeInTheDocument();
  });

  it("shows a reminder text in its day cell", () => {
    render(
      <MonthView month="2026-09" reminders={[reminder]} locale="ru" onDayClick={vi.fn()} />,
    );
    expect(screen.getByText("September task")).toBeInTheDocument();
  });

  it("calls onDayClick with the correct date key when a day is clicked", async () => {
    const user = userEvent.setup();
    const onDayClick = vi.fn();
    render(
      <MonthView month="2026-09" reminders={[]} locale="ru" onDayClick={onDayClick} />,
    );
    await user.click(screen.getByRole("button", { name: /2026-09-15/ }));
    expect(onDayClick).toHaveBeenCalledWith("2026-09-15");
  });
});
