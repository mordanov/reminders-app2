import { addWeeks, reminderDateKey, toDateKey } from "../lib/date";
import type {
  Calendar,
  Category,
  FloatingTask,
  Locale,
  Preferences,
  Reminder,
  ReminderDraft,
  SearchFilters,
  Share,
  Tag,
  User,
  Week,
} from "../types";

const user: User = { id: "user-demo", username: "demo", active: true };
const ids = {
  work: "cal-work",
  home: "cal-home",
  shared: "cal-shared",
  books: "cat-books",
  films: "cat-films",
  products: "cat-products",
  ideas: "cat-ideas",
  plans: "cat-plans",
  notes: "cat-notes",
};

interface DemoState {
  calendars: Calendar[];
  preferences: Preferences;
  reminders: Reminder[];
  categories: Category[];
  floating: FloatingTask[];
  tags: Tag[];
  shares: Record<string, Share[]>;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function initialState(): DemoState {
  const now = new Date();
  const weekday = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (weekday === 0 ? 6 : weekday - 1));
  const day = (offset: number) => {
    const value = new Date(monday);
    value.setDate(value.getDate() + offset);
    return toDateKey(value);
  };
  const timed = (offset: number, hour: number) => {
    const value = new Date(`${day(offset)}T${String(hour).padStart(2, "0")}:00:00`);
    return value.toISOString();
  };
  const tags: Tag[] = [
    { id: "tag-focus", calendar_id: ids.work, name: "focus" },
    { id: "tag-meeting", calendar_id: ids.work, name: "meeting" },
    { id: "tag-home", calendar_id: ids.home, name: "home" },
    { id: "tag-reading", calendar_id: ids.home, name: "reading" },
  ];
  const reminders: Reminder[] = [
    {
      id: "rem-1",
      calendar_id: ids.work,
      kind: "DAY",
      text: "Подготовить план недели и выбрать три главных результата",
      due_date: day(0),
      due_at: null,
      day_order: 0,
      completed: false,
      version: 1,
      tag_ids: ["tag-focus"],
      created_at: now.toISOString(),
    },
    {
      id: "rem-2",
      calendar_id: ids.home,
      kind: "DAY",
      text: "Заказать продукты к ужину",
      due_date: day(0),
      due_at: null,
      day_order: 1,
      completed: true,
      version: 1,
      tag_ids: ["tag-home"],
      created_at: now.toISOString(),
    },
    {
      id: "rem-3",
      calendar_id: ids.work,
      kind: "DATETIME",
      text: "Еженедельная встреча команды",
      due_date: null,
      due_at: timed(1, 11),
      day_order: null,
      completed: false,
      version: 1,
      tag_ids: ["tag-meeting"],
      created_at: now.toISOString(),
    },
    {
      id: "rem-4",
      calendar_id: ids.shared,
      kind: "DAY",
      text: "Согласовать маршрут выходного дня",
      due_date: day(4),
      due_at: null,
      day_order: 0,
      completed: false,
      version: 1,
      tag_ids: [],
      created_at: now.toISOString(),
    },
    {
      id: "rem-5",
      calendar_id: ids.home,
      kind: "DATETIME",
      text: "Забрать заказ",
      due_date: null,
      due_at: timed(5, 13),
      day_order: null,
      completed: false,
      version: 1,
      tag_ids: ["tag-home"],
      created_at: now.toISOString(),
    },
  ];
  return {
    calendars: [
      {
        id: ids.work,
        owner_id: user.id,
        name: "Работа",
        color: "#556B58",
        text_color: "#FFFFFF",
        version: 1,
        is_owner: true,
      },
      {
        id: ids.home,
        owner_id: user.id,
        name: "Личное",
        color: "#925B35",
        text_color: "#FFFFFF",
        version: 1,
        is_owner: true,
      },
      {
        id: ids.shared,
        owner_id: "user-alex",
        name: "Семейный",
        color: "#6F6288",
        text_color: "#FFFFFF",
        version: 1,
        is_owner: false,
      },
    ],
    preferences: {
      selected_calendar_ids: [ids.work, ids.home, ids.shared],
      locale: "ru",
    },
    reminders,
    categories: [
      { id: ids.books, owner_id: user.id, name: "Книги", position: 0, global_category: false, version: 1 },
      { id: ids.films, owner_id: user.id, name: "Фильмы", position: 1, global_category: false, version: 1 },
      { id: ids.products, owner_id: user.id, name: "Продукты", position: 2, global_category: false, version: 1 },
      { id: ids.ideas, owner_id: user.id, name: "Идеи", position: 3, global_category: false, version: 1 },
      { id: ids.plans, owner_id: user.id, name: "Планы", position: 4, global_category: false, version: 1 },
      { id: ids.notes, owner_id: "user-alex", name: "Заметки Алексея", position: 5, global_category: true, version: 1 },
    ],
    floating: [
      { id: "float-1", calendar_id: ids.home, category_id: ids.books, text: "«Письма к молодому поэту»", completed: false, position: 0, version: 1 },
      { id: "float-2", calendar_id: ids.work, category_id: ids.ideas, text: "Шаблон тихого часа без уведомлений", completed: false, position: 0, version: 1 },
      { id: "float-3", calendar_id: ids.shared, category_id: ids.notes, text: "Взять плед и термос", completed: false, position: 0, version: 1 },
    ],
    tags,
    shares: {
      [ids.work]: [{ user: { id: "user-olga", username: "olga", active: true }, role: "EDITOR" }],
      [ids.home]: [],
    },
  };
}

const storageKey = "reminders2-demo-state-v2";

function load(): DemoState {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? (JSON.parse(stored) as DemoState) : initialState();
  } catch {
    return initialState();
  }
}

const state = load();

export function resetDemoState(): void {
  const fresh = initialState();
  state.calendars = fresh.calendars;
  state.preferences = fresh.preferences;
  state.reminders = fresh.reminders;
  state.categories = fresh.categories;
  state.floating = fresh.floating;
  state.tags = fresh.tags;
  state.shares = fresh.shares;
  save();
}

function save(): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Demo mode remains usable if storage is unavailable.
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export const demoApi = {
  async me(): Promise<User> {
    return clone(user);
  },
  async preferences(): Promise<Preferences> {
    return clone(state.preferences);
  },
  async updatePreferences(payload: Partial<Preferences>): Promise<Preferences> {
    state.preferences = { ...state.preferences, ...payload };
    save();
    return clone(state.preferences);
  },
  async calendars(): Promise<Calendar[]> {
    return clone(state.calendars);
  },
  async createCalendar(payload: Pick<Calendar, "name" | "color">): Promise<Calendar> {
    const item: Calendar = {
      id: uid("cal"),
      owner_id: user.id,
      name: payload.name,
      color: payload.color,
      text_color: "#FFFFFF",
      version: 1,
      is_owner: true,
    };
    state.calendars.push(item);
    save();
    return clone(item);
  },
  async updateCalendar(calendar: Calendar, payload: Pick<Calendar, "name" | "color">): Promise<Calendar> {
    const index = state.calendars.findIndex((item) => item.id === calendar.id);
    state.calendars[index] = { ...state.calendars[index], ...payload, version: state.calendars[index].version + 1 };
    save();
    return clone(state.calendars[index]);
  },
  async deleteCalendar(calendar: Pick<Calendar, "id" | "version">): Promise<void> {
    const { id } = calendar;
    state.calendars = state.calendars.filter((item) => item.id !== id);
    state.reminders = state.reminders.filter((item) => item.calendar_id !== id);
    state.floating = state.floating.filter((item) => item.calendar_id !== id);
    state.preferences.selected_calendar_ids = state.preferences.selected_calendar_ids.filter((item) => item !== id);
    save();
  },
  async shares(calendarId: string): Promise<Share[]> {
    return clone(state.shares[calendarId] ?? []);
  },
  async addShare(calendarId: string, username: string): Promise<Share> {
    const share: Share = { user: { id: uid("user"), username, active: true }, role: "EDITOR" };
    state.shares[calendarId] = [...(state.shares[calendarId] ?? []), share];
    save();
    return clone(share);
  },
  async removeShare(calendarId: string, userId: string): Promise<void> {
    state.shares[calendarId] = (state.shares[calendarId] ?? []).filter((item) => item.user.id !== userId);
    save();
  },
  async tags(calendarId: string): Promise<Tag[]> {
    return clone(state.tags.filter((item) => item.calendar_id === calendarId));
  },
  async createTag(calendarId: string, name: string): Promise<Tag> {
    const tag = { id: uid("tag"), calendar_id: calendarId, name };
    state.tags.push(tag);
    save();
    return clone(tag);
  },
  async week(start: string, calendarIds: string[]): Promise<Week> {
    const endDate = new Date(`${start}T00:00:00`);
    endDate.setDate(endDate.getDate() + 5);
    const end = toDateKey(endDate);
    return {
      start,
      end,
      reminders: clone(
        state.reminders.filter((item) => {
          const date = reminderDateKey(item);
          return date >= start && date <= end && calendarIds.includes(item.calendar_id);
        }),
      ),
    };
  },
  async search(filters: SearchFilters): Promise<Reminder[]> {
    const tagIds = filters.tag
      ? state.tags.filter((tag) => tag.name.toLocaleLowerCase().includes(filters.tag!.toLocaleLowerCase())).map((tag) => tag.id)
      : [];
    return clone(state.reminders.filter((item) =>
      (!filters.text || item.text.toLocaleLowerCase().includes(filters.text.toLocaleLowerCase())) &&
      (!filters.calendarId || item.calendar_id === filters.calendarId) &&
      (!filters.tag || item.tag_ids.some((id) => tagIds.includes(id))),
    ));
  },
  async createReminder(payload: ReminderDraft): Promise<{ items: Reminder[]; warnings: string[] }> {
    const warnings: string[] = [];
    const items = Array.from({ length: payload.weekly_count }, (_, offset) => {
      const date = payload.due_date ? addWeeks(new Date(`${payload.due_date}T00:00:00`), offset) : null;
      const dueAt = payload.due_at ? addWeeks(new Date(payload.due_at), offset).toISOString() : null;
      const dueDate = date ? toDateKey(date) : null;
      if (state.reminders.some((item) => item.calendar_id === payload.calendar_id && item.text === payload.text && item.due_date === dueDate && item.due_at === dueAt)) {
        warnings.push(`duplicate allowed for occurrence ${offset + 1}`);
      }
      return {
        id: uid("rem"),
        calendar_id: payload.calendar_id,
        kind: payload.kind,
        text: payload.text,
        due_date: dueDate,
        due_at: dueAt,
        day_order: payload.kind === "DAY" ? state.reminders.filter((item) => item.due_date === dueDate).length : null,
        completed: payload.completed,
        version: 1,
        tag_ids: payload.tag_ids,
        created_at: new Date().toISOString(),
      } satisfies Reminder;
    });
    state.reminders.push(...items);
    save();
    return clone({ items, warnings });
  },
  async updateReminder(reminder: Reminder, payload: Partial<Reminder>): Promise<Reminder> {
    const index = state.reminders.findIndex((item) => item.id === reminder.id);
    state.reminders[index] = { ...state.reminders[index], ...payload, version: state.reminders[index].version + 1 };
    save();
    return clone(state.reminders[index]);
  },
  async deleteReminder(reminder: Pick<Reminder, "id" | "version">): Promise<void> {
    const { id } = reminder;
    state.reminders = state.reminders.filter((item) => item.id !== id);
    save();
  },
  async updateDayBoard(
    columns: Array<{ date: string; reminder_ids: string[] }>,
    versions: Record<string, number>,
  ): Promise<Reminder[]> {
    void versions;
    const changed: Reminder[] = [];
    columns.forEach((column) => {
      column.reminder_ids.forEach((id, index) => {
        const reminder = state.reminders.find((item) => item.id === id);
        if (reminder) {
          reminder.due_date = column.date;
          reminder.day_order = index;
          reminder.version += 1;
          changed.push(reminder);
        }
      });
    });
    save();
    return clone(changed);
  },
  async categories(): Promise<Category[]> {
    return clone(state.categories.sort((a, b) => a.position - b.position));
  },
  async createCategory(name: string): Promise<Category> {
    const category = { id: uid("cat"), owner_id: user.id, name, position: state.categories.length, global_category: false, version: 1 };
    state.categories.push(category);
    save();
    return clone(category);
  },
  async updateCategory(input: Category, name: string): Promise<Category> {
    const category = state.categories.find((item) => item.id === input.id)!;
    category.name = name;
    category.version += 1;
    save();
    return clone(category);
  },
  async deleteCategory(category: Pick<Category, "id" | "version">): Promise<void> {
    const { id } = category;
    state.categories = state.categories.filter((item) => item.id !== id);
    save();
  },
  async reorderCategories(
    idsToOrder: string[],
    versions: Record<string, number>,
  ): Promise<Category[]> {
    void versions;
    idsToOrder.forEach((id, position) => {
      const item = state.categories.find((category) => category.id === id);
      if (item) item.position = position;
    });
    save();
    return clone(state.categories);
  },
  async floatingTasks(calendarIds: string[]): Promise<FloatingTask[]> {
    return clone(state.floating.filter((item) => calendarIds.includes(item.calendar_id)));
  },
  async createFloating(payload: Omit<FloatingTask, "id" | "position" | "version">): Promise<FloatingTask> {
    const task = { ...payload, id: uid("float"), position: state.floating.filter((item) => item.category_id === payload.category_id).length, version: 1 };
    state.floating.push(task);
    save();
    return clone(task);
  },
  async updateFloating(task: FloatingTask, payload: Partial<FloatingTask>): Promise<FloatingTask> {
    const index = state.floating.findIndex((item) => item.id === task.id);
    state.floating[index] = { ...state.floating[index], ...payload, version: state.floating[index].version + 1 };
    save();
    return clone(state.floating[index]);
  },
  async deleteFloating(task: Pick<FloatingTask, "id" | "version">): Promise<void> {
    const { id } = task;
    state.floating = state.floating.filter((item) => item.id !== id);
    save();
  },
  async reorderFloating(
    idsToOrder: string[],
    versions: Record<string, number>,
  ): Promise<FloatingTask[]> {
    void versions;
    idsToOrder.forEach((id, position) => {
      const item = state.floating.find((task) => task.id === id);
      if (item) item.position = position;
    });
    save();
    return clone(state.floating);
  },
  setLocale(locale: Locale): void {
    state.preferences.locale = locale;
    save();
  },
};
