import { demoApi } from "./demo";
import { ApiError } from "../types";
import type {
  Calendar,
  Category,
  FloatingTask,
  Preferences,
  Reminder,
  ReminderDraft,
  Share,
  SearchFilters,
  Tag,
  User,
  Week,
} from "../types";
import { addDays, parseDate, toDateKey } from "../lib/date";

const base = import.meta.env.VITE_API_BASE ?? "/api";
export const demoMode = import.meta.env.DEV && import.meta.env.VITE_LIVE_API !== "true";

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      // Keep the HTTP status text when no JSON body is available.
    }
    throw new ApiError(response.status, detail, detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function body(value: unknown): RequestInit {
  return { body: JSON.stringify(value) };
}

export interface ApiClient {
  me(): Promise<User>;
  preferences(): Promise<Preferences>;
  updatePreferences(payload: Partial<Preferences>): Promise<Preferences>;
  calendars(): Promise<Calendar[]>;
  createCalendar(payload: Pick<Calendar, "name" | "color">): Promise<Calendar>;
  updateCalendar(calendar: Calendar, payload: Pick<Calendar, "name" | "color">): Promise<Calendar>;
  deleteCalendar(calendar: Pick<Calendar, "id" | "version">): Promise<void>;
  shares(calendarId: string): Promise<Share[]>;
  addShare(calendarId: string, username: string): Promise<Share>;
  removeShare(calendarId: string, userId: string): Promise<void>;
  tags(calendarId: string): Promise<Tag[]>;
  createTag(calendarId: string, name: string): Promise<Tag>;
  week(start: string, calendarIds: string[]): Promise<Week>;
  search(filters: SearchFilters): Promise<Reminder[]>;
  createReminder(payload: ReminderDraft): Promise<{ items: Reminder[]; warnings: string[] }>;
  updateReminder(reminder: Reminder, payload: Partial<Reminder>): Promise<Reminder>;
  deleteReminder(reminder: Pick<Reminder, "id" | "version">): Promise<void>;
  updateDayBoard(
    columns: Array<{ date: string; reminder_ids: string[] }>,
    versions: Record<string, number>,
  ): Promise<Reminder[]>;
  categories(): Promise<Category[]>;
  createCategory(name: string): Promise<Category>;
  updateCategory(category: Category, name: string): Promise<Category>;
  deleteCategory(category: Pick<Category, "id" | "version">): Promise<void>;
  reorderCategories(ids: string[], versions: Record<string, number>): Promise<Category[]>;
  floatingTasks(calendarIds: string[]): Promise<FloatingTask[]>;
  createFloating(payload: Omit<FloatingTask, "id" | "position" | "version">): Promise<FloatingTask>;
  updateFloating(task: FloatingTask, payload: Partial<FloatingTask>): Promise<FloatingTask>;
  deleteFloating(task: Pick<FloatingTask, "id" | "version">): Promise<void>;
  reorderFloating(ids: string[], versions: Record<string, number>): Promise<FloatingTask[]>;
}

export const httpApi: ApiClient = {
  me: (): Promise<User> => request("/me"),
  preferences: (): Promise<Preferences> => request("/preferences"),
  updatePreferences: (payload: Partial<Preferences>): Promise<Preferences> =>
    request("/preferences", { method: "PATCH", ...body(payload) }),
  calendars: (): Promise<Calendar[]> => request("/calendars"),
  createCalendar: (payload: Pick<Calendar, "name" | "color">): Promise<Calendar> =>
    request("/calendars", { method: "POST", ...body(payload) }),
  updateCalendar: (calendar: Calendar, payload: Pick<Calendar, "name" | "color">): Promise<Calendar> =>
    request(`/calendars/${calendar.id}`, { method: "PATCH", ...body({ ...payload, version: calendar.version }) }),
  deleteCalendar: (calendar): Promise<void> =>
    request(`/calendars/${calendar.id}?version=${calendar.version}`, { method: "DELETE" }),
  shares: (calendarId: string): Promise<Share[]> =>
    request(`/calendars/${calendarId}/shares`),
  addShare: (calendarId: string, username: string): Promise<Share> =>
    request(`/calendars/${calendarId}/shares`, { method: "POST", ...body({ username, role: "EDITOR" }) }),
  removeShare: (calendarId: string, userId: string): Promise<void> =>
    request(`/calendars/${calendarId}/shares/${userId}`, { method: "DELETE" }),
  tags: (calendarId: string): Promise<Tag[]> =>
    request(`/calendars/${calendarId}/tags`),
  createTag: (calendarId: string, name: string): Promise<Tag> =>
    request(`/calendars/${calendarId}/tags`, { method: "POST", ...body({ name }) }),
  week: (start: string, calendarIds: string[]): Promise<Week> => {
    if (!calendarIds.length) {
      return Promise.resolve({
        start,
        end: toDateKey(addDays(parseDate(start), 5)),
        reminders: [],
      });
    }
    const search = new URLSearchParams();
    calendarIds.forEach((id) => search.append("calendar_ids", id));
    return request(`/weeks/${start}?${search}`);
  },
  search: (filters: SearchFilters): Promise<Reminder[]> => {
    const search = new URLSearchParams();
    if (filters.text) search.set("text", filters.text);
    if (filters.tag) search.set("tag", filters.tag);
    if (filters.calendarId) search.set("calendar_id", filters.calendarId);
    return request(`/search?${search}`);
  },
  createReminder: (payload: ReminderDraft): Promise<{ items: Reminder[]; warnings: string[] }> =>
    request("/reminders", { method: "POST", ...body(payload) }),
  updateReminder: (reminder: Reminder, payload: Partial<Reminder>): Promise<Reminder> =>
    request(`/reminders/${reminder.id}`, { method: "PATCH", ...body({ ...payload, version: reminder.version }) }),
  deleteReminder: (reminder): Promise<void> =>
    request(`/reminders/${reminder.id}?version=${reminder.version}`, { method: "DELETE" }),
  updateDayBoard: (columns, versions): Promise<Reminder[]> =>
    request("/reminders/day-board", { method: "PUT", ...body({ columns, versions }) }),
  categories: (): Promise<Category[]> => request("/categories"),
  createCategory: (name: string): Promise<Category> =>
    request("/categories", { method: "POST", ...body({ name }) }),
  updateCategory: (category: Category, name: string): Promise<Category> =>
    request(`/categories/${category.id}`, { method: "PATCH", ...body({ name, version: category.version }) }),
  deleteCategory: (category): Promise<void> =>
    request(`/categories/${category.id}?version=${category.version}`, { method: "DELETE" }),
  reorderCategories: (ids, versions): Promise<Category[]> =>
    request("/categories/order", { method: "PUT", ...body({ ids, versions }) }),
  floatingTasks: async (calendarIds: string[]): Promise<FloatingTask[]> => {
    const groups = await Promise.all(calendarIds.map((id) => request<FloatingTask[]>(`/floating-tasks?calendar_id=${id}`)));
    return groups.flat();
  },
  createFloating: (payload: Omit<FloatingTask, "id" | "position" | "version">): Promise<FloatingTask> =>
    request("/floating-tasks", { method: "POST", ...body(payload) }),
  updateFloating: (task: FloatingTask, payload: Partial<FloatingTask>): Promise<FloatingTask> =>
    request(`/floating-tasks/${task.id}`, { method: "PATCH", ...body({ ...payload, version: task.version }) }),
  deleteFloating: (task): Promise<void> =>
    request(`/floating-tasks/${task.id}?version=${task.version}`, { method: "DELETE" }),
  reorderFloating: (ids, versions): Promise<FloatingTask[]> =>
    request("/floating-tasks/order", { method: "PUT", ...body({ ids, versions }) }),
};

export const api: ApiClient = demoMode ? demoApi : httpApi;
