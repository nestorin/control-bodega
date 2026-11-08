/**
 * LabelingBottomNav — Bottom navigation for mobile
 *
 * Shows the 5 labeling screens as bottom tabs on mobile only.
 * Hidden on desktop (lg:hidden).
 */

import { useCallback, memo } from "react";
import { useLabelingUIContext } from "@/context/LabelingUIContext";
import type { LabelingScreen } from "@/context/LabelingUIContext";

const navItems: { id: LabelingScreen; label: string; icon: React.ReactNode }[] = [
  {
    id: "nueva",
    label: "Nueva",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    id: "entregar",
    label: "Entregar",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

function LabelingBottomNavInner() {
  const { currentScreen, setCurrentScreen, isMobile } = useLabelingUIContext();

  if (!isMobile) {
    return null;
  }

  return (
    <nav
      className="labeling-bottom-nav fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 lg:hidden"
      aria-label="Navegación principal Etiquetado"
    >
      <div className="grid grid-cols-5 gap-0">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentScreen(item.id)}
            className={`flex flex-col items-center justify-center gap-1 px-2 py-2.5 transition-colors ${
              item.id === currentScreen ? "text-blue-700" : "text-gray-500 hover:text-gray-700"
            }`}
            aria-current={item.id === currentScreen ? "page" : undefined}
            aria-label={item.label}
          >
            <span
              className={`flex-shrink-0 text-xl ${item.id === currentScreen ? "text-blue-700" : "text-gray-400"}`}
            >
              {item.icon}
            </span>
            <span
              className={`text-xs font-medium truncate w-16 ${item.id === currentScreen ? "text-blue-700" : "text-gray-500"}`}
            >
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export const LabelingBottomNav = memo(function LabelingBottomNav() {
  return <LabelingBottomNavInner />;
});

export default LabelingBottomNav;
