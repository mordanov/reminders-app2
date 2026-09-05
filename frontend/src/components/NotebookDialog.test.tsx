import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import "../i18n";
import type { Notebook } from "../types";
import { NotebookDialog } from "./NotebookDialog";

// vi.hoisted runs before imports so mockEditor is available in vi.mock factory
const { mockEditor, onUpdateRef } = vi.hoisted(() => {
  const mockChain: Record<string, unknown> = {};
  [
    "focus",
    "toggleBold",
    "toggleItalic",
    "toggleUnderline",
    "toggleStrike",
    "toggleHeading",
    "toggleBulletList",
    "toggleOrderedList",
    "toggleBlockquote",
    "setFontFamily",
    "unsetFontFamily",
    "setColor",
    "setImage",
    "run",
  ].forEach((m) => {
    mockChain[m] = vi.fn(() => mockChain);
  });

  const mockEditor = {
    isActive: vi.fn(() => false),
    getAttributes: vi.fn(() => ({} as Record<string, string>)),
    chain: vi.fn(() => mockChain),
    commands: { setContent: vi.fn() },
    getHTML: vi.fn(() => "<p></p>"),
  };

  // Captures the onUpdate callback so tests can trigger it
  const onUpdateRef = { current: undefined as ((args: { editor: typeof mockEditor }) => void) | undefined };

  return { mockEditor, onUpdateRef };
});

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn((config: { onUpdate?: (args: { editor: typeof mockEditor }) => void }) => {
    onUpdateRef.current = config?.onUpdate;
    return mockEditor;
  }),
  EditorContent: vi.fn(() => null),
}));

const testNotebook: Notebook = {
  id: "nb-test-1",
  owner_id: "user-demo",
  title: "My Test Notebook",
  content: "<p>Hello</p>",
  position: 0,
  version: 1,
  created_at: "2026-09-05T00:00:00Z",
  updated_at: "2026-09-05T00:00:00Z",
};

function renderDialog(
  overrides: {
    open?: boolean;
    onOpenChange?: (o: boolean) => void;
    onError?: (e: unknown) => void;
    notebook?: Notebook;
  } = {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onOpenChange = overrides.onOpenChange ?? vi.fn();
  const onError = overrides.onError ?? vi.fn();
  return {
    onOpenChange,
    onError,
    ...render(
      <QueryClientProvider client={qc}>
        <NotebookDialog
          notebook={overrides.notebook ?? testNotebook}
          open={overrides.open ?? true}
          onOpenChange={onOpenChange}
          onError={onError}
        />
      </QueryClientProvider>,
    ),
  };
}

describe("NotebookDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEditor.isActive.mockReturnValue(false);
    mockEditor.getAttributes.mockReturnValue({});
    mockEditor.getHTML.mockReturnValue("<p></p>");
  });

  it("renders the notebook title", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: testNotebook.title })).toBeInTheDocument();
  });

  it("renders toolbar formatting buttons", () => {
    renderDialog();
    expect(screen.getByTitle("Жирный")).toBeInTheDocument();
    expect(screen.getByTitle("Курсив")).toBeInTheDocument();
    expect(screen.getByTitle("Подчёркнутый")).toBeInTheDocument();
    expect(screen.getByTitle("Зачёркнутый")).toBeInTheDocument();
    expect(screen.getByTitle("H1")).toBeInTheDocument();
    expect(screen.getByTitle("H2")).toBeInTheDocument();
    expect(screen.getByTitle("H3")).toBeInTheDocument();
  });

  it("enters title edit mode and shows input with current title", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
    expect(screen.getByRole("textbox")).toHaveValue(testNotebook.title);
  });

  it("saves updated title on Enter", async () => {
    const updateSpy = vi
      .spyOn(api, "updateNotebook")
      .mockResolvedValue({ ...testNotebook, title: "Updated Title", version: 2 });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Updated Title" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(testNotebook, { title: "Updated Title" }),
    );
  });

  it("saves updated title on save button click", async () => {
    const updateSpy = vi
      .spyOn(api, "updateNotebook")
      .mockResolvedValue({ ...testNotebook, title: "Saved Title", version: 2 });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Saved Title" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(testNotebook, { title: "Saved Title" }),
    );
  });

  it("does not call updateNotebook when title is unchanged", async () => {
    const updateSpy = vi.spyOn(api, "updateNotebook");
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("discards changes on Escape and restores original title", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Should not save" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: testNotebook.title })).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when close button is clicked", () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders font family select and color input in toolbar", () => {
    renderDialog();
    expect(screen.getByTitle("Шрифт")).toBeInTheDocument();
    expect(screen.getByTitle("Цвет текста")).toBeInTheDocument();
  });

  it("renders insert image button", () => {
    renderDialog();
    expect(screen.getByTitle("Вставить изображение")).toBeInTheDocument();
  });

  it("fires bold on toolbar button mousedown", () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByTitle("Жирный"));
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it("fires italic on toolbar button mousedown", () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByTitle("Курсив"));
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it("fires underline on toolbar button mousedown", () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByTitle("Подчёркнутый"));
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it("fires strikethrough on toolbar button mousedown", () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByTitle("Зачёркнутый"));
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it("fires H1 heading on toolbar button mousedown", () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByTitle("H1"));
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it("fires bullet list on toolbar button mousedown", () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByTitle("Маркированный список"));
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it("fires ordered list on toolbar button mousedown", () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByTitle("Нумерованный список"));
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it("fires blockquote on toolbar button mousedown", () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByTitle("Цитата"));
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it("changes font family via select", () => {
    renderDialog();
    const select = screen.getByTitle("Шрифт");
    fireEvent.change(select, { target: { value: "Georgia, serif" } });
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it("unsets font family when default option selected", () => {
    renderDialog();
    const select = screen.getByTitle("Шрифт");
    fireEvent.change(select, { target: { value: "" } });
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it("changes text color via color input", () => {
    renderDialog();
    const colorInput = screen.getByTitle("Цвет текста").querySelector("input[type='color']")!;
    fireEvent.change(colorInput, { target: { value: "#ff0000" } });
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it("opens image prompt and inserts image", () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("https://example.com/img.png");
    renderDialog();
    fireEvent.mouseDown(screen.getByTitle("Вставить изображение"));
    expect(promptSpy).toHaveBeenCalled();
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it("does nothing when image prompt is cancelled", () => {
    vi.spyOn(window, "prompt").mockReturnValue(null);
    mockEditor.chain.mockClear();
    renderDialog();
    fireEvent.mouseDown(screen.getByTitle("Вставить изображение"));
    // chain is not called when prompt returns null
    expect(mockEditor.chain).not.toHaveBeenCalled();
  });

  it("saves title on blur", async () => {
    const updateSpy = vi
      .spyOn(api, "updateNotebook")
      .mockResolvedValue({ ...testNotebook, title: "Blurred Title", version: 2 });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Blurred Title" } });
    fireEvent.blur(screen.getByRole("textbox"));
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(testNotebook, { title: "Blurred Title" }),
    );
  });

  it("auto-saves editor content after 800ms debounce", async () => {
    vi.useFakeTimers();
    const updateSpy = vi
      .spyOn(api, "updateNotebook")
      .mockResolvedValue({ ...testNotebook, content: "<p>new content</p>", version: 2 });
    renderDialog();
    mockEditor.getHTML.mockReturnValue("<p>new content</p>");
    onUpdateRef.current?.({ editor: mockEditor });
    vi.advanceTimersByTime(800);
    vi.useRealTimers();
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(testNotebook, { content: "<p>new content</p>" }),
    );
  });
});
