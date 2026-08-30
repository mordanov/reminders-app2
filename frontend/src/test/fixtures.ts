import type { Calendar, Category, FloatingTask, Reminder, Tag } from "../types";

export const ownedCalendar: Calendar = {
  id: "calendar-owned",
  owner_id: "user-demo",
  name: "Work",
  color: "#556B58",
  text_color: "#FFFFFF",
  version: 1,
  is_owner: true,
};

export const sharedCalendar: Calendar = {
  id: "calendar-shared",
  owner_id: "other-user",
  name: "Shared",
  color: "#6F6288",
  text_color: "#FFFFFF",
  version: 1,
  is_owner: false,
};

export const personalCategory: Category = {
  id: "category-personal",
  owner_id: "user-demo",
  name: "Books",
  position: 0,
  global_category: false,
  version: 1,
};

export const secondCategory: Category = {
  id: "category-second",
  owner_id: "user-demo",
  name: "Ideas",
  position: 1,
  global_category: false,
  version: 1,
};

export const globalCategory: Category = {
  id: "category-global",
  owner_id: null,
  name: "Shared notes",
  position: 0,
  global_category: true,
  version: 1,
};

export const dayReminder: Reminder = {
  id: "reminder-day",
  calendar_id: ownedCalendar.id,
  kind: "DAY",
  text: "Day task",
  due_date: "2026-08-24",
  due_at: null,
  day_order: 0,
  completed: false,
  version: 1,
  tag_ids: ["tag-focus"],
  created_at: "2026-08-20T00:00:00Z",
};

export const secondDayReminder: Reminder = {
  ...dayReminder,
  id: "reminder-day-2",
  text: "Second task",
  day_order: 1,
};

export const nextDayReminder: Reminder = {
  ...dayReminder,
  id: "reminder-next",
  text: "Tuesday task",
  due_date: "2026-08-25",
  day_order: 0,
};

export const timedReminder: Reminder = {
  ...dayReminder,
  id: "reminder-timed",
  kind: "DATETIME",
  text: "Timed task",
  due_date: null,
  due_at: "2026-08-25T09:30:00Z",
  day_order: null,
  completed: true,
  tag_ids: [],
};

export const focusTag: Tag = {
  id: "tag-focus",
  calendar_id: ownedCalendar.id,
  name: "focus",
};

export const floatingTask: FloatingTask = {
  id: "floating-task",
  calendar_id: ownedCalendar.id,
  category_id: personalCategory.id,
  text: "Read a book",
  completed: false,
  position: 0,
  version: 1,
};
