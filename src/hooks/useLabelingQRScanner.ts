/**
 * useLabelingQRScanner — Hook para escaneo de códigos QR en Etiquetado
 *
 * Maneja: cámara, ZXing, race conditions con AbortController, error states.
 * Retorna API tipada para componentes de escaneo.
 */

import { useState, useCallback, useRef, useEffect } from "react";

export interface QRScanResult {
  qrCode: string;
  timestamp: Date;
}

export interface UseLabelingQRScannerReturn {
  qrReaderRef: React.RefObject<HTMLVideoElement | null>;
  isScanning: boolean;
  scanError: string | null;
  lastResult: QRScanResult | null;
  startScanning: (videoElement: HTMLVideoElement) => Promise<void>;
  stopScanning: () => void;
  onScanSuccess: (qrCode: string) => void;
  clearError: () => void;
}

export function useLabelingQRScanner(): UseLabelingQRScannerReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<QRScanResult | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const codeReaderRef = useRef<any>(null);

  // Clear error
  const clearError = useCallback(() => {
    setScanError(null);
  }, []);

  // Handle successful scan
  const onScanSuccess = useCallback((qrCode: string) => {
    const result: QRScanResult = { qrCode, timestamp: new Date() };
    setLastResult(result);
    setScanError(null);
  }, []);

  // Start scanning with ZXing
  const startScanning = useCallback(
    async (videoElement: HTMLVideoElement) => {
      if (isScanning) return;

      try {
        // Dynamic import ZXing to avoid SSR issues
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const codeReader = new BrowserMultiFormatReader() as any;
        codeReaderRef.current = codeReader;

        // Create new AbortController for this scan session
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        setIsScanning(true);
        setScanError(null);

        // Start continuous scanning
        await codeReader.decodeFromVideoDevice(
          undefined, // let user choose or auto-select
          videoElement,
          (result: any, err: any) => {
            if (signal.aborted) return;

            if (result) {
              const qrCode = result.getText();
              // Validate TQR format
              if (qrCode.startsWith("TQR-")) {
                onScanSuccess(qrCode);
                // Stop after successful scan
                stopScanning();
              } else {
                setScanError(`Formato QR inválido: ${qrCode}. Debe empezar con TQR-`);
              }
            }

            if (err && err.name !== "NotFoundException") {
              console.warn("QR scan warning:", err);
            }
          },
        );

        // Set up abort handler
        signal.addEventListener("abort", () => {
          try {
            codeReader.stopContinuousDecode?.();
          } catch {}
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Error al iniciar escáner QR";
        setScanError(errorMsg);
        setIsScanning(false);
      }
    },
    [isScanning, onScanSuccess],
  );

  // Stop scanning
  const stopScanning = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (codeReaderRef.current) {
      try {
        codeReaderRef.current.stopContinuousDecode?.();
      } catch {}
      codeReaderRef.current = null;
    }
    setIsScanning(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  return {
    qrReaderRef: { current: null } as React.RefObject<HTMLVideoElement | null>,
    isScanning,
    scanError,
    lastResult,
    startScanning,
    stopScanning,
    onScanSuccess,
    clearError,
  };
}

export default useLabelingQRScanner;
