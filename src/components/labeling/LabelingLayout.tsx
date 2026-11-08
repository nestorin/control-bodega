/**
 * LabelingLayout — Layout principal para las pantallas de Etiquetado
 *
 * Wraps all labeling screens with common UI: sidebar, header, bottom nav.
 * Uses LabelingUIContext for responsive state (mobile/desktop, sidebar open).
 */

import { ReactNode, useContext } from "react";
import { LabelingUIProvider, useLabelingUIContext } from "@/context/LabelingUIContext";
import { LabelingSidebar } from "./LabelingSidebar";
import { LabelingHeader } from "./LabelingHeader";
import { LabelingBottomNav } from "./LabelingBottomNav";

interface LabelingLayoutProps {
  children: ReactNode;
}

/**
 * Internal component that consumes the UI context and renders the layout.
 * Separated to avoid "useContext must be used within a Provider" at module level.
 */
function LabelingLayoutInner({ children }: LabelingLayoutProps) {
  const { isMobile, sidebarOpen, setSidebarOpen, toggleSidebar } = useLabelingUIContext();

  return (
    <div className="labeling-layout min-h-screen bg-gray-50">
      {/* Sidebar - only on desktop or when open on mobile */}
      <LabelingSidebar
        isOpen={!isMobile || sidebarOpen}
        onClose={() => (!isMobile ? undefined : setSidebarOpen(false))}
      />

      {/* Main content area */}
      <div className={`labeling-main transition-all duration-300 ${isMobile ? "" : "lg:ml-64"}`}>
        {/* Header - always visible */}
        <LabelingHeader onMenuClick={() => (!isMobile ? undefined : toggleSidebar())} />

        {/* Content */}
        <main className="labeling-content p-4 lg:p-6">{children}</main>
      </div>

      {/* Bottom navigation - mobile only */}
      <LabelingBottomNav />
    </div>
  );
}

/**
 * Public LabelingLayout component that provides the UI context.
 * Screens should wrap their content with this.
 */
export function LabelingLayout({ children }: LabelingLayoutProps) {
  return (
    <LabelingUIProvider>
      <LabelingLayoutInner>{children}</LabelingLayoutInner>
    </LabelingUIProvider>
  );
}

export default LabelingLayout;
