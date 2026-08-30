export type Locale = "ru" | "en";
export type ReminderKind = "DAY" | "DATETIME";

export interface User {
  id: string;
  username: string;
  active: boolean;
}

export interface Calendar {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  text_color: string;
  version: number;
  is_owner: boolean;
}

export interface Share {
  user: User;
  role: "EDITOR";
}

export interface Tag {
  id: string;
  calendar_id: string;
  name: string;
}

export interface Reminder {
  id: string;
  calendar_id: string;
  kind: ReminderKind;
  text: string;
  due_date: string | null;
  due_at: string | null;
  day_order: number | null;
  completed: boolean;
  version: number;
  tag_ids: string[];
  created_at: string;
}

export interface Week {
  start: string;
  end: string;
  reminders: Reminder[];
}

export interface Category {
  id: string;
  owner_id: string | null;
  name: string;
  position: number;
  global_category: boolean;
  version: number;
}

export interface FloatingTask {
  id: string;
  calendar_id: string;
  category_id: string;
  text: string;
  completed: boolean;
  position: number;
  version: number;
}

export interface Preferences {
  selected_calendar_ids: string[];
  locale: Locale;
}

export interface ReminderDraft {
  calendar_id: string;
  kind: ReminderKind;
  text: string;
  due_date: string | null;
  due_at: string | null;
  completed: boolean;
  tag_ids: string[];
  weekly_count: number;
}

export interface SearchFilters {
  text?: string;
  tag?: string;
  calendarId?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail = message,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
