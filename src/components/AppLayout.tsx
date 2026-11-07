/**
 * AppLayout — Connected Layout Wrapper (God Component Refactor Phase 7)
 *
 * Connects the presentational Layout component to the new architecture contexts.
 * Provides currentScreen, activeNav, headerConfig, onNavigate from ReceptionContext/UIContext.
 * Renders the appropriate screen based on currentScreen.
 */

import React, { Suspense, lazy } from 'react';
import { useReceptionFlow } from '@/hooks/useReceptionFlow';
import { useUIContext } from '@/context';
import { Layout } from '@/components/layout';
import type { Screen } from '@/types';

// Screen components (lazy-loaded for code splitting)
const Home = lazy(() => import('../screens/Home'));
const Recepciones = lazy(() => import('../screens/Recepciones'));
const ProgramacionRecepcion = lazy(() => import('../screens/ProgramacionRecepcion'));
const NuevaRecepcionStep1 = lazy(() => import('../screens/NuevaRecepcionStep1'));
const NuevaRecepcionStep2 = lazy(() => import('../screens/NuevaRecepcionStep2'));
const CapturaEvidencia = lazy(() => import('../screens/CapturaEvidencia'));
const CapturaTarima = lazy(() => import('../screens/CapturaTarima'));
const TarimaDetalle = lazy(() => import('../screens/TarimaDetalle'));
const RecepcionCompletada = lazy(() => import('../screens/RecepcionCompletada'));
const EditarRecepcion = lazy(() => import('../screens/EditarRecepcion'));
const Evidencias = lazy(() => import('../screens/Evidencias'));
const EvidenciaDetalle = lazy(() => import('../screens/EvidenciaDetalle'));
const LotesCaducidades = lazy(() => import('../screens/LotesCaducidades'));
const Embarques = lazy(() => import('../screens/Embarques'));
const Configuracion = lazy(() => import('../screens/Configuracion'));
const ImpresionEtiquetas = lazy(() => import('../screens/ImpresionEtiquetas'));
const EscanearQR = lazy(() => import('../screens/EscanearQR'));

function AppLayout() {
  const {
    currentScreen,
    activeNav,
    navigate,
    currentReception,
    tarimaActual,
  } = useReceptionFlow();

  const { header } = useUIContext();

  // Render current screen
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
        return <Home />;
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

export default AppLayout;