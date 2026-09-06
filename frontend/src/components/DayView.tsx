import { useTranslation } from "react-i18next";
import { Check, Clock, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { formatTime, reminderDateKey, slotKey, timeSlots } from "../lib/date";
import type { Calendar, Locale, Reminder, Tag } from "../types";

interface DayViewProps {
  date: string;
  reminders: Reminder[];
  calendars: Calendar[];
  tags: Tag[];
  locale: Locale;
  canCreate?: boolean;
  onEdit: (reminder: Reminder) => void;
  onToggle: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
  onCreate: (date: string, slotIso?: string) => void;
}

function ReminderRow({
  reminder,
  calendar,
  locale,
  onEdit,
  onToggle,
  onDelete,
}: {
  reminder: Reminder;
  calendar: Calendar | undefined;
  locale: Locale;
  onEdit: (r: Reminder) => void;
  onToggle: (r: Reminder) => void;
  onDelete: (r: Reminder) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`day-view-reminder${reminder.completed ? " completed" : ""}`}
      style={calendar ? { borderLeftColor: calendar.color } : undefined}
    >
      <button
        className="icon-btn"
        aria-label={t("completed")}
        onClick={() => onToggle(reminder)}
      >
        <Check weight={reminder.completed ? "fill" : "regular"} />
      </button>
      <span className="reminder-text">{reminder.text}</span>
      {reminder.due_at && (
        <span className="reminder-time">
          <Clock size={12} />
          {formatTime(reminder.due_at, locale)}
        </span>
      )}
      <button className="icon-btn" aria-label={t("edit")} onClick={() => onEdit(reminder)}>
        <PencilSimple />
      </button>
      <button
        className="icon-btn"
        aria-label={t("remove")}
        onClick={() => onDelete(reminder)}
      >
        <Trash />
      </button>
    </div>
  );
}

export function DayView({
  date,
  reminders,
  calendars,
  locale,
  canCreate,
  onEdit,
  onToggle,
  onDelete,
  onCreate,
}: DayViewProps) {
  const { t } = useTranslation();
  const calendarMap = Object.fromEntries(calendars.map((c) => [c.id, c]));

  const dayReminders = reminders.filter((r) => reminderDateKey(r) === date);
  const allDay = dayReminders.filter((r) => r.kind === "DAY");
  const timed = dayReminders.filter((r) => r.kind === "DATETIME");

  const slotMap: Record<string, Reminder[]> = {};
  for (const r of timed) {
    if (r.due_at) {
      const key = slotKey(r.due_at);
      (slotMap[key] ??= []).push(r);
    }
  }

  const slots = timeSlots();

  return (
    <div className="day-view">
      {allDay.length > 0 && (
        <div className="day-view-allday">
          <span className="day-view-time-label">{t("allDay")}</span>
          <div className="day-view-slot-content">
            {allDay.map((r) => (
              <ReminderRow
                key={r.id}
                reminder={r}
                calendar={calendarMap[r.calendar_id]}
                locale={locale}
                onEdit={onEdit}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      )}
      <div className="day-view-slots">
        {slots.map((slot) => {
          const slotReminders = slotMap[slot] ?? [];
          return (
            <div key={slot} className={`day-view-slot${slotReminders.length ? " has-events" : ""}`}>
              <span className="day-view-time-label">{slot}</span>
              <div className="day-view-slot-content">
                {slotReminders.map((r) => (
                  <ReminderRow
                    key={r.id}
                    reminder={r}
                    calendar={calendarMap[r.calendar_id]}
                    locale={locale}
                    onEdit={onEdit}
                    onToggle={onToggle}
                    onDelete={onDelete}
                  />
                ))}
                {canCreate && slotReminders.length === 0 && (
                  <button
                    className="day-view-slot-add"
                    aria-label={t("newReminder")}
                    onClick={() => onCreate(date)}
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
