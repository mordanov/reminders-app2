import { addDays, parseDate, reminderDateKey, toDateKey, visibleDays } from "./date";
import type { Category, FloatingTask, Reminder } from "../types";

export interface DayTaskColumn {
  date: string;
  reminders: Reminder[];
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function filterWeekReminders(source: Reminder[], selectedIds: string[], start: string): Reminder[] {
  const end = toDateKey(addDays(parseDate(start), 5));
  return source.filter((reminder) => {
    const date = reminderDateKey(reminder);
    return selectedIds.includes(reminder.calendar_id) && date >= start && date <= end;
  });
}

export function visibleCategories(
  all: Category[],
  floating: FloatingTask[],
  currentUserId: string,
): Category[] {
  return all.filter(
    (category) =>
      category.owner_id === currentUserId ||
      floating.some((task) => task.category_id === category.id),
  );
}

export function reorderedCategoryIds(categories: Category[], activeId: string, overId: string): string[] | null {
  if (activeId === overId) return null;
  const oldIndex = categories.findIndex((category) => category.id === activeId);
  const newIndex = categories.findIndex((category) => category.id === overId);
  if (oldIndex < 0 || newIndex < 0) return null;
  return moveItem(categories, oldIndex, newIndex).map((category) => category.id);
}

export function groupFloatingOrder(tasks: FloatingTask[]): string[][] {
  const groups = new Map<string, string[]>();
  tasks.forEach((task) => {
    const key = `${task.calendar_id}:${task.category_id}`;
    groups.set(key, [...(groups.get(key) ?? []), task.id]);
  });
  return [...groups.values()];
}

export function buildWeekColumns(week: string, reminders: Reminder[]): DayTaskColumn[] {
  return visibleDays(week).map((date) => {
    const key = toDateKey(date);
    return { date: key, reminders: reminders.filter((item) => reminderDateKey(item) === key) };
  });
}

export function serializeDayColumns(columns: DayTaskColumn[]) {
  return columns.map((column) => ({
    date: column.date,
    reminder_ids: column.reminders
      .filter((item) => item.kind === "DAY")
      .sort((a, b) => (a.day_order ?? 0) - (b.day_order ?? 0))
      .map((item) => item.id),
  }));
}

export function reorderDayByDrag(
  columns: DayTaskColumn[],
  reminders: Reminder[],
  activeId: string,
  overId: string,
): DayTaskColumn[] | null {
  if (activeId === overId) return null;
  const active = reminders.find((item) => item.id === activeId);
  if (!active || active.kind !== "DAY") return null;
  const sourceIndex = columns.findIndex((column) => column.date === active.due_date);
  const targetIndex = overId.startsWith("day:")
    ? columns.findIndex((column) => column.date === overId.slice(4))
    : columns.findIndex((column) => column.reminders.some((item) => item.id === overId));
  if (sourceIndex < 0 || targetIndex < 0) return null;
  const next = columns.map((column) => ({ ...column, reminders: [...column.reminders] }));
  next[sourceIndex].reminders = next[sourceIndex].reminders.filter((item) => item.id !== active.id);
  const targetDays = next[targetIndex].reminders.filter((item) => item.kind === "DAY");
  const overIndex = targetDays.findIndex((item) => item.id === overId);
  const insertAt =
    sourceIndex === targetIndex && overIndex >= 0 ? overIndex : targetDays.length;
  const timed = next[targetIndex].reminders.filter((item) => item.kind === "DATETIME");
  targetDays.splice(insertAt, 0, { ...active, due_date: next[targetIndex].date });
  next[targetIndex].reminders = [...targetDays.map((item, index) => ({ ...item, day_order: index })), ...timed];
  return next;
}

export function moveDayByKeyboard(
  columns: DayTaskColumn[],
  reminder: Reminder,
  direction: "up" | "down" | "previous" | "next",
): DayTaskColumn[] | null {
  const sourceIndex = columns.findIndex((column) => column.date === reminder.due_date);
  if (sourceIndex < 0) return null;
  const next = columns.map((column) => ({ ...column, reminders: [...column.reminders] }));
  const sourceDay = next[sourceIndex].reminders.filter((item) => item.kind === "DAY").sort((a, b) => (a.day_order ?? 0) - (b.day_order ?? 0));
  const itemIndex = sourceDay.findIndex((item) => item.id === reminder.id);
  if (direction === "up" || direction === "down") {
    const target = direction === "up" ? itemIndex - 1 : itemIndex + 1;
    if (itemIndex < 0 || target < 0 || target >= sourceDay.length) return null;
    const moved = moveItem(sourceDay, itemIndex, target);
    const timed = next[sourceIndex].reminders.filter((item) => item.kind === "DATETIME");
    next[sourceIndex].reminders = [...moved.map((item, index) => ({ ...item, day_order: index })), ...timed];
  } else {
    const targetColumn = direction === "previous" ? sourceIndex - 1 : sourceIndex + 1;
    if (targetColumn < 0 || targetColumn > 5) return null;
    next[sourceIndex].reminders = next[sourceIndex].reminders.filter((item) => item.id !== reminder.id);
    const targetDays = next[targetColumn].reminders.filter((item) => item.kind === "DAY");
    const timed = next[targetColumn].reminders.filter((item) => item.kind === "DATETIME");
    next[targetColumn].reminders = [...targetDays, { ...reminder, due_date: next[targetColumn].date, day_order: targetDays.length }, ...timed];
  }
  return next;
}
