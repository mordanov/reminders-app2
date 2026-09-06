import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addWeeks,
  currentMonth,
  isValidDay,
  isValidMonth,
  isValidWeek,
  nextDay,
  nextMonth,
  prevDay,
  prevMonth,
  startOfWorkWeek,
  toDateKey,
  toYearMonth,
  weekForDay,
} from "../lib/date";

export type ViewKind = "week" | "day" | "month";

export function useViewParam() {
  const [params, setParams] = useSearchParams();

  const view = useMemo((): ViewKind => {
    if (isValidDay(params.get("day"))) return "day";
    if (isValidMonth(params.get("month"))) return "month";
    return "week";
  }, [params]);

  const day = useMemo(() => {
    const v = params.get("day");
    return isValidDay(v) ? v : null;
  }, [params]);

  const month = useMemo(() => {
    const v = params.get("month");
    return isValidMonth(v) ? v : null;
  }, [params]);

  const week = useMemo(() => {
    if (view === "day" && day) return weekForDay(day);
    const v = params.get("week");
    return isValidWeek(v) ? v : toDateKey(startOfWorkWeek());
  }, [params, view, day]);

  const setWeek = useCallback(
    (value: string) => {
      setParams(() => new URLSearchParams({ week: value }));
    },
    [setParams],
  );

  const setDay = useCallback(
    (value: string) => {
      setParams(() => new URLSearchParams({ day: value }));
    },
    [setParams],
  );

  const setMonth = useCallback(
    (value: string) => {
      setParams(() => new URLSearchParams({ month: value }));
    },
    [setParams],
  );

  const gotoDay = useCallback(
    (dateKey: string) => {
      setParams(() => new URLSearchParams({ day: dateKey }));
    },
    [setParams],
  );

  const prev = useCallback(() => {
    if (view === "day" && day) setDay(prevDay(day));
    else if (view === "month" && month) setMonth(prevMonth(month));
    else setWeek(toDateKey(addWeeks(new Date(`${week}T00:00:00`), -1)));
  }, [view, day, month, week, setDay, setMonth, setWeek]);

  const next = useCallback(() => {
    if (view === "day" && day) setDay(nextDay(day));
    else if (view === "month" && month) setMonth(nextMonth(month));
    else setWeek(toDateKey(addWeeks(new Date(`${week}T00:00:00`), 1)));
  }, [view, day, month, week, setDay, setMonth, setWeek]);

  const today = useCallback(() => {
    if (view === "day") setDay(toDateKey(new Date()));
    else if (view === "month") setMonth(currentMonth());
    else setWeek(toDateKey(startOfWorkWeek()));
  }, [view, setDay, setMonth, setWeek]);

  const switchToWeek = useCallback(() => {
    setWeek(week);
  }, [week, setWeek]);

  const switchToMonth = useCallback(() => {
    const target = day ? toYearMonth(new Date(`${day}T00:00:00`)) : currentMonth();
    setMonth(target);
  }, [day, setMonth]);

  const switchToDay = useCallback(() => {
    setDay(day ?? toDateKey(new Date()));
  }, [day, setDay]);

  return {
    view,
    week,
    day,
    month,
    setWeek,
    setDay,
    setMonth,
    gotoDay,
    prev,
    next,
    today,
    switchToWeek,
    switchToMonth,
    switchToDay,
  };
}
