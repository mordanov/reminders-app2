import { useEffect, useMemo, useState } from "react";
import {
  ArrowsDownUp,
  CalendarDots,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  Funnel,
  GearSix,
  GlobeHemisphereWest,
  NotePencil,
  Plus,
  SpinnerGap,
  Trash,
  WifiHigh,
  WifiSlash,
  X,
} from "@phosphor-icons/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "./api/client";
import { CalendarDialog } from "./components/CalendarDialog";
import { ShoppingDialog } from "./components/ShoppingDialog";
import { CategoryDialog } from "./components/CategoryDialog";
import { CategoryPanel } from "./components/CategoryPanel";
import { DayView } from "./components/DayView";
import { MonthView } from "./components/MonthView";
import { NotebookDialog } from "./components/NotebookDialog";
import { ReminderDialog } from "./components/ReminderDialog";
import { WeekNoteArea } from "./components/WeekNoteArea";
import { WeekPlanner } from "./components/WeekPlanner";
import { useSse } from "./hooks/useSse";
import { useViewParam } from "./hooks/useViewParam";
import {
  formatDayHeading,
  formatMonth,
  formatWeekRange,
  reminderDateKey,
  startOfWorkWeek,
  toDateKey,
} from "./lib/date";
import { filterWeekReminders, reorderedCategoryIds, visibleCategories } from "./lib/planner";
import { ApiError, type Category, type Locale, type Notebook, type Reminder } from "./types";

const categoryImages = [11, 12, 13, 14, 15, 16];

function SortableCategoryButton({
  category,
  index,
  active,
  readOnly,
  onClick,
}: {
  category: Category;
  index: number;
  active: boolean;
  readOnly: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const sortable = useSortable({ id: category.id, disabled: readOnly });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  return (
    <div ref={sortable.setNodeRef} style={style} className="category-tab-wrap">
      {!readOnly ? (
        <button
          type="button"
          className="category-drag"
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={t("dragCategory")}
        >
          <ArrowsDownUp aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        className={`category-tab${active ? " is-active" : ""}${readOnly ? " is-readonly" : ""}`}
        onClick={onClick}
        aria-pressed={active}
      >
        <span>{category.name}</span>
        <img src={`/assets/image_${categoryImages[index % categoryImages.length]}.png`} alt="" />
      </button>
    </div>
  );
}

function tryLocalStorage(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function setLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function App() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const viewParam = useViewParam();
  const liveStatus = useSse(queryClient);

  const [calOpen, setCalOpen] = useState(() => tryLocalStorage("calendarBarOpen", "false") === "true");
  const [reminderOpen, setReminderOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | undefined>();
  const [initialDate, setInitialDate] = useState(viewParam.week);
  const [calendarSettingsOpen, setCalendarSettingsOpen] = useState(false);
  const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [notice, setNotice] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openNotebookId, setOpenNotebookId] = useState<string | null>(null);
  const [shoppingOpen, setShoppingOpen] = useState(false);

  const toggleCalOpen = () => {
    const next = !calOpen;
    setCalOpen(next);
    setLocalStorage("calendarBarOpen", String(next));
  };

  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.me });
  const notebooksQuery = useQuery({ queryKey: ["notebooks"], queryFn: api.notebooks });
  const preferencesQuery = useQuery({ queryKey: ["preferences"], queryFn: api.preferences });
  const calendarsQuery = useQuery({ queryKey: ["calendars"], queryFn: api.calendars });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const preferences = preferencesQuery.data;
  const calendars = useMemo(() => calendarsQuery.data ?? [], [calendarsQuery.data]);
  const selectedIds = useMemo(() => preferences?.selected_calendar_ids ?? [], [preferences?.selected_calendar_ids]);
  const selectedCalendars = useMemo(
    () => calendars.filter((calendar) => selectedIds.includes(calendar.id)),
    [calendars, selectedIds],
  );
  const reminderCalendars = useMemo(
    () => [
      ...selectedCalendars,
      ...calendars.filter((calendar) => !selectedIds.includes(calendar.id)),
    ],
    [calendars, selectedCalendars, selectedIds],
  );

  const weekQuery = useQuery({
    queryKey: ["week", viewParam.week, selectedIds],
    queryFn: () => api.week(viewParam.week, selectedIds),
    enabled: Boolean(preferences) && (viewParam.view === "week" || viewParam.view === "day"),
  });

  const monthQuery = useQuery({
    queryKey: ["month", viewParam.month, selectedIds],
    queryFn: () => api.month(viewParam.month!, selectedIds),
    enabled: Boolean(preferences) && viewParam.view === "month" && Boolean(viewParam.month),
  });

  const floatingQuery = useQuery({
    queryKey: ["floating", selectedIds],
    queryFn: () => api.floatingTasks(selectedIds),
    enabled: Boolean(preferences),
  });
  const tagQueries = useQueries({
    queries: selectedIds.map((id) => ({
      queryKey: ["tags", id],
      queryFn: () => api.tags(id),
    })),
  });
  const tags = useMemo(() => tagQueries.flatMap((query) => query.data ?? []), [tagQueries]);
  const hasFilters = Boolean(filterText.trim() || filterTag.trim());
  const searchQuery = useQuery({
    queryKey: ["search", filterText.trim(), filterTag.trim()],
    queryFn: () => api.search({ text: filterText.trim() || undefined, tag: filterTag.trim() || undefined }),
    enabled: hasFilters && Boolean(preferences),
  });

  useEffect(() => {
    if (preferences?.locale) {
      void i18n.changeLanguage(preferences.locale);
      document.documentElement.lang = preferences.locale;
    }
  }, [i18n, preferences?.locale]);

  const handleError = (error: unknown) => {
    if (error instanceof ApiError && (error.status === 409 || error.status === 412)) {
      setNotice(t("conflict"));
      void queryClient.invalidateQueries();
    } else {
      setNotice(t("genericError"));
    }
  };

  const updatePreferences = useMutation({
    mutationFn: api.updatePreferences,
    onSuccess: (next) => queryClient.setQueryData(["preferences"], next),
    onError: handleError,
  });
  const updateReminder = useMutation({
    mutationFn: ({ reminder, payload }: { reminder: Reminder; payload: Partial<Reminder> }) =>
      api.updateReminder(reminder, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["week"] });
      void queryClient.invalidateQueries({ queryKey: ["month"] });
    },
    onError: handleError,
  });
  const deleteReminder = useMutation({
    mutationFn: (reminder: Reminder) => api.deleteReminder(reminder),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["week"] });
      void queryClient.invalidateQueries({ queryKey: ["month"] });
    },
    onError: handleError,
  });
  const reorderDay = useMutation({
    mutationFn: (columns: Array<{ date: string; reminder_ids: string[] }>) =>
      api.updateDayBoard(
        columns,
        Object.fromEntries(
          visibleReminders
            .filter((reminder) => reminder.kind === "DAY")
            .map((reminder) => [reminder.id, reminder.version]),
        ),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["week"] }),
    onError: handleError,
  });
  const reorderCategories = useMutation({
    mutationFn: (ids: string[]) =>
      api.reorderCategories(
        ids,
        Object.fromEntries(
          personalCategories.map((category) => [category.id, category.version]),
        ),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
    onError: handleError,
  });

  const createNotebook = useMutation({
    mutationFn: (title: string) => api.createNotebook(title),
    onSuccess: (nb) => {
      queryClient.setQueryData<Notebook[]>(["notebooks"], (prev) => [...(prev ?? []), nb]);
      setOpenNotebookId(nb.id);
    },
    onError: handleError,
  });
  const deleteNotebook = useMutation({
    mutationFn: (nb: Notebook) => api.deleteNotebook(nb),
    onSuccess: (_result, nb) => {
      queryClient.setQueryData<Notebook[]>(["notebooks"], (prev) => prev?.filter((n) => n.id !== nb.id) ?? []);
      if (openNotebookId === nb.id) setOpenNotebookId(null);
    },
    onError: handleError,
  });

  const weekReminders = useMemo(() => {
    const source = hasFilters ? searchQuery.data ?? [] : weekQuery.data?.reminders ?? [];
    return filterWeekReminders(source, selectedIds, viewParam.week);
  }, [hasFilters, searchQuery.data, selectedIds, viewParam.week, weekQuery.data?.reminders]);

  const visibleReminders = weekReminders;

  const dayReminders = useMemo(() => {
    if (!viewParam.day) return [];
    return weekReminders.filter((r) => reminderDateKey(r) === viewParam.day);
  }, [weekReminders, viewParam.day]);

  const monthReminders = useMemo(() => {
    if (!monthQuery.data) return [];
    return monthQuery.data.reminders.filter((r) => selectedIds.includes(r.calendar_id));
  }, [monthQuery.data, selectedIds]);

  const categories = useMemo(() => {
    return visibleCategories(
      categoriesQuery.data ?? [],
      floatingQuery.data ?? [],
      meQuery.data?.id ?? "",
    );
  }, [categoriesQuery.data, floatingQuery.data, meQuery.data?.id]);
  const activeCategory = categories.find((category) => category.id === activeCategoryId);
  const personalCategories = categories.filter(
    (category) => !category.global_category && category.owner_id === meQuery.data?.id,
  );
  const categorySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onCategoryDragEnd = (event: DragEndEvent) => {
    if (!event.over) return;
    const ids = reorderedCategoryIds(personalCategories, String(event.active.id), String(event.over.id));
    if (ids) reorderCategories.mutate(ids);
  };

  const locale = preferences?.locale ?? "ru";

  const viewHeading = useMemo(() => {
    if (viewParam.view === "day" && viewParam.day) return formatDayHeading(viewParam.day, locale);
    if (viewParam.view === "month" && viewParam.month) return formatMonth(viewParam.month, locale);
    return formatWeekRange(viewParam.week, locale);
  }, [viewParam.view, viewParam.day, viewParam.month, viewParam.week, locale]);

  const prevLabel = viewParam.view === "day" ? t("previousDay") : viewParam.view === "month" ? t("previousMonth") : t("previousWeek");
  const nextLabel = viewParam.view === "day" ? t("nextDay") : viewParam.view === "month" ? t("nextMonth") : t("nextWeek");

  const loading =
    meQuery.isLoading ||
    preferencesQuery.isLoading ||
    calendarsQuery.isLoading ||
    (viewParam.view !== "month" && weekQuery.isLoading) ||
    (viewParam.view === "month" && monthQuery.isLoading) ||
    (hasFilters && searchQuery.isLoading);
  const failed =
    meQuery.isError ||
    preferencesQuery.isError ||
    calendarsQuery.isError ||
    weekQuery.isError ||
    monthQuery.isError ||
    searchQuery.isError;

  const openCreateReminder = (date: string) => {
    setEditingReminder(undefined);
    setInitialDate(date);
    setReminderOpen(true);
  };

  const openEditReminder = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setInitialDate(reminder.due_date ?? reminder.due_at?.slice(0, 10) ?? viewParam.week);
    setReminderOpen(true);
  };

  const onToggleReminder = (reminder: Reminder) =>
    updateReminder.mutate({ reminder, payload: { completed: !reminder.completed } });

  const onDeleteReminder = (reminder: Reminder) => {
    if (window.confirm(t("remove"))) deleteReminder.mutate(reminder);
  };

  return (
    <>
      <a className="skip-link" href="#weekly-planner">{t("skip")}</a>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-mini">
            <img src="/assets/image_3.png" alt="" />
            <span>{t("appName")}</span>
          </div>
          <div className={`connection-pill ${liveStatus}`} role="status" aria-live="polite">
            {liveStatus === "connected" ? <WifiHigh aria-hidden="true" /> : <WifiSlash aria-hidden="true" />}
            {t(liveStatus === "connected" ? "live" : "reconnecting")}
          </div>
          <label className="language-switch">
            <GlobeHemisphereWest aria-hidden="true" />
            <span className="sr-only">{t("language")}</span>
            <select
              value={preferences?.locale ?? "ru"}
              onChange={(event) => updatePreferences.mutate({ locale: event.target.value as Locale })}
            >
              <option value="ru">RU</option>
              <option value="en">EN</option>
            </select>
          </label>
        </header>

        {notice ? (
          <div className="toast" role="status">
            <span>{notice}</span>
            <button className="icon-button icon-button--small" type="button" onClick={() => setNotice("")} aria-label={t("close")}>
              <X aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div className="planner-layout">
          <nav className="notebook-rail" aria-label={t("notebooks")}>
            {(notebooksQuery.data ?? []).map((nb) => (
              <div key={nb.id} className="notebook-tab-wrap">
                <button
                  type="button"
                  className={`notebook-tab${openNotebookId === nb.id ? " is-active" : ""}`}
                  onClick={() => setOpenNotebookId(openNotebookId === nb.id ? null : nb.id)}
                >
                  <NotePencil aria-hidden="true" />
                  <span>{nb.title}</span>
                </button>
                <button
                  type="button"
                  className="notebook-tab-delete"
                  aria-label={t("remove")}
                  onClick={() => {
                    if (window.confirm(t("remove"))) deleteNotebook.mutate(nb);
                  }}
                >
                  <Trash aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="notebook-tab notebook-tab--new"
              aria-label={t("newNotebook")}
              onClick={() => {
                const title = window.prompt(t("newNotebookTitle") ?? "Название блокнота");
                if (title?.trim()) createNotebook.mutate(title.trim());
              }}
            >
              <span aria-hidden="true">{t("create")}</span>
              <Plus aria-hidden="true" />
            </button>
          </nav>

          <main className="planner-paper" id="weekly-planner" tabIndex={-1}>
            <img className="ornament ornament--left" src="/assets/image_1.png" alt="" />
            <img className="ornament ornament--right" src="/assets/image_2.png" alt="" />

            <div className={`calendar-bar${calOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="calendar-bar__toggle"
                onClick={toggleCalOpen}
                aria-expanded={calOpen}
                aria-label={t("calendars")}
              >
                <span className="calendar-bar__toggle-content">
                  <CalendarDots aria-hidden="true" />
                  <span>{t("calendars")}</span>
                  <small>{t("selectedCount", { count: selectedIds.length })}</small>
                </span>
                {calOpen ? <CaretUp aria-hidden="true" /> : <CaretDown aria-hidden="true" />}
              </button>
              {calOpen && (
                <div className="calendar-bar__body">
                  <div className="calendar-bar__actions">
                    <button type="button" className="icon-button" onClick={() => setCalendarSettingsOpen(true)} aria-label={t("manage")}>
                      <GearSix aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="button button--quiet"
                      onClick={() => updatePreferences.mutate({ selected_calendar_ids: [] })}
                      disabled={!selectedIds.length}
                    >
                      {t("allOff")}
                    </button>
                  </div>
                  <div className="calendar-toggles">
                    {calendars.map((calendar) => {
                      const checked = selectedIds.includes(calendar.id);
                      return (
                        <label
                          key={calendar.id}
                          className={`calendar-toggle${checked ? " is-active" : ""}`}
                          style={{ "--calendar-color": calendar.color } as React.CSSProperties}
                          title={t("calendarDetails", { name: calendar.name, type: calendar.is_owner ? t("owned") : t("shared") })}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => updatePreferences.mutate({
                              selected_calendar_ids: checked
                                ? selectedIds.filter((id) => id !== calendar.id)
                                : [...selectedIds, calendar.id],
                            })}
                          />
                          <span className="calendar-toggle__mark" />
                          <span>{calendar.name}</span>
                          <small>{t(calendar.is_owner ? "owned" : "shared")}</small>
                        </label>
                      );
                    })}
                  </div>
                  <div className={`filters${filtersOpen ? " is-open" : ""}`}>
                    <button type="button" className="filters__toggle" onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>
                      <Funnel aria-hidden="true" /> {t("filters")}
                    </button>
                    <div className="filters__body">
                      <label className="field">
                        <span>{t("searchText")}</span>
                        <input
                          type="search"
                          role="searchbox"
                          aria-label={t("searchText")}
                          value={filterText}
                          onChange={(event) => setFilterText(event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>{t("searchTags")}</span>
                        <select
                          role="combobox"
                          aria-label={t("searchTags")}
                          value={filterTag}
                          onChange={(event) => setFilterTag(event.target.value)}
                        >
                          <option value="" />
                          {tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}
                        </select>
                      </label>
                      <div className="filter-actions">
                        <button type="button" className="button button--quiet" onClick={() => { setFilterText(""); setFilterTag(""); }}>
                          {t("reset")}
                        </button>
                        <button type="button" className="button button--quiet" onClick={() => {
                          void queryClient.invalidateQueries({ queryKey: ["week"] });
                          void queryClient.invalidateQueries({ queryKey: ["search"] });
                        }}>
                          {t("reload")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <section className="planner-hero" aria-labelledby="page-title">
              <img src="/assets/image_3.png" alt="" />
              <p>{t("subtitle")}</p>
              <div style={{ position: "relative" }}>
                <h1 id="page-title">
                  {viewParam.view === "day" ? t("myDay") : viewParam.view === "month" ? t("myMonth") : t("myWeek")}
                </h1>
                {viewParam.view === "month" && (
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={() => setShoppingOpen(true)}
                    style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)" }}
                  >
                    🛒 Магазины
                  </button>
                )}
              </div>
              <div className="week-range">{viewHeading}</div>
            </section>

            <div className="week-toolbar" aria-label={t("chooseWeek")}>
              <div className="view-switcher" role="group">
                <button
                  type="button"
                  className={`button button--quiet${viewParam.view === "day" ? " is-active" : ""}`}
                  aria-pressed={viewParam.view === "day"}
                  onClick={viewParam.switchToDay}
                >
                  {t("viewDay")}
                </button>
                <button
                  type="button"
                  className={`button button--quiet${viewParam.view === "week" ? " is-active" : ""}`}
                  aria-pressed={viewParam.view === "week"}
                  onClick={viewParam.switchToWeek}
                >
                  {t("viewWeek")}
                </button>
                <button
                  type="button"
                  className={`button button--quiet${viewParam.view === "month" ? " is-active" : ""}`}
                  aria-pressed={viewParam.view === "month"}
                  onClick={viewParam.switchToMonth}
                >
                  {t("viewMonth")}
                </button>
              </div>
              <button type="button" className="icon-button" onClick={viewParam.prev} aria-label={prevLabel}>
                <CaretLeft aria-hidden="true" />
              </button>
              <button type="button" className="button button--quiet" onClick={viewParam.today}>{t("today")}</button>
              {viewParam.view === "week" && (
                <label className="week-picker">
                  <CalendarDots aria-hidden="true" />
                  <span className="sr-only">{t("chooseWeek")}</span>
                  <input
                    type="date"
                    value={viewParam.week}
                    aria-label={t("chooseWeek")}
                    onChange={(event) => {
                      if (!event.target.value) return;
                      viewParam.setWeek(toDateKey(startOfWorkWeek(new Date(`${event.target.value}T00:00:00`))));
                    }}
                  />
                </label>
              )}
              {viewParam.view === "day" && (
                <label className="week-picker">
                  <CalendarDots aria-hidden="true" />
                  <span className="sr-only">{t("chooseDate")}</span>
                  <input
                    type="date"
                    value={viewParam.day ?? ""}
                    aria-label={t("chooseDate")}
                    onChange={(event) => {
                      if (event.target.value) viewParam.setDay(event.target.value);
                    }}
                  />
                </label>
              )}
              <button type="button" className="icon-button" onClick={viewParam.next} aria-label={nextLabel}>
                <CaretRight aria-hidden="true" />
              </button>
              <button
                type="button"
                className="button button--primary new-reminder-button"
                disabled={!calendars.length}
                onClick={() => openCreateReminder(viewParam.day ?? viewParam.week)}
              >
                <Plus aria-hidden="true" /> {t("newReminder")}
              </button>
            </div>

            {loading ? (
              <div className="loading-state" role="status"><SpinnerGap className="spin" aria-hidden="true" /> {t("loading")}</div>
            ) : failed ? (
              <div className="error-state" role="alert">
                <p>{t("loadError")}</p>
                <button type="button" className="button button--primary" onClick={() => void queryClient.invalidateQueries()}>{t("retry")}</button>
              </div>
            ) : viewParam.view === "day" && viewParam.day ? (
              <DayView
                date={viewParam.day}
                reminders={dayReminders}
                calendars={calendars}
                tags={tags}
                locale={locale}
                canCreate={calendars.length > 0}
                onCreate={openCreateReminder}
                onEdit={openEditReminder}
                onToggle={onToggleReminder}
                onDelete={onDeleteReminder}
              />
            ) : viewParam.view === "month" && viewParam.month ? (
              <MonthView
                month={viewParam.month}
                reminders={monthReminders}
                locale={locale}
                calendars={calendars}
                onDayClick={viewParam.gotoDay}
              />
            ) : (
              <WeekPlanner
                week={viewParam.week}
                reminders={visibleReminders}
                calendars={calendars}
                tags={tags}
                locale={locale}
                canCreate={calendars.length > 0}
                onCreate={(date) => openCreateReminder(date)}
                onEdit={openEditReminder}
                onToggle={onToggleReminder}
                onDelete={onDeleteReminder}
                onReorder={(columns) => {
                  if (!hasFilters) reorderDay.mutate(columns);
                }}
                onDayClick={viewParam.gotoDay}
              />
            )}

            {viewParam.view === "week" && meQuery.data && (
              <WeekNoteArea weekStart={viewParam.week} />
            )}

            <img className="footer-divider" src="/assets/image_10.png" alt="" />
          </main>

          <DndContext sensors={categorySensors} collisionDetection={closestCenter} onDragEnd={onCategoryDragEnd}>
            <nav className="category-rail" aria-label={t("categories")}>
              <SortableContext items={personalCategories.map((category) => category.id)} strategy={horizontalListSortingStrategy}>
                {categories.map((category, index) => (
                  <SortableCategoryButton
                    key={category.id}
                    category={category}
                    index={index}
                    active={category.id === activeCategoryId}
                    readOnly={
                      category.global_category || category.owner_id !== meQuery.data?.id
                    }
                    onClick={() => setActiveCategoryId(category.id === activeCategoryId ? null : category.id)}
                  />
                ))}
              </SortableContext>
              <button
                type="button"
                className="category-tab category-tab--new"
                onClick={() => setCategoryCreateOpen(true)}
              >
                <span>{t("create")}</span>
                <Plus aria-hidden="true" />
              </button>
            </nav>
          </DndContext>
        </div>

        {activeCategory ? (
          <CategoryPanel
            key={activeCategory.id}
            category={activeCategory}
            categories={categories}
            tasks={floatingQuery.data ?? []}
            calendars={selectedCalendars}
            currentUserId={meQuery.data?.id ?? ""}
            onClose={() => setActiveCategoryId(null)}
            onError={handleError}
          />
        ) : null}
      </div>

      {openNotebookId ? (
        <NotebookDialog
          key={openNotebookId}
          notebook={(notebooksQuery.data ?? []).find((n) => n.id === openNotebookId)!}
          open={Boolean(openNotebookId)}
          onOpenChange={(open) => { if (!open) setOpenNotebookId(null); }}
          onError={handleError}
        />
      ) : null}
      <ReminderDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        calendars={reminderCalendars}
        reminders={weekQuery.data?.reminders ?? []}
        initialDate={initialDate}
        reminder={editingReminder}
        onError={handleError}
      />
      <CalendarDialog
        open={calendarSettingsOpen}
        onOpenChange={setCalendarSettingsOpen}
        calendars={calendars}
        onError={handleError}
      />
      <CategoryDialog
        open={categoryCreateOpen}
        onOpenChange={setCategoryCreateOpen}
        onError={handleError}
      />
      <ShoppingDialog open={shoppingOpen} onOpenChange={setShoppingOpen} />
    </>
  );
}

export default App;
