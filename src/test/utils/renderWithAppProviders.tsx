/**
 * Render helper for screens that consume the God Component Refactor contexts.
 *
 * Screens migrated to the new architecture no longer receive navigation and
 * reception state through props: they read it from ReceptionProvider /
 * CatalogosProvider / InventoryProvider / UIProvider. Tests for those screens
 * must mount the same provider stack that App.tsx mounts.
 *
 * useReceptionFlow calls useNavigate(), so a Router is required as well.
 */

import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReceptionProvider } from "@/context/ReceptionContext";
import { CatalogosProvider } from "@/context/CatalogosContext";
import { InventoryProvider } from "@/context/InventoryContext";
import { UIProvider } from "@/context/UIContext";
import type { ReceptionData } from "@/types";

interface RenderWithAppProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  /** Initial reception state seeded into ReceptionProvider. */
  initialReceptionState?: Record<string, unknown>;
  /** Reception payload seeded into ReceptionProvider as currentReception. */
  currentReception?: ReceptionData | null;
  /** Edit reception data for EditarRecepcion screen. */
  editReceptionData?: ReceptionData | null;
  /** Whether CatalogosProvider is allowed to query Firestore. */
  canQuery?: boolean;
  /** Initial router entry. */
  initialEntries?: string[];
}

function buildInitialState(options: RenderWithAppProvidersOptions) {
  const { currentReception, initialReceptionState, editReceptionData } = options;
  return {
    ...(currentReception ? { currentReception } : {}),
    ...(initialReceptionState ?? {}),
    ...(editReceptionData ? { editReceptionData } : {}),
  };
}

export function renderWithAppProviders(
  ui: ReactElement,
  options: RenderWithAppProvidersOptions = {},
): RenderResult {
  const { canQuery = false, initialEntries = ["/"], ...renderOptions } = options;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>
      <ReceptionProvider initialState={buildInitialState(options)}>
        <CatalogosProvider canQuery={canQuery}>
          <InventoryProvider>
            <UIProvider>{children}</UIProvider>
          </InventoryProvider>
        </CatalogosProvider>
      </ReceptionProvider>
    </MemoryRouter>
  );

  return render(ui, { wrapper, ...renderOptions });
}
