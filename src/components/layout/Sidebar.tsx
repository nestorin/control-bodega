/**
 * Sidebar — God Component Refactor Phase 4
 *
 * Desktop sidebar navigation component.
 * Presentational only - receives data via UIContext and props.
 */

import { memo } from "react";
import { useUIContext } from "@/context";
import { navItems } from "@/config/navigation";
import { NavIcon } from "./NavIcon";
import type { Screen, NavItem } from "@/types";

interface SidebarProps {
  currentScreen: Screen;
  activeNav: NavItem;
  onNavigate: (screen: Screen, nav: NavItem) => void;
}

export const Sidebar = memo(function Sidebar({
  currentScreen,
  activeNav,
  onNavigate,
}: SidebarProps) {
  const { isMobile } = useUIContext();

  // Don't render on mobile
  if (isMobile) return null;

  return (
    <aside
      className="fixed top-0 left-0 z-40 h-full w-16 bg-white border-r border-gray-200 flex flex-col items-center pt-6 gap-4"
      role="navigation"
      aria-label="Navegación principal"
    >
      {navItems.map((item) => {
        const isActive = activeNav === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.screen, item.id)}
            className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 ${
              isActive ? "bg-amber-50 scale-110" : "hover:bg-gray-50"
            }`}
            aria-current={isActive ? "page" : undefined}
            aria-label={item.label}
          >
            <NavIcon icon={item.icon} active={isActive} size={24} />
            {isActive && (
              <span className="absolute -right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-amber-500 rounded-full" />
            )}
          </button>
        );
      })}
    </aside>
  );
});

Sidebar.displayName = "Sidebar";

export default Sidebar;
