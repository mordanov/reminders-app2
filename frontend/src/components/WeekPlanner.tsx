import { useMemo } from "react";
import {
  ArrowsDownUp,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Clock,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import { formatDay, formatTime, toDateKey, visibleDays } from "../lib/date";
import {
  buildWeekColumns,
  moveDayByKeyboard,
  reorderDayByDrag,
  serializeDayColumns,
  type DayTaskColumn,
} from "../lib/planner";
import type { Calendar, Locale, Reminder, Tag } from "../types";

interface WeekPlannerProps {
  week: string;
  reminders: Reminder[];
  calendars: Calendar[];
  tags: Tag[];
  locale: Locale;
  canCreate?: boolean;
  onCreate: (date: string) => void;
  onEdit: (reminder: Reminder) => void;
  onToggle: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
  onReorder: (columns: Array<{ date: string; reminder_ids: string[] }>) => void;
}

function TaskCard({
  reminder,
  calendar,
  tags,
  locale,
  index,
  total,
  dayIndex,
  onEdit,
  onToggle,
  onDelete,
  onKeyboardMove,
}: {
  reminder: Reminder;
  calendar?: Calendar;
  tags: Tag[];
  locale: Locale;
  index: number;
  total: number;
  dayIndex: number;
  onEdit: (reminder: Reminder) => void;
  onToggle: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
  onKeyboardMove: (reminder: Reminder, direction: "up" | "down" | "previous" | "next") => void;
}) {
  const { t } = useTranslation();
  const sortable = useSortable({ id: reminder.id, disabled: reminder.kind !== "DAY" });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      className={`reminder-card reminder-card--${reminder.kind.toLocaleLowerCase()}${reminder.completed ? " is-completed" : ""}`}
    >
      {reminder.kind === "DAY" ? (
        <button
          type="button"
          className="drag-handle"
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={t("dragTask")}
        >
          <ArrowsDownUp aria-hidden="true" />
        </button>
      ) : <Clock className="task-type-icon" aria-hidden="true" />}
      <button
        type="button"
        className="task-check"
        aria-label={t("completed")}
        aria-pressed={reminder.completed}
        onClick={() => onToggle(reminder)}
      >
        {reminder.completed ? <Check aria-hidden="true" /> : null}
      </button>
      <details className="task-details">
        <summary>
          <span className="task-title" style={{ color: calendar?.color }}>
            {reminder.text}
          </span>
          <CaretDown aria-hidden="true" />
        </summary>
        <div className="task-details__content">
          <p style={{ color: calendar?.color }}>{reminder.text}</p>
          <div className="task-meta">
            {reminder.due_at ? <time dateTime={reminder.due_at}>{formatTime(reminder.due_at, locale)}</time> : null}
            {calendar ? (
              <span
                className="calendar-badge"
                style={{ backgroundColor: calendar.color, color: calendar.text_color }}
                title={t("calendarDetails", { name: calendar.name, type: calendar.is_owner ? t("owned") : t("shared") })}
              >
                {calendar.name}
              </span>
            ) : null}
            {tags.map((tag) => <span className="tag-label" key={tag.id}>#{tag.name}</span>)}
          </div>
        </div>
      </details>
      <div className="task-actions">
        {reminder.kind === "DAY" ? (
          <div className="keyboard-moves">
            <button
              type="button"
              className="icon-button icon-button--tiny"
              disabled={index === 0}
              onClick={() => onKeyboardMove(reminder, "up")}
              aria-label={t("moveUp")}
            >
              <CaretDown className="rotate-180" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button icon-button--tiny"
              disabled={index === total - 1}
              onClick={() => onKeyboardMove(reminder, "down")}
              aria-label={t("moveDown")}
            >
              <CaretDown aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button icon-button--tiny"
              disabled={dayIndex === 0}
              onClick={() => onKeyboardMove(reminder, "previous")}
              aria-label={t("movePrevious")}
            >
              <CaretLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button icon-button--tiny"
              disabled={dayIndex === 5}
              onClick={() => onKeyboardMove(reminder, "next")}
              aria-label={t("moveNext")}
            >
              <CaretRight aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <button type="button" className="icon-button icon-button--tiny" aria-label={t("edit")} onClick={() => onEdit(reminder)}>
          <PencilSimple aria-hidden="true" />
        </button>
        <button type="button" className="icon-button icon-button--tiny" aria-label={t("remove")} onClick={() => onDelete(reminder)}>
          <Trash aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

function DayColumn({
  date,
  dayIndex,
  reminders,
  calendars,
  tags,
  locale,
  canCreate = true,
  onCreate,
  onEdit,
  onToggle,
  onDelete,
  onKeyboardMove,
}: {
  date: Date;
  dayIndex: number;
  reminders: Reminder[];
  calendars: Calendar[];
  tags: Tag[];
  locale: Locale;
  canCreate?: boolean;
  onCreate: (date: string) => void;
  onEdit: (reminder: Reminder) => void;
  onToggle: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
  onKeyboardMove: (reminder: Reminder, direction: "up" | "down" | "previous" | "next") => void;
}) {
  const { t } = useTranslation();
  const key = toDateKey(date);
  const droppable = useDroppable({ id: `day:${key}` });
  const labels = formatDay(date, locale);
  const allDay = reminders.filter((item) => item.kind === "DAY").sort((a, b) => (a.day_order ?? 0) - (b.day_order ?? 0));
  const timed = reminders.filter((item) => item.kind === "DATETIME").sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
  const ordered = [...allDay, ...timed];

  return (
    <article ref={droppable.setNodeRef} className={`day-column${droppable.isOver ? " is-drop-target" : ""}`} aria-labelledby={`day-${key}`}>
      <header className="day-column__header">
        <div>
          <h2 id={`day-${key}`}>{labels.weekday}</h2>
          <time dateTime={key}>{labels.date}</time>
        </div>
        <button
          type="button"
          className="icon-button icon-button--small"
          disabled={!canCreate}
          onClick={() => onCreate(key)}
          aria-label={`${t("addToDay")}: ${labels.weekday}`}
        >
          <Plus aria-hidden="true" />
        </button>
      </header>
      {ordered.length ? (
        <SortableContext items={allDay.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <ul className="day-list">
            {ordered.map((reminder) => (
              <TaskCard
                key={reminder.id}
                reminder={reminder}
                calendar={calendars.find((calendar) => calendar.id === reminder.calendar_id)}
                tags={tags.filter((tag) => reminder.tag_ids.includes(tag.id))}
                locale={locale}
                index={allDay.findIndex((item) => item.id === reminder.id)}
                total={allDay.length}
                dayIndex={dayIndex}
                onEdit={onEdit}
                onToggle={onToggle}
                onDelete={onDelete}
                onKeyboardMove={onKeyboardMove}
              />
            ))}
          </ul>
        </SortableContext>
      ) : (
        <button type="button" className="empty-day" disabled={!canCreate} onClick={() => onCreate(key)}>
          <CalendarBlank aria-hidden="true" />
          <span>{t("emptyDay")}</span>
          <strong>{t("addToDay")}</strong>
        </button>
      )}
      <img className="day-flower" src={`/assets/image_${dayIndex + 4}.png`} alt="" />
    </article>
  );
}

export function WeekPlanner({
  week,
  reminders,
  calendars,
  tags,
  locale,
  canCreate = true,
  onCreate,
  onEdit,
  onToggle,
  onDelete,
  onReorder,
}: WeekPlannerProps) {
  const days = visibleDays(week);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const columns = useMemo(() => buildWeekColumns(week, reminders), [week, reminders]);

  const submitColumns = (nextColumns: DayTaskColumn[]) => {
    onReorder(serializeDayColumns(nextColumns));
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over) return;
    const next = reorderDayByDrag(columns, reminders, String(event.active.id), String(event.over.id));
    if (next) submitColumns(next);
  };

  const onKeyboardMove = (reminder: Reminder, direction: "up" | "down" | "previous" | "next") => {
    const next = moveDayByKeyboard(columns, reminder, direction);
    if (next) submitColumns(next);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <section className="week-grid" aria-label="Weekly calendar">
        {columns.map((column, index) => (
          <DayColumn
            key={column.date}
            date={days[index]}
            dayIndex={index}
            reminders={column.reminders}
            calendars={calendars}
            tags={tags}
            locale={locale}
            canCreate={canCreate}
            onCreate={onCreate}
            onEdit={onEdit}
            onToggle={onToggle}
            onDelete={onDelete}
            onKeyboardMove={onKeyboardMove}
          />
        ))}
      </section>
    </DndContext>
  );
}
