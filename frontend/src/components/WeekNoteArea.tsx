import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

interface WeekNoteAreaProps {
  weekStart: string;
}

const MAX_CHARS = 1000;
const DEBOUNCE_MS = 1000;

export function WeekNoteArea({ weekStart }: WeekNoteAreaProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["weekNote", weekStart],
    queryFn: () => api.weekNote(weekStart),
  });

  const [text, setText] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (data !== undefined && !initialized.current) {
      setText(data.content);
      initialized.current = true;
    }
  }, [data]);

  useEffect(() => {
    initialized.current = false;
  }, [weekStart]);

  const mutation = useMutation({
    mutationFn: (content: string) => api.updateWeekNote(weekStart, content),
    onSuccess: (updated) => {
      qc.setQueryData(["weekNote", weekStart], updated);
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      mutation.mutate(value);
    }, DEBOUNCE_MS);
  };

  if (isLoading) return <div className="week-note-area week-note-loading" />;

  const nearLimit = text.length >= 950;

  return (
    <div className="week-note-area">
      <textarea
        className="week-note-textarea"
        value={text}
        onChange={handleChange}
        maxLength={MAX_CHARS}
        rows={4}
        placeholder={t("weekNotePlaceholder")}
        aria-label={t("weekNoteLabel")}
      />
      <span className={`week-note-count${nearLimit ? " near-limit" : ""}`}>
        {text.length}/{MAX_CHARS}
      </span>
    </div>
  );
}
