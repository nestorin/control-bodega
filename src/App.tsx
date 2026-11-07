/**
 * App — Main Entry Point (God Component Refactor Phase 7)
 *
 * Uses new architecture providers + legacy AppLayout for backward compatibility.
 * New screens use contexts/hooks directly; legacy screens work via AppLayout.
 * Target: < 200 lines for the main App component.
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ReceptionProvider } from '@/context/ReceptionContext';
import { CatalogosProvider } from '@/context/CatalogosContext';
import { InventoryProvider } from '@/context/InventoryContext';
import { UIProvider } from '@/context/UIContext';
import AppLayout from '@/components/AppLayout';

// Screen components (lazy-loaded for code splitting)
const Login = lazy(() => import('./screens/Login'));
const Unauthorized = lazy(() => import('./screens/Unauthorized'));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ReceptionProvider>
          <CatalogosProvider canQuery={true}>
            <InventoryProvider>
              <UIProvider>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/unauthorized" element={<Unauthorized />} />
                  <Route
                    path="/*"
                    element={
                      <ProtectedRoute>
                        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Cargando pantalla…</div>}>
                          <AppLayout />
                        </Suspense>
                      </ProtectedRoute>
                    }
                  />
                </Routes>
              </UIProvider>
            </InventoryProvider>
          </CatalogosProvider>
        </ReceptionProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}