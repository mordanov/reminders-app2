import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n";
import { api } from "../api/client";
import { ownedCalendar, sharedCalendar } from "../test/fixtures";
import { renderWithClient } from "../test/render";
import { CalendarDialog } from "./CalendarDialog";

describe("calendar settings", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru");
  });

  afterEach(() => vi.restoreAllMocks());

  it("creates, edits, shares, unshares, and deletes owned calendars", async () => {
    const user = userEvent.setup();
    const share = {
      user: { id: "user-2", username: "alex", active: true },
      role: "EDITOR" as const,
    };
    vi.spyOn(api, "shares").mockResolvedValue([share]);
    vi.spyOn(api, "createCalendar").mockResolvedValue({ ...ownedCalendar, id: "new-calendar" });
    vi.spyOn(api, "updateCalendar").mockResolvedValue({ ...ownedCalendar, name: "Focus", version: 2 });
    vi.spyOn(api, "addShare").mockResolvedValue(share);
    vi.spyOn(api, "removeShare").mockResolvedValue();
    vi.spyOn(api, "deleteCalendar").mockResolvedValue();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

    renderWithClient(
      <CalendarDialog
        open
        onOpenChange={vi.fn()}
        calendars={[ownedCalendar, sharedCalendar]}
        onError={vi.fn()}
      />,
    );

    const nameInputs = screen.getAllByRole("textbox", { name: "Название календаря" });
    await user.type(nameInputs[0], "Travel");
    await user.click(screen.getByRole("button", { name: "#37667A" }));
    await user.click(screen.getByRole("button", { name: "Добавить календарь" }));
    await waitFor(() => expect(api.createCalendar).toHaveBeenCalledWith({ name: "Travel", color: "#37667A" }));

    await user.clear(nameInputs[1]);
    await user.type(nameInputs[1], "Focus");
    const colorInputs = screen.getAllByLabelText("Цвет календаря").filter((node) => node.tagName === "INPUT");
    fireEvent.change(colorInputs[1], { target: { value: "#37667a" } });
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(api.updateCalendar).toHaveBeenCalledWith(ownedCalendar, { name: "Focus", color: "#37667a" }));

    await user.type(screen.getByRole("textbox", { name: "Поделиться с пользователем" }), "maria");
    await user.click(screen.getByRole("button", { name: "Поделиться" }));
    await waitFor(() => expect(api.addShare).toHaveBeenCalledWith(ownedCalendar.id, "maria"));
    await user.click(await screen.findByRole("button", { name: "Удалить alex" }));
    await waitFor(() => expect(api.removeShare).toHaveBeenCalledWith(ownedCalendar.id, share.user.id));

    const deleteButton = screen.getByRole("button", { name: "Удалить календарь" });
    await user.click(deleteButton);
    expect(api.deleteCalendar).not.toHaveBeenCalled();
    await user.click(deleteButton);
    await waitFor(() => expect(api.deleteCalendar).toHaveBeenCalledWith(ownedCalendar));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Только владелец может изменять эти настройки.")).toBeInTheDocument();
  });

  it("enforces the ten-owned-calendar limit", () => {
    const calendars = Array.from({ length: 10 }, (_, index) => ({
      ...ownedCalendar,
      id: `owned-${index}`,
      name: `Calendar ${index}`,
    }));
    renderWithClient(
      <CalendarDialog open onOpenChange={vi.fn()} calendars={calendars} onError={vi.fn()} />,
    );
    expect(screen.getByText("Можно создать не более 10 календарей.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить календарь" })).toBeDisabled();
  });
});
