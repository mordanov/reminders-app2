import { useEffect, useRef, useState } from "react";
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
    <div className="shopping-overlay" onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}>
      <div className="shopping-dialog" role="dialog" aria-modal="true" aria-label="Магазины">
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
