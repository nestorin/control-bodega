/**
 * LabelingHeader — Header bar for Labeling Module screens
 *
 * Shows title, subtitle, optional back button, and actions.
 * Uses LabelingUIContext for header configuration.
 */

import { ReactNode, useContext, useCallback, memo } from "react";
import { useLabelingUIContext } from "@/context/LabelingUIContext";
import type { LabelingScreen } from "@/context/LabelingUIContext";

interface LabelingHeaderProps {
  onMenuClick?: () => void;
}

function LabelingHeaderInner({ onMenuClick }: LabelingHeaderProps) {
  const { headerConfig, setCurrentScreen, isMobile, sidebarOpen, toggleSidebar } =
    useLabelingUIContext();
  const { title, subtitle, actions, showBackButton, onBack } = headerConfig;

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      // Default: go back to dashboard
      setCurrentScreen("dashboard");
    }
  }, [onBack, setCurrentScreen]);

  const handleMenuClick = useCallback(() => {
    if (onMenuClick) {
      onMenuClick();
    } else if (isMobile) {
      toggleSidebar();
    }
  }, [onMenuClick, isMobile, toggleSidebar]);

  return (
    <header className="labeling-header sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Menu / Back button */}
        {isMobile && (
          <button
            onClick={showBackButton ? handleBack : handleMenuClick}
            className="flex items-center justify-center w-10 h-10 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label={showBackButton ? "Volver" : "Menú"}
            aria-expanded={sidebarOpen}
          >
            {showBackButton ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        )}

        {/* Title area */}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 truncate">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
        </div>

        {/* Actions */}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export const LabelingHeader = memo(function LabelingHeader({
  onMenuClick,
}: {
  onMenuClick?: () => void;
}) {
  return <LabelingHeaderInner onMenuClick={onMenuClick} />;
});

export default LabelingHeader;
