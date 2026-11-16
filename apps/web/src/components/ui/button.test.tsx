import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

describe("Button component", () => {
  it("renders with default props and text content", () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeDefined();
    expect(button.textContent).toBe("Click me");
    expect(button.getAttribute("data-slot")).toBe("button");
  });

  it("applies variant classes correctly", () => {
    const { rerender } = render(<Button variant="destructive">Delete</Button>);
    let button = screen.getByRole("button", { name: "Delete" });
    expect(button.className).toContain("text-destructive");

    rerender(<Button variant="outline">Outline</Button>);
    button = screen.getByRole("button", { name: "Outline" });
    expect(button.className).toContain("border-border");

    rerender(<Button variant="ghost">Ghost</Button>);
    button = screen.getByRole("button", { name: "Ghost" });
    expect(button.className).toContain("hover:bg-muted");
  });

  it("handles user click events", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Submit</Button>);

    const button = screen.getByRole("button", { name: "Submit" });
    await user.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire click events when disabled", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Disabled</Button>);

    const button = screen.getByRole("button", { name: "Disabled" });
    expect(button.hasAttribute("disabled")).toBe(true);
    await user.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });
});
