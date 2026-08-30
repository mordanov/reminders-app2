import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { addWeeks, isValidWeek, startOfWorkWeek, toDateKey } from "../lib/date";

export function useWeekParam() {
  const [params, setParams] = useSearchParams();
  const week = useMemo(() => {
    const value = params.get("week");
    return isValidWeek(value) ? value : toDateKey(startOfWorkWeek());
  }, [params]);

  const setWeek = useCallback((value: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("week", value);
      return next;
    });
  }, [setParams]);

  return {
    week,
    setWeek,
    previous: () => setWeek(toDateKey(addWeeks(new Date(`${week}T00:00:00`), -1))),
    next: () => setWeek(toDateKey(addWeeks(new Date(`${week}T00:00:00`), 1))),
    today: () => setWeek(toDateKey(startOfWorkWeek())),
  };
}
