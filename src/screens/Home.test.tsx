import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "./Home";

describe("Home dashboard presentation", () => {
  it("keeps dashboard actions wired to the screen callbacks", () => {
    const onNewReception = vi.fn();
    const onRecepciones = vi.fn();
    const onEscanearQr = vi.fn();

    render(
      <Home
        onNewReception={onNewReception}
        onRecepciones={onRecepciones}
        onEscanearQr={onEscanearQr}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Nueva recepción" }));
    expect(onNewReception).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Programar recepción/ }));
    expect(onNewReception).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: /Recepciones/ }));
    expect(onRecepciones).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Escanear QR/ }));
    expect(onEscanearQr).toHaveBeenCalledTimes(1);
  });

  it("preserves responsive classes and dashboard content", () => {
    const { container } = render(
      <Home onNewReception={vi.fn()} onRecepciones={vi.fn()} onEscanearQr={vi.fn()} />,
    );

    expect(screen.getByText("Recepción sin vueltas")).toBeInTheDocument();
    expect(screen.getByText("Resumen de hoy")).toBeInTheDocument();
    expect(screen.getByText("Operación estable")).toBeInTheDocument();
    expect(container.querySelector(".sm\\:grid-cols-2")).toBeInTheDocument();
    expect(container.querySelector(".lg\\:grid-cols-2")).toBeInTheDocument();
  });
});
