import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "./i18n";
import App from "./App";
import { api } from "./api/client";
import { resetDemoState } from "./api/demo";
import { startOfWorkWeek, toDateKey } from "./lib/date";
import { filterWeekReminders, reorderedCategoryIds, visibleCategories } from "./lib/planner";
import { ApiError } from "./types";
import {
  dayReminder,
  floatingTask,
  globalCategory,
  personalCategory,
  secondCategory,
} from "./test/fixtures";

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const week = toDateKey(startOfWorkWeek());
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/?week=${week}`]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe("planner app", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    resetDemoState();
    await i18n.changeLanguage("ru");
  });

  afterEach(() => vi.restoreAllMocks());

  it("filters planner data and category visibility with pure rules", () => {
    expect(filterWeekReminders([dayReminder], [dayReminder.calendar_id], "2026-08-24")).toEqual([dayReminder]);
    expect(filterWeekReminders([
      dayReminder,
      { ...dayReminder, id: "outside", due_date: "2026-08-30" },
    ], ["other"], "2026-08-24")).toEqual([]);
    expect(visibleCategories([personalCategory, globalCategory], [], "user-demo")).toEqual([personalCategory]);
    expect(visibleCategories(
      [personalCategory, globalCategory],
      [{ ...floatingTask, category_id: globalCategory.id }],
      "user-demo",
    )).toEqual([personalCategory, globalCategory]);
    expect(reorderedCategoryIds([personalCategory, secondCategory], personalCategory.id, secondCategory.id)).toEqual([
      secondCategory.id,
      personalCategory.id,
    ]);
    expect(reorderedCategoryIds([personalCategory], personalCategory.id, personalCategory.id)).toBeNull();
    expect(reorderedCategoryIds([personalCategory], "missing", personalCategory.id)).toBeNull();
    expect(reorderedCategoryIds([personalCategory], personalCategory.id, "missing")).toBeNull();
  });

  it("operates navigation, filters, calendar choices, and dialogs", async () => {
    const search = vi.spyOn(api, "search");
    renderApp();
    expect(await screen.findByRole("heading", { name: "Моя неделя" })).toBeInTheDocument();
    expect(await screen.findAllByRole("article")).toHaveLength(6);

    // calendar bar is collapsed by default — open it to expose all calendar controls
    fireEvent.click(screen.getByRole("button", { name: "Календари" }));

    fireEvent.click(screen.getByRole("button", { name: "Новое напоминание" }));
    expect(screen.getByRole("dialog", { name: "Напоминание" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    fireEvent.click(screen.getByRole("button", { name: "Настроить" }));
    expect(screen.getByRole("dialog", { name: "Настройки календарей" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));

    fireEvent.click(screen.getByRole("button", { name: "Создать" }));
    expect(screen.getByRole("dialog", { name: "Категории" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    fireEvent.click(screen.getByRole("button", { name: /Книги/ }));
    expect(screen.getByRole("heading", { name: "Книги" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    fireEvent.click(screen.getByRole("button", { name: /Книги/ }));
    fireEvent.click(screen.getByRole("button", { name: /Книги/ }));

    fireEvent.click(screen.getByRole("button", { name: "Фильтры" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Текст" }), {
      target: { value: "план" },
    });
    await waitFor(() => expect(search).toHaveBeenCalledWith({ text: "план", tag: undefined }));
    fireEvent.change(screen.getByRole("combobox", { name: "Теги" }), {
      target: { value: "focus" },
    });
    await waitFor(() => expect(search).toHaveBeenCalledWith({ text: "план", tag: "focus" }));
    fireEvent.click(screen.getByRole("button", { name: "Обновить" }));
    fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));
    expect(screen.getByRole("searchbox", { name: "Текст" })).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Предыдущая неделя" }));
    fireEvent.click(screen.getByRole("button", { name: "Следующая неделя" }));
    fireEvent.click(screen.getByRole("button", { name: "Сегодня" }));
    const picker = screen.getAllByLabelText("Выбрать неделю").find((element) => element.tagName === "INPUT")!;
    fireEvent.change(picker, { target: { value: "" } });
    fireEvent.change(picker, { target: { value: "2026-09-03" } });

    const calendarChecks = screen.getAllByRole("checkbox").filter((element) => element.closest(".calendar-toggle"));
    fireEvent.click(calendarChecks[0]);
    fireEvent.click(calendarChecks[0]);
    fireEvent.click(screen.getByRole("button", { name: "Снять все" }));
    await screen.findByText("Выбрано календарей: 0");
    await waitFor(() => expect(screen.getByRole("button", { name: "Новое напоминание" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Новое напоминание" }));
    const calendarSelect = screen.getByRole("combobox", { name: "Календарь" });
    await waitFor(() => expect(calendarSelect.querySelectorAll("option").length).toBeGreaterThan(0));
    expect(calendarSelect).not.toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    fireEvent.change(screen.getByRole("combobox", { name: "Язык" }), {
      target: { value: "en" },
    });
    expect(await screen.findByRole("heading", { name: "My week" })).toBeInTheDocument();
  }, 15000);

  it("edits, completes, and conditionally deletes reminders", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const toggle = vi.spyOn(api, "updateReminder");
    const remove = vi.spyOn(api, "deleteReminder");
    renderApp();
    const editButtons = await screen.findAllByRole("button", { name: "Изменить" });
    await user.click(screen.getAllByRole("button", { name: "Выполнено" })[0]);
    await waitFor(() => expect(toggle).toHaveBeenCalled());
    await user.click(editButtons[0]);
    expect(screen.getByRole("dialog", { name: "Напоминание" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Отмена" }));
    await user.click(screen.getAllByRole("button", { name: "Удалить" })[0]);
    expect(remove).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalled();
  });

  it("recovers from stale conflicts and reports generic mutation errors", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "updatePreferences").mockRejectedValue(new ApiError(409, "stale"));
    vi.spyOn(api, "deleteReminder").mockRejectedValue(new Error("offline"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp();
    await screen.findAllByRole("article");

    await user.selectOptions(screen.getByRole("combobox", { name: "Язык" }), "en");
    expect(await screen.findByText("Данные изменились на сервере. Мы обновили экран — повторите действие.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    await user.click(screen.getAllByRole("button", { name: "Удалить" })[0]);
    expect(await screen.findByText("Не удалось выполнить действие. Попробуйте ещё раз.")).toBeInTheDocument();
  });

  it("shows load failure and retries queries", async () => {
    vi.spyOn(api, "preferences").mockRejectedValue(new Error("unavailable"));
    renderApp();
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить планировщик.");
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
  });
});
