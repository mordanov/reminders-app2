import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import {
  localDateTimeValue,
  reminderDateKey,
  zonedDateTimeToIso,
} from "../lib/date";
import type { Calendar, Reminder, ReminderDraft } from "../types";
import { Dialog } from "./Dialog";

interface ReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendars: Calendar[];
  reminders: Reminder[];
  initialDate: string;
  reminder?: Reminder;
  onError: (error: unknown) => void;
}

function initialDraft(calendarId: string, date: string, reminder?: Reminder): ReminderDraft {
  return {
    calendar_id: reminder?.calendar_id ?? calendarId,
    kind: reminder?.kind ?? "DAY",
    text: reminder?.text ?? "",
    due_date: reminder?.due_date ?? date,
    due_at: reminder?.due_at ? localDateTimeValue(reminder.due_at) : `${date}T09:00`,
    completed: reminder?.completed ?? false,
    tag_ids: reminder?.tag_ids ?? [],
    weekly_count: 1,
  };
}

export function ReminderDialog({
  open,
  onOpenChange,
  calendars,
  reminders,
  initialDate,
  reminder,
  onError,
}: ReminderDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const firstCalendar = calendars[0]?.id ?? "";
  const [draft, setDraft] = useState(() => initialDraft(firstCalendar, initialDate, reminder));
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState("");
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(initialDraft(firstCalendar, initialDate, reminder));
      setTagInput("");
      setError("");
      setConfirmDuplicate(false);
    }
  }, [firstCalendar, initialDate, open, reminder]);

  const tagsQuery = useQuery({
    queryKey: ["tags", draft.calendar_id],
    queryFn: () => api.tags(draft.calendar_id),
    enabled: open && Boolean(draft.calendar_id),
  });
  const tags = tagsQuery.data ?? [];
  const selectedTags = tags.filter((tag) => draft.tag_ids.includes(tag.id));
  const suggestions = tags.filter(
    (tag) =>
      !draft.tag_ids.includes(tag.id) &&
      tag.name.toLocaleLowerCase().includes(tagInput.trim().toLocaleLowerCase()),
  );

  const createMutation = useMutation({
    mutationFn: (value: ReminderDraft) => api.createReminder({
      ...value,
      due_at: value.kind === "DATETIME" && value.due_at ? zonedDateTimeToIso(value.due_at) : null,
      due_date: value.kind === "DAY" ? value.due_date : null,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["week"] });
      onOpenChange(false);
    },
    onError,
  });
  const updateMutation = useMutation({
    mutationFn: (value: ReminderDraft) => api.updateReminder(reminder!, {
      calendar_id: value.calendar_id,
      text: value.text,
      completed: value.completed,
      due_date: value.kind === "DAY" ? value.due_date : null,
      due_at: value.kind === "DATETIME" && value.due_at ? zonedDateTimeToIso(value.due_at) : null,
      tag_ids:
        value.calendar_id !== reminder?.calendar_id && value.tag_ids.length === 0
          ? undefined
          : value.tag_ids,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["week"] });
      onOpenChange(false);
    },
    onError,
  });
  const createTagMutation = useMutation({
    mutationFn: () => api.createTag(draft.calendar_id, tagInput.trim()),
    onSuccess: async (tag) => {
      setDraft((current) => ({ ...current, tag_ids: [...current.tag_ids, tag.id] }));
      setTagInput("");
      await queryClient.invalidateQueries({ queryKey: ["tags", draft.calendar_id] });
    },
    onError,
  });

  const duplicate = useMemo(() => reminders.some((item) => {
    if (item.id === reminder?.id || item.calendar_id !== draft.calendar_id) return false;
    const date = draft.kind === "DAY" ? draft.due_date : draft.due_at?.slice(0, 10);
    return item.text.trim().toLocaleLowerCase() === draft.text.trim().toLocaleLowerCase() &&
      reminderDateKey(item) === date;
  }), [draft, reminder?.id, reminders]);

  const pending = createMutation.isPending || updateMutation.isPending;

  const submit = (allowDuplicate = false) => {
    if (!draft.calendar_id || !calendars.some((calendar) => calendar.id === draft.calendar_id)) {
      setError(t("calendarRequired"));
      return;
    }
    if (!draft.text.trim()) {
      setError(t("textRequired"));
      return;
    }
    const date = draft.kind === "DAY" ? draft.due_date : draft.due_at?.slice(0, 10);
    if (!date || new Date(`${date}T00:00:00`).getDay() === 0) {
      setError(t("invalidDate"));
      return;
    }
    if (draft.tag_ids.length > 10) {
      setError(t("tagLimit"));
      return;
    }
    if (!reminder && duplicate && !allowDuplicate) {
      setConfirmDuplicate(true);
      return;
    }
    setError("");
    if (reminder) updateMutation.mutate(draft);
    else createMutation.mutate(draft);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("reminder")}
      description={reminder ? t("edit") : t("newReminder")}
      wide
    >
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <label className="field field--wide">
          <span>{t("text")}</span>
          <textarea
            autoFocus
            maxLength={2000}
            rows={6}
            value={draft.text}
            onChange={(event) => setDraft({ ...draft, text: event.target.value })}
            aria-describedby="text-count"
          />
          <small id="text-count">{t("charsLeft", { count: 2000 - draft.text.length })}</small>
        </label>
        <label className="field">
          <span>{t("calendar")}</span>
          <select
            value={draft.calendar_id}
            onChange={(event) => setDraft({ ...draft, calendar_id: event.target.value, tag_ids: [] })}
            required
          >
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
            ))}
          </select>
        </label>
        <fieldset className="field fieldset">
          <legend>{t("type")}</legend>
          <label className="radio">
            <input
              type="radio"
              name="kind"
              value="DAY"
              checked={draft.kind === "DAY"}
              disabled={Boolean(reminder)}
              onChange={() => setDraft({ ...draft, kind: "DAY" })}
            />
            {t("dayTask")}
          </label>
          <label className="radio">
            <input
              type="radio"
              name="kind"
              value="DATETIME"
              checked={draft.kind === "DATETIME"}
              disabled={Boolean(reminder)}
              onChange={() => setDraft({ ...draft, kind: "DATETIME" })}
            />
            {t("timedTask")}
          </label>
        </fieldset>
        {draft.kind === "DAY" ? (
          <label className="field">
            <span>{t("date")}</span>
            <input
              type="date"
              value={draft.due_date ?? ""}
              onChange={(event) => setDraft({ ...draft, due_date: event.target.value })}
              required
            />
          </label>
        ) : (
          <label className="field">
            <span>{t("dateTime")}</span>
            <input
              type="datetime-local"
              value={draft.due_at ?? ""}
              onChange={(event) => setDraft({ ...draft, due_at: event.target.value })}
              required
            />
          </label>
        )}
        {!reminder ? (
          <label className="field">
            <span>{t("repeat")}</span>
            <input
              type="number"
              min={1}
              max={52}
              value={draft.weekly_count}
              onChange={(event) => setDraft({ ...draft, weekly_count: Number(event.target.value) })}
              aria-describedby="repeat-help"
            />
            <small id="repeat-help">{t("repeatHelp")}</small>
          </label>
        ) : null}
        <label className="check field--wide">
          <input
            type="checkbox"
            checked={draft.completed}
            onChange={(event) => setDraft({ ...draft, completed: event.target.checked })}
          />
          {t("completed")}
        </label>
        <div className="field field--wide">
          <span>{t("tags")}</span>
          <div className="tag-picker">
            <div className="tag-list">
              {selectedTags.map((tag) => (
                <button
                  type="button"
                  className="tag-chip"
                  key={tag.id}
                  onClick={() => setDraft({ ...draft, tag_ids: draft.tag_ids.filter((id) => id !== tag.id) })}
                >
                  {tag.name}<X aria-hidden="true" />
                </button>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder={t("tags")}
              disabled={draft.tag_ids.length >= 10}
              list="tag-suggestions"
            />
            <datalist id="tag-suggestions">
              {suggestions.map((tag) => <option key={tag.id} value={tag.name} />)}
            </datalist>
            {tagInput.trim() ? (
              <div className="tag-suggestions" role="listbox" aria-label={t("tags")}>
                {suggestions.map((tag) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    key={tag.id}
                    onClick={() => {
                      setDraft({ ...draft, tag_ids: [...draft.tag_ids, tag.id] });
                      setTagInput("");
                    }}
                  >
                    {tag.name}
                  </button>
                ))}
                {!tags.some((tag) => tag.name.toLocaleLowerCase() === tagInput.trim().toLocaleLowerCase()) ? (
                  <button
                    type="button"
                    onClick={() => createTagMutation.mutate()}
                    disabled={createTagMutation.isPending || draft.tag_ids.length >= 10}
                  >
                    <Plus aria-hidden="true" /> {t("create")}: {tagInput.trim()}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <small>{t("tagsHelp")}</small>
        </div>
        {confirmDuplicate ? (
          <div className="duplicate-warning field--wide" role="alert">
            <strong>{t("duplicateTitle")}</strong>
            <span>{t("duplicateBody")}</span>
            <button type="button" className="button button--danger" onClick={() => submit(true)}>
              {t("confirmDuplicate")}
            </button>
          </div>
        ) : null}
        <div className="dialog-actions field--wide">
          <button type="button" className="button button--quiet" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={pending || !calendars.length}
          >
            {pending ? t("loading") : reminder ? t("save") : t("create")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
