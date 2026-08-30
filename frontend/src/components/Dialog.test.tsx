import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import "../i18n";
import { Dialog } from "./Dialog";

function Harness({ description = true }: { description?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Accessible dialog"
      description={description ? "Dialog description" : undefined}
      wide
    >
      <button>Inside action</button>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("renders an accessible, focus-trapped modal and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("dialog", { name: "Accessible dialog" })).toBeInTheDocument();
    expect(screen.getByText("Dialog description")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Закрыть" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("supports a title-only compact dialog and close button", async () => {
    const user = userEvent.setup();
    render(<Harness description={false} />);
    expect(screen.queryByText("Dialog description")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
