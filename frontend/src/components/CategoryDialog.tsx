import { useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { Dialog } from "./Dialog";

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onError: (error: unknown) => void;
}

export function CategoryDialog({ open, onOpenChange, onError }: CategoryDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api.createCategory(name.trim()),
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      onOpenChange(false);
    },
    onError,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("categories")}>
      <form
        className="category-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <label className="field">
          <span>{t("category")}</span>
          <input autoFocus value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="dialog-actions">
          <button type="button" className="button button--quiet" onClick={() => onOpenChange(false)}>{t("cancel")}</button>
          <button type="submit" className="button button--primary" disabled={!name.trim() || create.isPending}>
            <Plus aria-hidden="true" /> {t("create")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
