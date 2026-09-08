import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

interface ShoppingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FIXED_ROWS: Array<{ key: string; label: string; icon: string }[]> = [
  [
    { key: "aldi", label: "Aldi", icon: "🛒" },
    { key: "lidl", label: "Lidl", icon: "🛍️" },
    { key: "mercadona", label: "Mercadona", icon: "🥬" },
  ],
  [
    { key: "carrefour", label: "Carrefour", icon: "🏪" },
    { key: "makro", label: "Makro", icon: "📦" },
    { key: "dia", label: "DIA", icon: "🏷️" },
  ],
  [
    { key: "aliexpress", label: "AliExpress", icon: "🌏" },
    { key: "amazon", label: "Amazon", icon: "🚚" },
    { key: "kosmetika", label: "Косметика ✂️", icon: "" },
  ],
];

const CUSTOM_KEYS = ["custom_0", "custom_1", "custom_2"] as const;

export function ShoppingDialog({ open, onOpenChange }: ShoppingDialogProps) {
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDownOnOverlay = useRef(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaEls = useRef<Map<string, HTMLTextAreaElement | null>>(new Map());
  const stableTextareaRefs = useRef<Map<string, (el: HTMLTextAreaElement | null) => void>>(new Map());

  const getTextareaRef = useCallback((key: string) => {
    if (!stableTextareaRefs.current.has(key)) {
      stableTextareaRefs.current.set(key, (el) => textareaEls.current.set(key, el));
    }
    return stableTextareaRefs.current.get(key)!;
  }, []);

  useEffect(() => {
    if (!open) return;
    const observers: ResizeObserver[] = [];

    const attach = (el: HTMLElement, lsKey: string, dims: ('width' | 'height')[]) => {
      try {
        const raw = localStorage.getItem(lsKey);
        if (raw) {
          const saved = JSON.parse(raw) as Record<string, number>;
          if (saved.width && dims.includes('width')) el.style.width = `${saved.width}px`;
          if (saved.height && dims.includes('height')) el.style.height = `${saved.height}px`;
        }
      } catch { /* ignore */ }
      const obs = new ResizeObserver(() => {
        try {
          const data: Record<string, number> = {};
          if (dims.includes('width') && el.style.width) data.width = parseInt(el.style.width, 10);
          if (dims.includes('height') && el.style.height) data.height = parseInt(el.style.height, 10);
          if (Object.keys(data).length) localStorage.setItem(lsKey, JSON.stringify(data));
        } catch { /* ignore */ }
      });
      obs.observe(el);
      observers.push(obs);
    };

    if (dialogRef.current) attach(dialogRef.current, 'shopping_dialog_size', ['width', 'height']);
    textareaEls.current.forEach((el, key) => { if (el) attach(el, `shopping_ta_${key}`, ['height']); });

    return () => { observers.forEach((o) => o.disconnect()); };
  }, [open]);

  const { data } = useQuery({
    queryKey: ["shoppingList"],
    queryFn: () => api.shoppingList(),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (d: Record<string, string>) => api.updateShoppingList(d),
    onSuccess: (result) => {
      queryClient.setQueryData(["shoppingList"], result);
    },
  });

  const [localData, setLocalData] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) setLocalData(data.data);
  }, [data]);

  const handleChange = (key: string, value: string) => {
    const next = { ...localData, [key]: value };
    setLocalData(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      mutation.mutate(next);
    }, 800);
  };

  if (!open) return null;

  return (
    <div
      className="shopping-overlay"
      onMouseDown={(e) => { pointerDownOnOverlay.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && pointerDownOnOverlay.current) onOpenChange(false); }}
    >
      <div className="shopping-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Магазины">
        <div className="shopping-dialog__header">
          <h2>🛒 Магазины</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть"
            onClick={() => onOpenChange(false)}
          >
            <X />
          </button>
        </div>
        <div className="shopping-grid">
          {FIXED_ROWS.map((row) =>
            row.map((store) => (
              <div key={store.key} className="shopping-cell">
                <label className="shopping-cell__label">
                  {store.icon && <span className="shopping-cell__icon">{store.icon}</span>}
                  {store.label}
                </label>
                <textarea
                  ref={getTextareaRef(store.key)}
                  className="shopping-cell__input"
                  value={localData[store.key] ?? ""}
                  onChange={(e) => handleChange(store.key, e.target.value)}
                  rows={4}
                  placeholder="..."
                />
              </div>
            ))
          )}
          {CUSTOM_KEYS.map((key) => {
            const labelKey = `${key}_label`;
            return (
              <div key={key} className="shopping-cell">
                <input
                  className="shopping-cell__label-input"
                  type="text"
                  value={localData[labelKey] ?? ""}
                  onChange={(e) => handleChange(labelKey, e.target.value)}
                  placeholder="Название..."
                />
                <textarea
                  ref={getTextareaRef(key)}
                  className="shopping-cell__input"
                  value={localData[key] ?? ""}
                  onChange={(e) => handleChange(key, e.target.value)}
                  rows={4}
                  placeholder="..."
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
