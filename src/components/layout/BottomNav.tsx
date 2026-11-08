/**
 * BottomNav — God Component Refactor Phase 4
 *
 * Mobile bottom navigation bar.
 * Presentational only - receives data via UIContext and props.
 * Auto-closes on navigation.
 */

import { memo } from 'react';
import { useUIContext } from '@/context';
import { navItems } from '@/config/navigation';
import { NavIcon } from './NavIcon';
import type { Screen, NavItem } from '@/types';

interface BottomNavProps {
  currentScreen: Screen;
  activeNav: NavItem;
  onNavigate: (screen: Screen, nav: NavItem) => void;
}

export const BottomNav = memo(function BottomNav({
  currentScreen,
  activeNav,
  onNavigate,
}: BottomNavProps) {
  const { isMobile, closeSidebarOnMobile } = useUIContext();

  // Don't render on desktop
  if (!isMobile) return null;

  const handleNavigate = (screen: Screen, nav: NavItem) => {
    onNavigate(screen, nav);
    closeSidebarOnMobile();
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-area-bottom"
      role="navigation"
      aria-label="Navegación principal"
    >
      <div className="grid grid-cols-7 gap-1 px-2 py-2">
        {navItems.map((item) => {
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.screen, item.id)}
              className={`relative flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'text-amber-600 bg-amber-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
            >
              <NavIcon icon={item.icon} active={isActive} size={24} />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});

BottomNav.displayName = 'BottomNav';

export default BottomNav;