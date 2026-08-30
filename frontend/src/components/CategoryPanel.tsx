import { useEffect, useMemo, useState } from "react";
import { ArrowsDownUp, Check, PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Calendar, Category, FloatingTask } from "../types";

interface CategoryPanelProps {
  category: Category;
  categories: Category[];
  tasks: FloatingTask[];
  calendars: Calendar[];
  currentUserId: string;
  onClose: () => void;
  onError: (error: unknown) => void;
}

function SortableTask({
  task,
  calendar,
  categories,
  reorderDisabled,
  onError,
}: {
  task: FloatingTask;
  calendar?: Calendar;
  categories: Category[];
  reorderDisabled: boolean;
  onError: (error: unknown) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.text);
  const [editVersion, setEditVersion] = useState(task.version);
  const sortable = useSortable({ id: task.id, disabled: reorderDisabled });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["floating"] });
  const update = useMutation({
    mutationFn: (payload: Partial<FloatingTask>) => api.updateFloating(task, payload),
    onSuccess: refresh,
    onError,
  });
  const saveText = useMutation({
    mutationFn: () =>
      api.updateFloating(
        editVersion === task.version ? task : { ...task, version: editVersion },
        { text: text.trim() },
      ),
    onSuccess: () => {
      setEditing(false);
      return refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteFloating(task),
    onSuccess: refresh,
    onError,
  });

  return (
    <li ref={sortable.setNodeRef} style={style} className={`floating-task${task.completed ? " is-completed" : ""}`}>
      {!reorderDisabled ? (
        <button
          type="button"
          className="drag-handle"
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={t("dragFloating")}
        >
          <ArrowsDownUp aria-hidden="true" />
        </button>
      ) : <span />}
      <button
        type="button"
        className="task-check"
        aria-label={t("completed")}
        aria-pressed={task.completed}
        onClick={() => update.mutate({ completed: !task.completed })}
      >
        {task.completed ? <Check aria-hidden="true" /> : null}
      </button>
      <div className="floating-task__body">
        {editing ? (
          <textarea value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} />
        ) : (
          <p>{task.text}</p>
        )}
        <small>{calendar?.name}</small>
      </div>
      <div className="task-actions">
          {editing ? (
            <button
              type="button"
              className="icon-button icon-button--small"
              aria-label={t("save")}
              disabled={!text.trim() || saveText.isPending}
              onClick={() => saveText.mutate()}
            >
              <Check aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="icon-button icon-button--small"
              aria-label={t("edit")}
              onClick={() => {
                setText(task.text);
                setEditVersion(task.version);
                setEditing(true);
              }}
            >
              <PencilSimple aria-hidden="true" />
            </button>
          )}
          <select
            value={task.category_id}
            aria-label={t("category")}
            onChange={(event) => update.mutate({ category_id: event.target.value })}
          >
            {categories.filter((item) => item.owner_id || item.global_category).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <button type="button" className="icon-button icon-button--small" aria-label={t("remove")} onClick={() => remove.mutate()}>
            <Trash aria-hidden="true" />
          </button>
      </div>
    </li>
  );
}

export function CategoryPanel({
  category,
  categories,
  tasks,
  calendars,
  currentUserId,
  onClose,
  onError,
}: CategoryPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [newText, setNewText] = useState("");
  const [categoryName, setCategoryName] = useState(category.name);
  const [categoryVersion, setCategoryVersion] = useState(category.version);
  const [categoryDirty, setCategoryDirty] = useState(false);
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const categoryOwned = !category.global_category && category.owner_id === currentUserId;
  const categoryReadOnly = !categoryOwned;
  const canCreate = category.global_category || categoryOwned;
  const assignableCategories = categories.filter(
    (item) => item.global_category || item.owner_id === currentUserId,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!calendars.some((calendar) => calendar.id === calendarId)) setCalendarId(calendars[0]?.id ?? "");
  }, [calendarId, calendars]);

  useEffect(() => {
    if (!categoryDirty) {
      setCategoryName(category.name);
      setCategoryVersion(category.version);
    }
  }, [category.name, category.version, categoryDirty]);

  const filtered = useMemo(
    () => tasks
      .filter((task) => task.category_id === category.id)
      .filter((task) => task.text.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
      .sort((a, b) => a.position - b.position),
    [category.id, search, tasks],
  );
  const taskGroups = useMemo(
    () => calendars
      .map((calendar) => ({
        calendar,
        tasks: filtered.filter((task) => task.calendar_id === calendar.id),
      }))
      .filter((group) => group.tasks.length > 0),
    [calendars, filtered],
  );
  const create = useMutation({
    mutationFn: () => api.createFloating({
      calendar_id: calendarId,
      category_id: category.id,
      text: newText.trim(),
      completed: false,
    }),
    onSuccess: async () => {
      setNewText("");
      await queryClient.invalidateQueries({ queryKey: ["floating"] });
    },
    onError,
  });
  const updateCategory = useMutation({
    mutationFn: () =>
      api.updateCategory(
        categoryVersion === category.version
          ? category
          : { ...category, version: categoryVersion },
        categoryName.trim(),
      ),
    onSuccess: (next) => {
      setCategoryName(next.name);
      setCategoryVersion(next.version);
      setCategoryDirty(false);
      return queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError,
  });
  const deleteCategory = useMutation({
    mutationFn: () => api.deleteCategory(category),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      onClose();
    },
    onError,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      api.reorderFloating(
        ids,
        Object.fromEntries(
          tasks
            .filter((task) => ids.includes(task.id))
            .map((task) => [task.id, task.version]),
        ),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floating"] }),
    onError,
  });
  const onDragEnd = (event: DragEndEvent, group: FloatingTask[]) => {
    if (search.trim() || !event.over || event.active.id === event.over.id) return;
    const oldIndex = group.findIndex((item) => item.id === event.active.id);
    const newIndex = group.findIndex((item) => item.id === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorder.mutate(arrayMove(group, oldIndex, newIndex).map((task) => task.id));
  };

  return (
    <aside className="category-panel" aria-labelledby="category-panel-title">
      <header>
        <div>
          <p>{t("categoryTasks")}</p>
          <h2 id="category-panel-title">{category.name}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t("close")}>
          <X aria-hidden="true" />
        </button>
      </header>
      {categoryReadOnly ? <p className="notice">{t("readOnlyCategory")}</p> : null}
      {!categoryReadOnly ? (
        <div className="category-manage">
          <label className="field">
            <span>{t("category")}</span>
            <input
              value={categoryName}
              maxLength={100}
              onChange={(event) => {
                if (!categoryDirty) setCategoryVersion(category.version);
                setCategoryDirty(true);
                setCategoryName(event.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="button button--quiet"
            disabled={!categoryName.trim() || categoryName === category.name || updateCategory.isPending}
            onClick={() => updateCategory.mutate()}
          >
            <Check aria-hidden="true" /> {t("save")}
          </button>
          <button
            type="button"
            className="button button--danger"
            disabled={tasks.some((task) => task.category_id === category.id) || deleteCategory.isPending}
            onClick={() => deleteCategory.mutate()}
          >
            <Trash aria-hidden="true" /> {t("remove")}
          </button>
        </div>
      ) : null}
      <label className="field">
        <span>{t("categorySearch")}</span>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {canCreate ? (
        <form
          className="floating-create"
          onSubmit={(event) => {
            event.preventDefault();
            if (newText.trim() && calendarId) create.mutate();
          }}
        >
          <label className="field">
            <span>{t("newTask")}</span>
            <input value={newText} maxLength={2000} onChange={(event) => setNewText(event.target.value)} />
          </label>
          <label className="field">
            <span>{t("calendar")}</span>
            <select value={calendarId} onChange={(event) => setCalendarId(event.target.value)}>
              {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
            </select>
          </label>
          <button type="submit" className="button button--primary" disabled={!newText.trim() || !calendarId || create.isPending}>
            <Plus aria-hidden="true" /> {t("addTask")}
          </button>
        </form>
      ) : null}
      {taskGroups.length ? (
        <div className="floating-groups">
          {taskGroups.map((group) => (
            <section key={group.calendar.id} className="floating-group">
              <h3>{group.calendar.name}</h3>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => onDragEnd(event, group.tasks)}
              >
                <SortableContext items={group.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                  <ul className="floating-list">
                    {group.tasks.map((task) => (
                      <SortableTask
                        key={task.id}
                        task={task}
                        calendar={group.calendar}
                        categories={assignableCategories}
                        reorderDisabled={Boolean(search.trim())}
                        onError={onError}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            </section>
          ))}
        </div>
      ) : <p className="empty-state">{t("noCategoryTasks")}</p>}
    </aside>
  );
}
