/**
 * Tests for TouchTarget component
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TouchTarget } from "@/components/ui/TouchTarget";
import { renderHook, act } from "@testing-library/react";

describe("TouchTarget component", () => {
  it("renders as button by default", () => {
    render(<TouchTarget>Click me</TouchTarget>);
    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe("BUTTON");
  });

  it("renders as anchor when as='a' and href provided", () => {
    render(
      <TouchTarget as="a" href="/test">
        Link
      </TouchTarget>,
    );
    const link = screen.getByRole("link", { name: "Link" });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/test");
  });

  it("renders as div when as='div'", () => {
    render(<TouchTarget as="div">Div content</TouchTarget>);
    const div = screen.getByText("Div content").parentElement;
    expect(div).toBeInTheDocument();
    expect(div?.tagName).toBe("DIV");
  });

  it("applies custom className", () => {
    render(<TouchTarget className="custom-class">Button</TouchTarget>);
    const button = screen.getByRole("button", { name: "Button" });
    expect(button).toHaveClass("custom-class");
  });

  it("applies base styles for touch targets", () => {
    render(<TouchTarget>Button</TouchTarget>);
    const button = screen.getByRole("button", { name: "Button" });
    expect(button).toHaveClass("min-h-[48px]");
    expect(button).toHaveClass("min-w-[48px]");
    expect(button).toHaveClass("touch-manipulation");
    expect(button).toHaveClass("focus-visible:ring-2");
    expect(button).toHaveClass("active:scale-[0.98]");
  });

  it("forwards ref correctly", () => {
    const ref = vi.fn();
    render(<TouchTarget ref={ref}>Button</TouchTarget>);
    const button = screen.getByRole("button", { name: "Button" });
    expect(ref).toHaveBeenCalledWith(button);
  });

  it("passes through additional props to button", () => {
    render(
      <TouchTarget disabled aria-label="Test">
        Button
      </TouchTarget>,
    );
    // An explicit aria-label is the accessible-name contract and intentionally
    // takes precedence over the visible child text.
    const button = screen.getByRole("button", { name: "Test" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-label", "Test");
  });

  it("passes through additional props to anchor", () => {
    render(
      <TouchTarget as="a" href="/test" target="_blank">
        Link
      </TouchTarget>,
    );
    const link = screen.getByRole("link", { name: "Link" });
    expect(link).toHaveAttribute("target", "_blank");
  });
});
