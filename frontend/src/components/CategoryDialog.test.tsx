import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n";
import { api } from "../api/client";
import { personalCategory } from "../test/fixtures";
import { renderWithClient } from "../test/render";
import { CategoryDialog } from "./CategoryDialog";

describe("category creation dialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru");
  });

  afterEach(() => vi.restoreAllMocks());

  it("creates a trimmed category and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.spyOn(api, "createCategory").mockResolvedValue(personalCategory);
    renderWithClient(<CategoryDialog open onOpenChange={onOpenChange} onError={vi.fn()} />);
    await user.type(screen.getByRole("textbox", { name: "Категория" }), "  Books  ");
    await user.click(screen.getByRole("button", { name: "Создать" }));
    await waitFor(() => expect(api.createCategory).toHaveBeenCalledWith("Books"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ignores empty submission, cancels, and forwards mutation errors", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onError = vi.fn();
    vi.spyOn(api, "createCategory").mockRejectedValue(new Error("failed"));
    renderWithClient(<CategoryDialog open onOpenChange={onOpenChange} onError={onError} />);
    const form = screen.getByRole("textbox", { name: "Категория" }).closest("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(api.createCategory).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: "Категория" }), "Later");
    await user.click(screen.getByRole("button", { name: "Создать" }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
