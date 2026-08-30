import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n";
import { api } from "../api/client";
import {
  floatingTask,
  globalCategory,
  ownedCalendar,
  personalCategory,
  secondCategory,
  sharedCalendar,
} from "../test/fixtures";
import { renderWithClient } from "../test/render";
import { groupFloatingOrder } from "../lib/planner";
import { CategoryPanel } from "./CategoryPanel";

describe("category panel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru");
  });

  afterEach(() => vi.restoreAllMocks());

  it("groups reorder payloads by calendar and category", () => {
    expect(groupFloatingOrder([
      floatingTask,
      { ...floatingTask, id: "two" },
      { ...floatingTask, id: "three", calendar_id: sharedCalendar.id },
    ])).toEqual([[floatingTask.id, "two"], ["three"]]);
    expect(groupFloatingOrder([])).toEqual([]);
  });

  it("manages a personal category and its floating tasks", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.spyOn(api, "createFloating").mockResolvedValue({ ...floatingTask, id: "new" });
    vi.spyOn(api, "updateCategory").mockResolvedValue({ ...personalCategory, name: "Reading", version: 2 });
    vi.spyOn(api, "deleteCategory").mockResolvedValue();
    vi.spyOn(api, "updateFloating").mockResolvedValue({ ...floatingTask, version: 2 });
    vi.spyOn(api, "deleteFloating").mockResolvedValue();
    vi.spyOn(api, "reorderFloating").mockResolvedValue([]);

    renderWithClient(
      <CategoryPanel
        category={personalCategory}
        categories={[personalCategory, secondCategory, globalCategory]}
        tasks={[floatingTask]}
        calendars={[ownedCalendar, sharedCalendar]}
        currentUserId="user-demo"
        onClose={onClose}
        onError={vi.fn()}
      />,
    );

    await user.clear(screen.getByRole("textbox", { name: "Категория" }));
    await user.type(screen.getByRole("textbox", { name: "Категория" }), "Reading");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(api.updateCategory).toHaveBeenCalledWith(personalCategory, "Reading"));

    const taskInput = screen.getByRole("textbox", { name: "Новая задача" });
    await user.type(taskInput, "Write notes");
    await user.selectOptions(screen.getByRole("combobox", { name: "Календарь" }), sharedCalendar.id);
    await user.click(screen.getByRole("button", { name: "Добавить задачу" }));
    await waitFor(() => expect(api.createFloating).toHaveBeenCalledWith({
      calendar_id: sharedCalendar.id,
      category_id: personalCategory.id,
      text: "Write notes",
      completed: false,
    }));

    await user.click(screen.getByRole("button", { name: "Выполнено" }));
    await waitFor(() => expect(api.updateFloating).toHaveBeenCalledWith(floatingTask, { completed: true }));
    await user.click(screen.getByRole("button", { name: "Изменить" }));
    const editArea = screen.getByRole("textbox", { name: "" });
    await user.clear(editArea);
    await user.type(editArea, "Updated task");
    await user.click(screen.getAllByRole("button", { name: "Сохранить" }).at(-1)!);
    await waitFor(() => expect(api.updateFloating).toHaveBeenCalledWith(floatingTask, { text: "Updated task" }));

    await user.selectOptions(screen.getByRole("combobox", { name: "Категория" }), secondCategory.id);
    await waitFor(() => expect(api.updateFloating).toHaveBeenCalledWith(floatingTask, { category_id: secondCategory.id }));
    await user.click(screen.getAllByRole("button", { name: "Удалить" }).at(-1)!);
    await waitFor(() => expect(api.deleteFloating).toHaveBeenCalledWith(floatingTask));

    const search = screen.getByRole("searchbox", { name: "Поиск в категории" });
    await user.type(search, "absent");
    expect(screen.getByText("В выбранных календарях задач нет.")).toBeInTheDocument();
    await user.clear(search);
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("deletes an unused personal category without calendars", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.spyOn(api, "deleteCategory").mockResolvedValue();
    renderWithClient(
      <CategoryPanel
        category={personalCategory}
        categories={[personalCategory]}
        tasks={[]}
        calendars={[]}
        currentUserId="user-demo"
        onClose={onClose}
        onError={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(api.deleteCategory).toHaveBeenCalledWith(personalCategory));
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps a global category definition read-only while shared tasks remain editable", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <CategoryPanel
        category={globalCategory}
        categories={[personalCategory, globalCategory]}
        tasks={[{ ...floatingTask, category_id: globalCategory.id, calendar_id: sharedCalendar.id }]}
        calendars={[sharedCalendar]}
        currentUserId="user-demo"
        onClose={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText("Категория другого пользователя — только просмотр")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Новая задача" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Выполнено" })).toBeEnabled();
    await user.type(screen.getByRole("searchbox"), "Read");
    expect(screen.getByText("Read a book")).toBeInTheDocument();
  });
});
