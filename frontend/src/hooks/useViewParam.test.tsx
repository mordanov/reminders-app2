import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useViewParam } from "./useViewParam";

function Harness() {
  const vp = useViewParam();
  return (
    <div>
      <span data-testid="view">{vp.view}</span>
      <span data-testid="week">{vp.week}</span>
      <span data-testid="day">{vp.day ?? ""}</span>
      <span data-testid="month">{vp.month ?? ""}</span>
      <button onClick={vp.prev}>prev</button>
      <button onClick={vp.next}>next</button>
      <button onClick={vp.today}>today</button>
      <button onClick={vp.switchToWeek}>toWeek</button>
      <button onClick={vp.switchToMonth}>toMonth</button>
      <button onClick={vp.switchToDay}>toDay</button>
      <button onClick={() => vp.gotoDay("2026-09-10")}>gotoDay</button>
    </div>
  );
}

describe("useViewParam", () => {
  it("detects week view and navigates prev/next/today", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/?week=2026-09-07"]}><Harness /></MemoryRouter>);
    expect(screen.getByTestId("view")).toHaveTextContent("week");
    await user.click(screen.getByRole("button", { name: "next" }));
    expect(screen.getByTestId("week")).toHaveTextContent("2026-09-14");
    await user.click(screen.getByRole("button", { name: "prev" }));
    expect(screen.getByTestId("week")).toHaveTextContent("2026-09-07");
    await user.click(screen.getByRole("button", { name: "today" }));
    expect(screen.getByTestId("week").textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("detects day view, navigates prev/next, gotoDay works", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/?day=2026-09-07"]}><Harness /></MemoryRouter>);
    expect(screen.getByTestId("view")).toHaveTextContent("day");
    expect(screen.getByTestId("day")).toHaveTextContent("2026-09-07");
    await user.click(screen.getByRole("button", { name: "next" }));
    expect(screen.getByTestId("day")).toHaveTextContent("2026-09-08");
    await user.click(screen.getByRole("button", { name: "prev" }));
    expect(screen.getByTestId("day")).toHaveTextContent("2026-09-07");
    await user.click(screen.getByRole("button", { name: "gotoDay" }));
    expect(screen.getByTestId("day")).toHaveTextContent("2026-09-10");
    await user.click(screen.getByRole("button", { name: "today" }));
    expect(screen.getByTestId("day").textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("detects month view and navigates prev/next/today", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/?month=2026-09"]}><Harness /></MemoryRouter>);
    expect(screen.getByTestId("view")).toHaveTextContent("month");
    expect(screen.getByTestId("month")).toHaveTextContent("2026-09");
    await user.click(screen.getByRole("button", { name: "next" }));
    expect(screen.getByTestId("month")).toHaveTextContent("2026-10");
    await user.click(screen.getByRole("button", { name: "prev" }));
    expect(screen.getByTestId("month")).toHaveTextContent("2026-09");
    await user.click(screen.getByRole("button", { name: "today" }));
    expect(screen.getByTestId("month").textContent).toMatch(/^\d{4}-\d{2}$/);
  });

  it("switchToWeek from day view sets week param", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/?day=2026-09-07"]}><Harness /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "toWeek" }));
    expect(screen.getByTestId("view")).toHaveTextContent("week");
  });

  it("switchToMonth from day view derives month from current day", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/?day=2026-09-07"]}><Harness /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "toMonth" }));
    expect(screen.getByTestId("month")).toHaveTextContent("2026-09");
  });

  it("switchToDay from week view uses today when no day is set", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/?week=2026-09-07"]}><Harness /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "toDay" }));
    expect(screen.getByTestId("view")).toHaveTextContent("day");
    expect(screen.getByTestId("day").textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
