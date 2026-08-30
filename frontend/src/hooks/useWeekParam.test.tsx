import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useWeekParam } from "./useWeekParam";

function Harness() {
  const week = useWeekParam();
  const location = useLocation();
  return (
    <div>
      <output>{week.week}</output>
      <output>{location.search}</output>
      <button onClick={week.previous}>previous</button>
      <button onClick={week.next}>next</button>
      <button onClick={() => week.setWeek("2026-09-07")}>set</button>
      <button onClick={week.today}>today</button>
    </div>
  );
}

describe("useWeekParam", () => {
  it("reads and updates a bookmarkable week query", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/?week=2026-08-24"]}><Harness /></MemoryRouter>);
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("2026-08-24");
    await user.click(screen.getByRole("button", { name: "next" }));
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("2026-08-31");
    await user.click(screen.getByRole("button", { name: "previous" }));
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("2026-08-24");
    await user.click(screen.getByRole("button", { name: "set" }));
    expect(screen.getAllByRole("status")[1]).toHaveTextContent("week=2026-09-07");
    await user.click(screen.getByRole("button", { name: "today" }));
    expect(screen.getAllByRole("status")[0].textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back from an invalid week", () => {
    render(<MemoryRouter initialEntries={["/?week=2026-08-25"]}><Harness /></MemoryRouter>);
    expect(screen.getAllByRole("status")[0].textContent).not.toBe("2026-08-25");
  });
});
