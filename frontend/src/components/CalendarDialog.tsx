import { useState } from "react";
import { FloppyDisk, Plus, Trash, UserMinus, UserPlus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Calendar } from "../types";
import { Dialog } from "./Dialog";

const accessibleColors = ["#556B58", "#925B35", "#6F6288", "#37667A", "#8A4B55", "#6C5A3E"];

interface CalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendars: Calendar[];
  onError: (error: unknown) => void;
}

function CalendarEditor({ calendar, onError }: { calendar: Calendar; onError: (error: unknown) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(calendar.name);
  const [color, setColor] = useState(calendar.color);
  const [username, setUsername] = useState("");
  const shares = useQuery({
    queryKey: ["shares", calendar.id],
    queryFn: () => api.shares(calendar.id),
    enabled: calendar.is_owner,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["calendars"] });
  };
  const update = useMutation({
    mutationFn: () => api.updateCalendar(calendar, { name: name.trim(), color }),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteCalendar(calendar),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["calendars"] }),
        queryClient.invalidateQueries({ queryKey: ["preferences"] }),
        queryClient.invalidateQueries({ queryKey: ["week"] }),
      ]);
    },
    onError,
  });
  const addShare = useMutation({
    mutationFn: () => api.addShare(calendar.id, username.trim()),
    onSuccess: async () => {
      setUsername("");
      await queryClient.invalidateQueries({ queryKey: ["shares", calendar.id] });
    },
    onError,
  });
  const removeShare = useMutation({
    mutationFn: (userId: string) => api.removeShare(calendar.id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shares", calendar.id] }),
    onError,
  });

  return (
    <section className="calendar-editor" aria-labelledby={`calendar-${calendar.id}`}>
      <div className="calendar-editor__title">
        <span className="calendar-dot" style={{ backgroundColor: calendar.color }} />
        <h3 id={`calendar-${calendar.id}`}>{calendar.name}</h3>
        <span className="ownership">{t(calendar.is_owner ? "owned" : "shared")}</span>
      </div>
      {calendar.is_owner ? (
        <>
          <div className="calendar-editor__fields">
            <label className="field">
              <span>{t("calendarName")}</span>
              <input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field field--color">
              <span>{t("calendarColor")}</span>
              <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
            </label>
            <button
              type="button"
              className="icon-button"
              onClick={() => update.mutate()}
              disabled={!name.trim() || update.isPending}
              aria-label={t("save")}
            >
              <FloppyDisk aria-hidden="true" />
            </button>
          </div>
          <div className="share-form">
            <label className="field">
              <span>{t("shareWith")}</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={t("username")}
              />
            </label>
            <button
              type="button"
              className="button button--quiet"
              disabled={!username.trim() || addShare.isPending}
              onClick={() => addShare.mutate()}
            >
              <UserPlus aria-hidden="true" /> {t("share")}
            </button>
          </div>
          {(shares.data ?? []).length ? (
            <ul className="share-list" aria-label={t("shares")}>
              {shares.data?.map((share) => (
                <li key={share.user.id}>
                  <span>{share.user.username}</span>
                  <button
                    type="button"
                    className="icon-button icon-button--small"
                    onClick={() => removeShare.mutate(share.user.id)}
                    aria-label={`${t("remove")} ${share.user.username}`}
                  >
                    <UserMinus aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            className="button button--danger"
            onClick={() => {
              if (window.confirm(t("deleteCalendarConfirm"))) remove.mutate();
            }}
            disabled={remove.isPending}
          >
            <Trash aria-hidden="true" /> {t("deleteCalendar")}
          </button>
        </>
      ) : (
        <p className="muted">{t("ownerOnly")}</p>
      )}
    </section>
  );
}

export function CalendarDialog({ open, onOpenChange, calendars, onError }: CalendarDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#556B58");
  const ownedCount = calendars.filter((calendar) => calendar.is_owner).length;
  const create = useMutation({
    mutationFn: () => api.createCalendar({ name: name.trim(), color }),
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["calendars"] });
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("calendarSettings")} wide>
      <div className="calendar-create">
        <label className="field">
          <span>{t("calendarName")}</span>
          <input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field field--color">
          <span>{t("calendarColor")}</span>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <div className="color-presets" aria-label={t("calendarColor")}>
          {accessibleColors.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={preset}
              aria-pressed={color.toUpperCase() === preset}
              style={{ backgroundColor: preset }}
              onClick={() => setColor(preset)}
            />
          ))}
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={() => create.mutate()}
          disabled={!name.trim() || ownedCount >= 10 || create.isPending}
        >
          <Plus aria-hidden="true" /> {t("addCalendar")}
        </button>
      </div>
      {ownedCount >= 10 ? <p className="form-error" role="status">{t("maxCalendars")}</p> : null}
      <div className="calendar-editors">
        {calendars.map((calendar) => (
          <CalendarEditor key={`${calendar.id}-${calendar.version}`} calendar={calendar} onError={onError} />
        ))}
      </div>
    </Dialog>
  );
}
