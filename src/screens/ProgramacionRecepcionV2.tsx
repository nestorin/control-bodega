/**
 * ProgramacionRecepcion - Nueva versión refactorizada
 *
 * Usa: useReceptionProgramming hook (dominio + Firebase)
 * Componentes UI separados por paso
 *
 * Antes: ~1786 líneas en un solo archivo
 * Ahora: ~200 líneas + componentes modulares
 */

import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useReceptionProgramming } from "@/domains/reception";
import type { Producto } from "@/services/firestore/types";

// Componentes por paso (lazy loaded para code splitting)
const SelectHasOC = lazy(() => import("./ProgramacionRecepcion/SelectHasOC"));
const UploadFile = lazy(() => import("./ProgramacionRecepcion/UploadFile"));
const OcrResults = lazy(() => import("./ProgramacionRecepcion/OcrResults"));
const MatchProducts = lazy(() => import("./ProgramacionRecepcion/MatchProducts"));
const CalculateConversions = lazy(() => import("./ProgramacionRecepcion/CalculateConversions"));
const ReviewStep = lazy(() => import("./ProgramacionRecepcion/ReviewStep"));
const CompleteStep = lazy(() => import("./ProgramacionRecepcion/CompleteStep"));

import { Suspense } from "react";
import { lazy } from "react";
import { ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

const { useState, useCallback, useEffect, Fragment } = require("react");

function StepIndicator({
  steps,
  currentStep,
  completedSteps,
}: {
  steps: any[];
  currentStep: string;
  completedSteps: string[];
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-4 px-2">
      {steps.map((step, idx) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = step.id === currentStep;
        return (
          <Fragment key={step.id}>
            <div className="flex flex-col items-center min-w-[80px]">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  isCompleted
                    ? "bg-[#16343f] text-white"
                    : isCurrent
                      ? "bg-[#16343f] text-white ring-2 ring-offset-2 ring-[#16343f]"
                      : "bg-[#dce4e7] text-[#607078]"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <span className="text-sm font-bold">{idx + 1}</span>
                )}
              </div>
              <span
                className={`text-[11px] mt-1 text-center font-medium ${
                  isCompleted || isCurrent ? "text-[#16343f]" : "text-[#607078]"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-1.5 mx-1 transition-colors ${
                  isCompleted ? "bg-[#16343f]" : "bg-[#dce4e7]"
                }`}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="bg-[#fee2e2] border border-[#fca5a5] flex gap-3 items-start p-4 rounded-[12px]">
      <AlertCircle className="text-[#ef4444] text-[20px] shrink-0 mt-0.5" />
      <p className="text-[#991b1b] text-sm flex-1">{message}</p>
      <button
        onClick={onDismiss}
        className="text-[#991b1b] hover:text-[#ef4444] p-1"
        aria-label="Cerrar"
      >
        ✕
      </button>
    </div>
  );
}

function LegacyProgramacionRecepcionV2() {
  const { profile } = useAuth();
  const catalogos: {
    productos: Producto[];
    almacenes: never[];
    proveedores: never[];
  } = { productos: [], almacenes: [], proveedores: [] };
  const catalogProducts = useMemo(() => catalogos?.productos ?? [], [catalogos?.productos]);

  const {
    state,
    currentStep,
    steps,
    matchedProducts,
    conversions,
    tarimasTotal,
    selectHasOC,
    handleFileUpload,
    runOCR,
    matchProducts,
    calculateConversionsAndStickers,
    updateMatchedProduct,
    setWarehouseId,
    setSupplierId,
    nextStep,
    prevStep,
    goToStep,
    saveReception,
    reset,
    ocrLoading,
    ocrError,
  } = useReceptionProgramming(catalogProducts);

  const completedSteps = useMemo(() => {
    const currentIndex = steps.findIndex((s) => s.id === currentStep);
    return steps.slice(0, currentIndex).map((s) => s.id);
  }, [steps, currentStep]);

  const handleSelectHasOC = useCallback(
    (hasOC: boolean) => {
      selectHasOC(hasOC);
    },
    [selectHasOC],
  );

  const handleRunOCR = useCallback(async () => {
    await runOCR();
    // Auto-match después de OCR
    if (catalogProducts.length > 0) {
      matchProducts(catalogProducts);
    }
  }, [runOCR, catalogProducts, matchProducts]);

  const handleNext = useCallback(() => {
    // Validaciones por paso antes de avanzar
    if (currentStep === "match-products" && matchedProducts.length === 0) {
      return;
    }
    if (currentStep === "calculate-conversions" && conversions.length === 0) {
      return;
    }
    nextStep();
  }, [currentStep, matchedProducts.length, conversions.length, nextStep]);

  const handleSave = useCallback(async () => {
    try {
      const receptionId = await saveReception();
      if (receptionId) {
        console.log("Recepción creada:", receptionId);
      }
    } catch (err) {
      console.error("Error guardando:", err);
    }
  }, [saveReception]);

  const StepComponent = useMemo(() => {
    switch (currentStep) {
      case "select-has-oc":
        return SelectHasOC;
      case "upload-file":
        return UploadFile;
      case "ocr-results":
        return OcrResults;
      case "match-products":
        return MatchProducts;
      case "calculate-conversions":
        return CalculateConversions;
      case "review":
        return ReviewStep;
      case "complete":
        return CompleteStep;
      default:
        return SelectHasOC;
    }
  }, [currentStep]);

  return (
    <div className="min-h-screen bg-[#f5f8fa]">
      <header className="bg-white border-b border-[#dce4e7] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={reset}
                className="p-2 rounded-lg hover:bg-[#f0f4f5] text-[#607078] transition-colors"
                aria-label="Reiniciar"
              >
                <Loader2 className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold text-[#16343f]">Programación de Recepción</h1>
            </div>
            <div className="flex items-center gap-4 text-sm text-[#607078]">
              <span>Almacén: {profile?.warehouseId ?? "—"}</span>
              <span className="px-2 py-1 bg-[#e7f0f2] rounded-full text-[#16343f]">
                {profile?.role ?? "OPERATOR"}
              </span>
            </div>
          </div>
          <StepIndicator steps={steps} currentStep={currentStep} completedSteps={completedSteps} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {state.error && <ErrorBanner message={state.error} onDismiss={() => {}} />}

        <div className="bg-white rounded-[16px] shadow-sm border border-[#dce4e7]">
          <Suspense
            fallback={<div className="p-8 text-center text-[#607078]">Cargando paso...</div>}
          >
            <StepComponent
              state={state}
              matchedProducts={matchedProducts}
              conversions={conversions}
              tarimasTotal={tarimasTotal}
              catalogProducts={catalogProducts}
              warehouses={catalogos?.almacenes ?? []}
              suppliers={catalogos?.proveedores ?? []}
              onUpload={handleFileUpload}
              onRunOCR={handleRunOCR}
              onUpdateMatch={updateMatchedProduct}
              onSetWarehouse={setWarehouseId}
              onSetSupplier={setSupplierId}
              onSelectHasOC={handleSelectHasOC}
              onNext={handleNext}
              onPrev={prevStep}
              onSave={handleSave}
              saving={false}
              receptionId={null}
              onNew={reset}
              ocrLoading={ocrLoading}
              ocrError={ocrError}
            />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

/**
 * V2 is intentionally deactivated until its catalog source is connected to
 * the canonical Firestore services. The active route is ProgramacionRecepcion.
 */
export default function ProgramacionRecepcionV2Disabled() {
  return (
    <div className="p-8 text-center text-[#607078]">
      Esta versión de programación está desactivada. Usa Programación de Recepción.
    </div>
  );
}
