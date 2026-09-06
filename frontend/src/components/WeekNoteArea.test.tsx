import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { renderWithClient } from "../test/render";
import { WeekNoteArea } from "./WeekNoteArea";

const WEEK = "2026-09-01";

describe("WeekNoteArea", () => {
  beforeEach(() => {
    vi.spyOn(api, "weekNote").mockResolvedValue({ week_start: WEEK, content: "Hello notes" });
    vi.spyOn(api, "updateWeekNote").mockResolvedValue({ week_start: WEEK, content: "" });
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders textarea with fetched content", async () => {
    renderWithClient(<WeekNoteArea weekStart={WEEK} />);
    const textarea = await screen.findByRole("textbox", { name: "Заметки" });
    expect(textarea).toHaveValue("Hello notes");
  });

  it("shows character counter", async () => {
    renderWithClient(<WeekNoteArea weekStart={WEEK} />);
    await screen.findByRole("textbox");
    expect(screen.getByText("11/1000")).toBeInTheDocument();
  });

  it("updates counter when typing", async () => {
    renderWithClient(<WeekNoteArea weekStart={WEEK} />);
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hi" } });
    expect(screen.getByText("2/1000")).toBeInTheDocument();
  });

  it("adds near-limit class when approaching max", async () => {
    renderWithClient(<WeekNoteArea weekStart={WEEK} />);
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "x".repeat(960) } });
    const counter = screen.getByText("960/1000");
    expect(counter.className).toContain("near-limit");
  });

  it("debounces and calls updateWeekNote after 1000ms", async () => {
    const updateSpy = vi.spyOn(api, "updateWeekNote").mockResolvedValue({ week_start: WEEK, content: "typed" });

    renderWithClient(<WeekNoteArea weekStart={WEEK} />);
    // wait for the query to load with real timers before switching to fake ones
    const textarea = await screen.findByRole("textbox");

    vi.useFakeTimers();
    try {
      fireEvent.change(textarea, { target: { value: "typed" } });
      expect(updateSpy).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(1100); });
      expect(updateSpy).toHaveBeenCalledWith(WEEK, "typed");
    } finally {
      vi.useRealTimers();
    }
  });
});
