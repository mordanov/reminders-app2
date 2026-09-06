import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { currentDateInTimeZone, formatTime, monthWeeks, reminderDateKey, toDateKey } from "../lib/date";
import type { Locale, Reminder } from "../types";

interface MonthViewProps {
  month: string;
  reminders: Reminder[];
  locale: Locale;
  onDayClick: (dateKey: string) => void;
}

const MAX_VISIBLE = 4;

export function MonthView({ month, reminders, locale, onDayClick }: MonthViewProps) {
  const { t } = useTranslation();
  const [year, monthNum] = month.split("-").map(Number);

  const todayKey = useMemo(() => toDateKey(currentDateInTimeZone()), []);

  const weeks = useMemo(() => monthWeeks(month), [month]);

  const remindersByDay = useMemo(() => {
    const map: Record<string, Reminder[]> = {};
    for (const r of reminders) {
      const key = reminderDateKey(r);
      (map[key] ??= []).push(r);
    }
    return map;
  }, [reminders]);

  const dayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2024, 0, 1 + i);
      return fmt.format(d);
    });
  }, [locale]);

  return (
    <div className="month-view">
      <div className="month-view-header">
        {dayNames.map((name) => (
          <div key={name} className="month-view-weekday">
            {name}
          </div>
        ))}
      </div>
      <div className="month-view-grid">
        {weeks.map((week, wi) =>
          week.map((date, di) => {
            const key = toDateKey(date);
            const isCurrentMonth = date.getMonth() === monthNum - 1 && date.getFullYear() === year;
            const isToday = key === todayKey;
            const dayReminders = remindersByDay[key] ?? [];
            const extra = dayReminders.length - MAX_VISIBLE;

            return (
              <button
                key={`${wi}-${di}`}
                className={[
                  "month-view-cell",
                  isCurrentMonth ? "" : "other-month",
                  isToday ? "today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onDayClick(key)}
                aria-label={`${key}${isToday ? ` (${t("nav.today", "Сегодня")})` : ""}`}
              >
                <span className="month-day-number">{date.getDate()}</span>
                <div className="month-day-events">
                  {dayReminders.slice(0, MAX_VISIBLE).map((r) => (
                    <div key={r.id} className="month-event">
                      {r.due_at && (
                        <span className="month-event-time">{formatTime(r.due_at, locale)}</span>
                      )}
                      <span className="month-event-text">{r.text}</span>
                    </div>
                  ))}
                  {extra > 0 && (
                    <div className="month-event-more">+{extra}</div>
                  )}
                </div>
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
