import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n";
import { api } from "../api/client";
import { dayReminder, focusTag, ownedCalendar, sharedCalendar, timedReminder } from "../test/fixtures";
import { renderWithClient } from "../test/render";
import { ReminderDialog } from "./ReminderDialog";

describe("reminder dialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru");
    vi.spyOn(api, "tags").mockResolvedValue([focusTag]);
  });

  afterEach(() => vi.restoreAllMocks());

  it("validates fields, creates tags, and submits a DATETIME reminder in ISO format", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.spyOn(api, "createTag").mockResolvedValue({ ...focusTag, id: "tag-new", name: "new" });
    vi.spyOn(api, "createReminder").mockResolvedValue({ items: [], warnings: [] });

    renderWithClient(
      <ReminderDialog
        open
        onOpenChange={onOpenChange}
        calendars={[ownedCalendar, sharedCalendar]}
        reminders={[]}
        initialDate="2026-08-24"
        onError={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Создать" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Введите текст.");
    await user.type(screen.getByText("Текст напоминания").closest("label")!.querySelector("textarea")!, "Plan meeting");
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-08-30" } });
    await user.click(screen.getByRole("button", { name: "Создать" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Выберите понедельник–субботу.");
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-08-24" } });

    await user.click(screen.getByRole("radio", { name: "Со временем" }));
    fireEvent.change(screen.getByLabelText("Дата и время"), { target: { value: "2026-08-25T14:30" } });
    await user.click(screen.getByRole("radio", { name: "На день" }));
    await user.click(screen.getByRole("radio", { name: "Со временем" }));
    const repeat = screen.getByText("Повторить по неделям").closest("label")!.querySelector("input")!;
    await user.clear(repeat);
    await user.type(repeat, "3");
    await user.click(screen.getByRole("checkbox", { name: "Выполнено" }));

    const tagInput = screen.getByPlaceholderText("Теги");
    await user.type(tagInput, "foc");
    await user.click(screen.getByRole("option", { name: "focus" }));
    await user.click(screen.getByRole("button", { name: "focus" }));
    await user.type(tagInput, "new");
    await user.click(screen.getByRole("button", { name: "Создать: new" }));
    await waitFor(() => expect(api.createTag).toHaveBeenCalledWith(ownedCalendar.id, "new"));

    await user.selectOptions(screen.getByRole("combobox", { name: "Календарь" }), sharedCalendar.id);
    await user.click(screen.getByRole("button", { name: "Создать" }));
    await waitFor(() => expect(api.createReminder).toHaveBeenCalled());
    const payload = vi.mocked(api.createReminder).mock.calls[0][0];
    expect(payload).toMatchObject({
      calendar_id: sharedCalendar.id,
      kind: "DATETIME",
      text: "Plan meeting",
      due_date: null,
      completed: true,
      tag_ids: [],
      weekly_count: 3,
    });
    expect(payload.due_at).toMatch(/^2026-08-25T/);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("requires explicit confirmation before creating a duplicate", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createReminder").mockResolvedValue({ items: [], warnings: ["duplicate"] });
    renderWithClient(
      <ReminderDialog
        open
        onOpenChange={vi.fn()}
        calendars={[ownedCalendar]}
        reminders={[dayReminder]}
        initialDate="2026-08-24"
        onError={vi.fn()}
      />,
    );
    await user.type(screen.getByText("Текст напоминания").closest("label")!.querySelector("textarea")!, dayReminder.text);
    await user.click(screen.getByRole("button", { name: "Создать" }));
    expect(api.createReminder).not.toHaveBeenCalled();
    expect(screen.getByText("Похожее напоминание уже существует")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Создать дубликат" }));
    await waitFor(() => expect(api.createReminder).toHaveBeenCalled());
  });

  it("edits a timed reminder without allowing its backend kind to change", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.spyOn(api, "updateReminder").mockResolvedValue({ ...timedReminder, text: "Updated", version: 2 });
    renderWithClient(
      <ReminderDialog
        open
        onOpenChange={onOpenChange}
        calendars={[ownedCalendar]}
        reminders={[timedReminder]}
        initialDate="2026-08-25"
        reminder={timedReminder}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: "На день" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Со временем" })).toBeDisabled();
    const text = screen.getByText("Текст напоминания").closest("label")!.querySelector("textarea")!;
    await user.clear(text);
    await user.type(text, "Updated");
    await user.click(screen.getByRole("checkbox", { name: "Выполнено" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(api.updateReminder).toHaveBeenCalledWith(
      timedReminder,
      expect.objectContaining({ text: "Updated", due_date: null }),
    ));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("enforces the ten-tag limit and supports cancellation", async () => {
    const user = userEvent.setup();
    const tags = Array.from({ length: 11 }, (_, index) => ({
      id: `tag-${index}`,
      calendar_id: ownedCalendar.id,
      name: `tag ${index}`,
    }));
    vi.mocked(api.tags).mockResolvedValue(tags);
    const reminder = { ...dayReminder, tag_ids: tags.map((tag) => tag.id) };
    renderWithClient(
      <ReminderDialog
        open
        onOpenChange={vi.fn()}
        calendars={[ownedCalendar]}
        reminders={[reminder]}
        initialDate="2026-08-24"
        reminder={reminder}
        onError={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Можно выбрать не более 10 тегов.");
    await user.click(screen.getByRole("button", { name: "Отмена" }));
  });

  it("does not submit without an accessible calendar", () => {
    const createReminder = vi.spyOn(api, "createReminder").mockResolvedValue({
      items: [],
      warnings: [],
    });
    renderWithClient(
      <ReminderDialog
        open
        onOpenChange={vi.fn()}
        calendars={[]}
        reminders={[]}
        initialDate="2026-08-24"
        onError={vi.fn()}
      />,
    );

    const submit = screen.getByRole("button", { name: "Создать" });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("Сначала выберите календарь.");
    expect(createReminder).not.toHaveBeenCalled();
  });

  it("renders closed without fetching tags", () => {
    renderWithClient(
      <ReminderDialog
        open={false}
        onOpenChange={vi.fn()}
        calendars={[]}
        reminders={[]}
        initialDate="2026-08-24"
        onError={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
