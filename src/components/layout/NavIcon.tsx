/**
 * NavIcon — God Component Refactor Phase 4
 *
 * Reusable navigation icon component for sidebar and bottom nav.
 * Presentational only - receives icon ID, active state, and size.
 */

import { memo } from 'react';
import { renderNavIcon } from '@/config/navigation';
import type { NavItem } from '@/types';

interface NavIconProps {
  icon: NavItem;
  active?: boolean;
  size?: number;
}

export const NavIcon = memo(function NavIcon({ icon, active = false, size = 22 }: NavIconProps) {
  return <>{renderNavIcon(icon, active, size)}</>;
});

NavIcon.displayName = 'NavIcon';

export default NavIcon;