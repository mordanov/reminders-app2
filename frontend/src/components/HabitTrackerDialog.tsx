import { useEffect, useMemo, useRef, useState } from "react";
import { CaretLeft, CaretRight, Plus, Trash, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { HabitItem } from "../types";
import { nextMonth, prevMonth, toDateKey, toYearMonth } from "../lib/date";

interface HabitTrackerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROW_COLORS = [
  "#E8D5B7", "#C8E6C8", "#B3D4E8", "#E8D0E0", "#E8E4C0",
  "#C8D0E8", "#E8C8C0", "#C0E8E0", "#D8E8C0", "#E0C8E8",
];

export function HabitTrackerDialog({ open, onOpenChange }: HabitTrackerDialogProps) {
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [month, setMonth] = useState(() => toYearMonth(new Date()));

  const { data } = useQuery({
    queryKey: ["habitTracker"],
    queryFn: () => api.habitTracker(),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: ({
      habits,
      completions,
    }: {
      habits: HabitItem[];
      completions: Record<string, boolean>;
    }) => api.updateHabitTracker(habits, completions),
    onSuccess: (result) => {
      queryClient.setQueryData(["habitTracker"], result);
    },
  });

  const [localHabits, setLocalHabits] = useState<HabitItem[]>([]);
  const [localCompletions, setLocalCompletions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (data) {
      setLocalHabits(data.habits);
      setLocalCompletions(data.completions);
    }
  }, [data]);

  const save = (habits: HabitItem[], completions: Record<string, boolean>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      mutation.mutate({ habits, completions });
    }, 600);
  };

  const daysInMonth = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }, [month]);

  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth],
  );

  const todayKey = toDateKey(new Date());
  const todayDay = todayKey.startsWith(month) ? parseInt(todayKey.slice(8)) : null;

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("ru", { month: "long", year: "numeric" });
  }, [month]);

  const toggleCompletion = (habitId: string, day: number) => {
    const dateKey = `${month}-${String(day).padStart(2, "0")}`;
    const key = `${habitId}:${dateKey}`;
    const next = { ...localCompletions, [key]: !localCompletions[key] };
    setLocalCompletions(next);
    save(localHabits, next);
  };

  const updateHabitName = (id: string, name: string) => {
    const next = localHabits.map((h) => (h.id === id ? { ...h, name } : h));
    setLocalHabits(next);
    save(next, localCompletions);
  };

  const addHabit = () => {
    const id = crypto.randomUUID();
    const next = [...localHabits, { id, name: "" }];
    setLocalHabits(next);
    save(next, localCompletions);
  };

  const deleteHabit = (id: string) => {
    const next = localHabits.filter((h) => h.id !== id);
    setLocalHabits(next);
    save(next, localCompletions);
  };

  if (!open) return null;

  return (
    <div
      className="habit-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div className="habit-dialog" role="dialog" aria-modal="true" aria-label="Трекер привычек">
        <div className="habit-dialog__header">
          <div className="habit-dialog__nav">
            <button
              type="button"
              className="icon-button"
              aria-label="Предыдущий месяц"
              onClick={() => setMonth(prevMonth(month))}
            >
              <CaretLeft size={16} />
            </button>
            <span className="habit-dialog__month">{monthLabel}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Следующий месяц"
              onClick={() => setMonth(nextMonth(month))}
            >
              <CaretRight size={16} />
            </button>
          </div>
          <h2 className="habit-dialog__title">📋 Трекер привычек</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть"
            onClick={() => onOpenChange(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="habit-table-wrap">
          <table className="habit-table">
            <thead>
              <tr>
                <th className="habit-col-num" />
                <th className="habit-col-name">Привычка</th>
                {days.map((d) => (
                  <th
                    key={d}
                    className={`habit-col-day${d === todayDay ? " is-today" : ""}`}
                  >
                    {d}
                  </th>
                ))}
                <th className="habit-col-del" />
              </tr>
            </thead>
            <tbody>
              {localHabits.map((habit, idx) => {
                const color = ROW_COLORS[idx % ROW_COLORS.length];
                return (
                  <tr key={habit.id} className="habit-row">
                    <td className="habit-col-num">
                      <span className="habit-row-badge" style={{ background: color }}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="habit-col-name">
                      <input
                        type="text"
                        className="habit-name-input"
                        value={habit.name}
                        onChange={(e) => updateHabitName(habit.id, e.target.value)}
                        placeholder="Название привычки…"
                      />
                    </td>
                    {days.map((d) => {
                      const key = `${habit.id}:${month}-${String(d).padStart(2, "0")}`;
                      const done = !!localCompletions[key];
                      return (
                        <td
                          key={d}
                          className={`habit-col-day${d === todayDay ? " is-today" : ""}`}
                        >
                          <button
                            type="button"
                            className={`habit-check${done ? " is-done" : ""}`}
                            style={done ? { background: color, borderColor: color } : { borderColor: color }}
                            onClick={() => toggleCompletion(habit.id, d)}
                            aria-label={`${habit.name || "Привычка"} — день ${d}`}
                            aria-pressed={done}
                          />
                        </td>
                      );
                    })}
                    <td className="habit-col-del">
                      <button
                        type="button"
                        className="habit-del-btn"
                        onClick={() => deleteHabit(habit.id)}
                        aria-label="Удалить привычку"
                      >
                        <Trash size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {localHabits.length === 0 && (
            <p className="habit-empty">Нет привычек — добавьте первую!</p>
          )}
        </div>

        <button type="button" className="habit-add-btn" onClick={addHabit}>
          <Plus size={14} />
          Добавить привычку
        </button>
      </div>
    </div>
  );
}
