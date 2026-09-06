import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { renderWithClient } from "../test/render";
import { ShoppingDialog } from "./ShoppingDialog";

describe("ShoppingDialog", () => {
  beforeEach(() => {
    vi.spyOn(api, "shoppingList").mockResolvedValue({ data: { aldi: "milk\neggs" } });
    vi.spyOn(api, "updateShoppingList").mockResolvedValue({ data: {} });
  });

  afterEach(() => vi.restoreAllMocks());

  it("does not render when closed", () => {
    renderWithClient(<ShoppingDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the grid when open", async () => {
    renderWithClient(<ShoppingDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Aldi/)).toBeInTheDocument();
    expect(screen.getByText(/Mercadona/)).toBeInTheDocument();
    expect(screen.getByText(/Amazon/)).toBeInTheDocument();
    expect(screen.getByText(/Косметика/)).toBeInTheDocument();
  });

  it("shows 12 text inputs in the grid", async () => {
    renderWithClient(<ShoppingDialog open={true} onOpenChange={vi.fn()} />);
    await screen.findByRole("dialog");
    const textareas = screen.getAllByRole("textbox").filter((el) => el.tagName === "TEXTAREA");
    expect(textareas).toHaveLength(12);
  });

  it("calls close handler when X button is clicked", async () => {
    const onClose = vi.fn();
    renderWithClient(<ShoppingDialog open={true} onOpenChange={onClose} />);
    const closeBtn = screen.getByRole("button", { name: "Закрыть" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("closes when clicking the overlay backdrop", () => {
    const onClose = vi.fn();
    const { container } = renderWithClient(<ShoppingDialog open={true} onOpenChange={onClose} />);
    const overlay = container.querySelector(".shopping-overlay")!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("debounces and calls updateShoppingList after 800ms", async () => {
    const saveSpy = vi.spyOn(api, "updateShoppingList").mockResolvedValue({ data: {} });
    renderWithClient(<ShoppingDialog open={true} onOpenChange={vi.fn()} />);
    const inputs = await screen.findAllByRole("textbox");
    const firstTextarea = inputs.find(
      (el) => el.tagName === "TEXTAREA" && !(el as HTMLInputElement).placeholder?.includes("Название"),
    )!;

    vi.useFakeTimers();
    try {
      fireEvent.change(firstTextarea, { target: { value: "bread" } });
      expect(saveSpy).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(900); });
      expect(saveSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
