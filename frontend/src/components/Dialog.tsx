import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}

export function Dialog({ open, onOpenChange, title, description, children, wide }: DialogProps) {
  const { t } = useTranslation();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content className={`dialog-content${wide ? " dialog-content--wide" : ""}`}>
          <div className="dialog-heading">
            <div>
              <RadixDialog.Title>{title}</RadixDialog.Title>
              {description ? <RadixDialog.Description>{description}</RadixDialog.Description> : null}
            </div>
            <RadixDialog.Close className="icon-button" aria-label={t("close")}>
              <X aria-hidden="true" />
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
