/**
 * Test de integración de Sentry
 */

import { describe, it, expect, vi } from "vitest";
import * as Sentry from "@sentry/react";
import { captureError, log, setUserContext } from "@/lib/sentry";

// Mock Sentry para evitar errores en test
vi.mock("@sentry/react", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
}));

describe("Integración de Sentry", () => {
  it("debe exportar funciones correctamente", () => {
    expect(captureError).toBeDefined();
    expect(log).toBeDefined();
    expect(setUserContext).toBeDefined();
  });

  it("debe poder ejecutar funciones sin errores", () => {
    // Esto debería no lanzar errores aunque Sentry no esté configurado
    expect(() => {
      captureError(new Error("Test error"));
      log("info", "Test message");
      setUserContext("user_123");
    }).not.toThrow();
  });
});
