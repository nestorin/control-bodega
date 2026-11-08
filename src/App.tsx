/**
 * App — Main Entry Point (God Component Refactor Phase 7)
 *
 * Uses new architecture providers + Layout component.
 * All screens consume contexts/hooks directly.
 * Target: < 200 lines for the main App component.
 */

import React, { Suspense, lazy, ComponentType } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/layout';
import { ReceptionProvider } from '@/context/ReceptionContext';
import { CatalogosProvider } from '@/context/CatalogosContext';
import { InventoryProvider } from '@/context/InventoryContext';
import { UIProvider } from '@/context/UIContext';
import { useReceptionFlow } from '@/hooks/useReceptionFlow';
import { useUIContext } from '@/context';
import type { Screen } from '@/types';

// Screen components (lazy-loaded for code splitting)
// Cast to ComponentType<any> to allow flexible props during migration
const Login = lazy(() => import('./screens/Login')) as ComponentType<any>;
const Unauthorized = lazy(() => import('./screens/Unauthorized')) as ComponentType<any>;
const Home = lazy(() => import('./screens/Home')) as ComponentType<any>;
const Recepciones = lazy(() => import('./screens/Recepciones')) as ComponentType<any>;
const ProgramacionRecepcion = lazy(() => import('./screens/ProgramacionRecepcion')) as ComponentType<any>;
const NuevaRecepcionStep1 = lazy(() => import('./screens/NuevaRecepcionStep1')) as ComponentType<any>;
const NuevaRecepcionStep2 = lazy(() => import('./screens/NuevaRecepcionStep2')) as ComponentType<any>;
const CapturaEvidencia = lazy(() => import('./screens/CapturaEvidencia')) as ComponentType<any>;
const CapturaTarima = lazy(() => import('./screens/CapturaTarima')) as ComponentType<any>;
const TarimaDetalle = lazy(() => import('./screens/TarimaDetalle')) as ComponentType<any>;
const RecepcionCompletada = lazy(() => import('./screens/RecepcionCompletada')) as ComponentType<any>;
const EditarRecepcion = lazy(() => import('./screens/EditarRecepcion')) as ComponentType<any>;
const Evidencias = lazy(() => import('./screens/Evidencias')) as ComponentType<any>;
const EvidenciaDetalle = lazy(() => import('./screens/EvidenciaDetalle')) as ComponentType<any>;
const LotesCaducidades = lazy(() => import('./screens/LotesCaducidades')) as ComponentType<any>;
const Embarques = lazy(() => import('./screens/Embarques')) as ComponentType<any>;
const Configuracion = lazy(() => import('./screens/Configuracion')) as ComponentType<any>;
const ImpresionEtiquetas = lazy(() => import('./screens/ImpresionEtiquetas')) as ComponentType<any>;
const EscanearQR = lazy(() => import('./screens/EscanearQR')) as ComponentType<any>;

// Connected Layout wrapper that provides screen routing
function AppLayout() {
  const {
    currentScreen,
    activeNav,
    navigate,
  } = useReceptionFlow();

  const { header } = useUIContext();

  // Render current screen - screens now consume hooks directly
  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <Home onNewReception={() => navigate('programacion-recepcion')} onRecepciones={() => navigate('recepciones')} onEscanearQr={() => navigate('escanear-qr')} />;
      case 'programacion-recepcion':
        return <ProgramacionRecepcion />;
      case 'captura-evidencia':
        return <CapturaEvidencia />;
      case 'nueva-step1':
        return <NuevaRecepcionStep1 />;
      case 'nueva-step2':
        return <NuevaRecepcionStep2 />;
      case 'captura-tarima':
        return <CapturaTarima />;
      case 'completada':
        return <RecepcionCompletada />;
      case 'recepciones':
        return <Recepciones />;
      case 'tarima-detalle':
        return <TarimaDetalle />;
      case 'impresion':
        return <ImpresionEtiquetas />;
      case 'escanear-qr':
        return <EscanearQR />;
      case 'editar-recepcion':
        return <EditarRecepcion />;
      case 'evidencias':
        return <Evidencias />;
      case 'evidencia-detalle':
        return <EvidenciaDetalle />;
      case 'lotes-caducidades':
        return <LotesCaducidades />;
      case 'embarques':
        return <Embarques />;
      case 'configuracion':
        return <Configuracion />;
      default:
        return <Home onNewReception={() => navigate('programacion-recepcion')} onRecepciones={() => navigate('recepciones')} onEscanearQr={() => navigate('escanear-qr')} />;
    }
  };

  return (
    <Layout
      currentScreen={currentScreen}
      activeNav={activeNav}
      headerConfig={header ?? { title: '', subtitle: '' }}
      onNavigate={navigate}
    >
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Cargando pantalla…</div>}>
        {renderScreen()}
      </Suspense>
    </Layout>
  );
}

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