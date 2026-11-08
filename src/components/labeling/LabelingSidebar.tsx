/**
 * LabelingSidebar — Sidebar navigation for Labeling Module
 *
 * Displays the 5 labeling screens as navigation items.
 * Uses LabelingUIContext for active screen and sidebar state.
 */

import { useContext, useMemo, memo } from "react";
import { useLabelingUIContext } from "@/context/LabelingUIContext";
import type { LabelingScreen } from "@/context/LabelingUIContext";

interface LabelingSidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

const navItems: { id: LabelingScreen; label: string; icon: React.ReactNode }[] = [
  {
    id: "nueva",
    label: "Nueva",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    id: "entregar",
    label: "Entregar",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
        />
      </svg>
    ),
  },
  {
    id: "recibir",
    label: "Recibir",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
        />
      </svg>
    ),
  },
  {
    id: "conciliar",
    label: "Conciliar",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
];

function LabelingSidebarInner({ isOpen, onClose }: { isOpen: boolean; onClose?: () => void }) {
  const { currentScreen, setCurrentScreen, isMobile } = useLabelingUIContext();

  if (!isOpen && isMobile) {
    return null;
  }

  const sidebarClass = `labeling-sidebar fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 transition-transform duration-300 z-40 lg:translate-x-0 ${
    isMobile ? (isOpen ? "translate-x-0" : "-translate-x-full") : "translate-x-0"
  }`;

  const overlayClass = `labeling-sidebar-overlay fixed inset-0 bg-black bg-opacity-50 z-30 transition-opacity duration-300 ${
    isMobile && isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
  }`;

  return (
    <>
      {isMobile && <div className={overlayClass} onClick={onClose} aria-hidden="true" />}
      <aside className={sidebarClass} aria-label="Navegación Etiquetado">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Etiquetado</h2>
            <p className="text-sm text-gray-500 mt-1">Control de Bodega</p>
          </div>

          {/* Navigation */}
          <nav
            className="flex-1 p-3 space-y-1 overflow-y-auto"
            aria-label="Pantallas de Etiquetado"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentScreen(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  item.id === currentScreen
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
                aria-current={item.id === currentScreen ? "page" : undefined}
              >
                <span className="flex-shrink-0 text-gray-400">{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">v1.4.0 · Módulo Etiquetado</p>
          </div>
        </div>
      </aside>
    </>
  );
}

const LabelingSidebar = memo(function LabelingSidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose?: () => void;
}) {
  return <LabelingSidebarInner isOpen={isOpen} onClose={onClose} />;
});

export { LabelingSidebar };
export default LabelingSidebar;
