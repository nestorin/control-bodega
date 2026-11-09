/**
 * Layout — God Component Refactor Phase 4
 *
 * Root layout wrapper that composes Sidebar, Header, and BottomNav.
 * Receives children (page content) and renders the app shell.
 */

import { memo } from "react";
import { useUIContext } from "@/context";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import type { Screen, NavItem, HeaderConfig } from "@/types";

interface LayoutProps {
  children: React.ReactNode;
  currentScreen: Screen;
  activeNav: NavItem;
  headerConfig: HeaderConfig;
  onNavigate: (screen: Screen, nav: NavItem) => void;
  onBack?: () => void;
}

export const Layout = memo(function Layout({
  children,
  currentScreen,
  activeNav,
  headerConfig,
  onNavigate,
  onBack,
}: LayoutProps) {
  const { isMobile, sidebarOpen, setSidebarOpen } = useUIContext();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar (desktop only) */}
      <Sidebar currentScreen={currentScreen} activeNav={activeNav} onNavigate={onNavigate} />

      {/* Header */}
      <Header headerConfig={headerConfig} onBack={onBack} />

      {/* Main content area */}
      <main
        className={`pt-16 pb-20 px-4 transition-all duration-200 ${isMobile ? "pl-4" : "pl-20"}`}
        role="main"
      >
        {children}
      </main>

      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Bottom navigation (mobile only) */}
      <BottomNav currentScreen={currentScreen} activeNav={activeNav} onNavigate={onNavigate} />
    </div>
  );
});

Layout.displayName = "Layout";

export default Layout;
