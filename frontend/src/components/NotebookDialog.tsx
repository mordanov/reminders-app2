import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Image, PencilSimple, TextB, TextItalic, TextStrikethrough, TextUnderline, X } from "@phosphor-icons/react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import TiptapImage from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Notebook } from "../types";

interface NotebookDialogProps {
  notebook: Notebook;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onError: (error: unknown) => void;
}

function MenuButton({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`notebook-menu-btn${active ? " is-active" : ""}`}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    >
      {children}
    </button>
  );
}

export function NotebookDialog({ notebook, open, onOpenChange, onError }: NotebookDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(notebook.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateNotebook = useMutation({
    mutationFn: (payload: { title?: string; content?: string }) =>
      api.updateNotebook(notebook, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData<Notebook[]>(["notebooks"], (prev) =>
        prev?.map((n) => (n.id === updated.id ? updated : n)) ?? [updated],
      );
    },
    onError,
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontFamily,
      Color,
      Highlight.configure({ multicolor: true }),
      TiptapImage.configure({ inline: false }),
    ],
    content: notebook.content || "",
    onUpdate({ editor: ed }) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateNotebook.mutate({ content: ed.getHTML() });
      }, 800);
    },
  });

  useEffect(() => {
    if (editor && notebook.content !== editor.getHTML()) {
      editor.commands.setContent(notebook.content || "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebook.id]);

  useEffect(() => {
    setTitle(notebook.title);
  }, [notebook.title]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const items = Array.from(event.clipboardData.items);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem || !editor) return;
      event.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        editor.chain().focus().setImage({ src }).run();
      };
      reader.readAsDataURL(file);
    },
    [editor],
  );

  const saveTitle = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== notebook.title) {
      updateNotebook.mutate({ title: trimmed });
    }
    setEditingTitle(false);
  };

  if (!editor) return null;

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content className="dialog-content dialog-content--wide dialog-content--notebook">
          <div className="dialog-heading">
            {editingTitle ? (
              <div className="notebook-title-edit">
                <RadixDialog.Title asChild>
                  <input
                    autoFocus
                    value={title}
                    maxLength={200}
                    className="notebook-title-input"
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitle(notebook.title); setEditingTitle(false); } }}
                  />
                </RadixDialog.Title>
                <button type="button" className="icon-button icon-button--small" onClick={saveTitle} aria-label={t("save")}>
                  <Check aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="notebook-title-row">
                <RadixDialog.Title asChild>
                  <h2>{notebook.title}</h2>
                </RadixDialog.Title>
                <button type="button" className="icon-button icon-button--small" onClick={() => setEditingTitle(true)} aria-label={t("edit")}>
                  <PencilSimple aria-hidden="true" />
                </button>
              </div>
            )}
            <RadixDialog.Close className="icon-button" aria-label={t("close")}>
              <X aria-hidden="true" />
            </RadixDialog.Close>
          </div>

          <div className="notebook-toolbar">
            <MenuButton active={editor.isActive("bold")} title={t("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
              <TextB weight="bold" />
            </MenuButton>
            <MenuButton active={editor.isActive("italic")} title={t("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <TextItalic />
            </MenuButton>
            <MenuButton active={editor.isActive("underline")} title={t("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
              <TextUnderline />
            </MenuButton>
            <MenuButton active={editor.isActive("strike")} title={t("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
              <TextStrikethrough />
            </MenuButton>
            <div className="notebook-toolbar-sep" />
            <MenuButton active={editor.isActive("heading", { level: 1 })} title="H1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              <span>H1</span>
            </MenuButton>
            <MenuButton active={editor.isActive("heading", { level: 2 })} title="H2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <span>H2</span>
            </MenuButton>
            <MenuButton active={editor.isActive("heading", { level: 3 })} title="H3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
              <span>H3</span>
            </MenuButton>
            <div className="notebook-toolbar-sep" />
            <MenuButton active={editor.isActive("bulletList")} title={t("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <span className="notebook-icon-text">•–</span>
            </MenuButton>
            <MenuButton active={editor.isActive("orderedList")} title={t("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <span className="notebook-icon-text">1.</span>
            </MenuButton>
            <MenuButton active={editor.isActive("blockquote")} title={t("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <span className="notebook-icon-text">"</span>
            </MenuButton>
            <div className="notebook-toolbar-sep" />
            <select
              className="notebook-font-select"
              title={t("fontFamily")}
              value={editor.getAttributes("textStyle").fontFamily ?? ""}
              onChange={(e) => {
                if (e.target.value) {
                  editor.chain().focus().setFontFamily(e.target.value).run();
                } else {
                  editor.chain().focus().unsetFontFamily().run();
                }
              }}
            >
              <option value="">{t("defaultFont")}</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="'Courier New', monospace">Courier New</option>
              <option value="'Snell Roundhand', cursive">Script</option>
            </select>
            <div className="notebook-toolbar-sep" />
            <label className="notebook-color-label" title={t("textColor")}>
              <span className="sr-only">{t("textColor")}</span>
              <input
                type="color"
                className="notebook-color-input"
                value={editor.getAttributes("textStyle").color ?? "#33382d"}
                onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
              />
            </label>
            <div className="notebook-toolbar-sep" />
            <MenuButton title={t("insertImage")} onClick={() => {
              const url = window.prompt(t("imageUrl") ?? "Image URL");
              if (url) editor.chain().focus().setImage({ src: url }).run();
            }}>
              <Image />
            </MenuButton>
          </div>

          <div className="notebook-editor-wrap" onPaste={handlePaste}>
            <EditorContent editor={editor} className="notebook-editor" />
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
