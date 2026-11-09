/**
 * Header — God Component Refactor Phase 4
 *
 * Top header with context-aware title, subtitle, and actions.
 * Presentational only - receives data via UIContext and props.
 */

import { memo } from "react";
import { useUIContext } from "@/context";
import type { HeaderConfig } from "@/types";

interface HeaderProps {
  headerConfig: HeaderConfig;
  onBack?: () => void;
  children?: React.ReactNode;
}

export const Header = memo(function Header({ headerConfig, onBack, children }: HeaderProps) {
  const { isMobile } = useUIContext();

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-30 h-16 bg-white border-b border-gray-200 flex items-center px-4 ${
        isMobile ? "pl-12" : "pl-20"
      }`}
      role="banner"
    >
      {/* Back button (mobile only) */}
      {isMobile && onBack && (
        <button
          onClick={onBack}
          className="mr-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Volver"
        >
          <svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Title area */}
      <div className="flex-1 min-w-0">
        {headerConfig.subtitle && (
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider truncate">
            {headerConfig.subtitle}
          </p>
        )}
        <h1 className="text-lg font-semibold text-gray-900 truncate">{headerConfig.title}</h1>
      </div>

      {/* Actions / custom children */}
      {headerConfig.actions && (
        <div className="flex items-center gap-2 ml-4">{headerConfig.actions}</div>
      )}

      {children && <div className="flex items-center gap-2 ml-4">{children}</div>}
    </header>
  );
});

Header.displayName = "Header";

export default Header;
