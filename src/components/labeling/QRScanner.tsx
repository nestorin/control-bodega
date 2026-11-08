/**
 * QRScanner — Componente escáner QR para Etiquetado
 *
 * Integra useLabelingQRScanner para escaneo de códigos TQR.
 * Maneja: cámara, permisos, error states, race conditions con AbortController.
 */

import { useRef, useState, useCallback, useEffect, memo } from "react";
import { useLabelingQRScanner } from "@/hooks/useLabelingQRScanner";

interface QRScannerProps {
  onScanSuccess: (qrCode: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

function QRScannerInner({ onScanSuccess, onError, className = "" }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const {
    startScanning,
    stopScanning,
    onScanSuccess: handleScanSuccess,
    clearError,
    isScanning: hookIsScanning,
    scanError: hookScanError,
    lastResult,
  } = useLabelingQRScanner();

  // Sync local state with hook
  useEffect(() => {
    if (hookScanError) {
      setScanError(hookScanError);
      onError?.(hookScanError);
    }
  }, [hookScanError, onError]);

  useEffect(() => {
    if (lastResult) {
      onScanSuccess(lastResult.qrCode);
    }
  }, [lastResult, onScanSuccess]);

  // Request camera permission
  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
      });
      stream.getTracks().forEach((track) => track.stop());
      setHasPermission(true);
      return true;
    } catch (err) {
      setHasPermission(false);
      const errorMsg = err instanceof Error ? err.message : "Permiso de cámara denegado";
      setScanError(errorMsg);
      onError?.(errorMsg);
      return false;
    }
  }, [facingMode, onError]);

  // Start scanning
  const handleStartScanning = useCallback(async () => {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) return;
    }

    if (!videoRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      startScanning(videoRef.current);
      setIsScanning(true);
      setScanError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Error al iniciar escáner";
      setScanError(errorMsg);
      onError?.(errorMsg);
    }
  }, [hasPermission, facingMode, startScanning, onError]);

  // Stop scanning
  const handleStopScanning = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    stopScanning();
    setIsScanning(false);
  }, [stopScanning]);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    const newMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newMode);
    if (isScanning) {
      handleStopScanning();
      setTimeout(() => handleStartScanning(), 100);
    }
  }, [facingMode, isScanning, handleStopScanning, handleStartScanning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
      stopScanning();
    };
  }, [stopScanning]);

  // Render
  if (hasPermission === false) {
    return (
      <div className={`qr-scanner w-full ${className}`}>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <svg
            className="mx-auto h-12 w-12 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-red-800">Permiso de cámara requerido</h3>
          <p className="mt-2 text-red-600">
            No se puede acceder a la cámara. Verifique los permisos del navegador.
          </p>
          <button
            onClick={requestPermission}
            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`qr-scanner w-full ${className}`}>
      <div className="relative bg-gray-900 rounded-xl overflow-hidden">
        {/* Video feed */}
        <video
          ref={videoRef}
          className="w-full h-64 object-cover"
          playsInline
          muted
          aria-label="Escáner QR"
        />

        {/* Scanning overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-48 h-48">
            {/* Corner brackets */}
            <div className="absolute -top-2 -left-2 w-6 h-6 border-4 border-blue-500 border-r-0 border-b-0 rounded-tl-lg" />
            <div className="absolute -top-2 -right-2 w-6 h-6 border-4 border-blue-500 border-l-0 border-b-0 rounded-tr-lg" />
            <div className="absolute -bottom-2 -left-2 w-6 h-6 border-4 border-blue-500 border-r-0 border-t-0 rounded-bl-lg" />
            <div className="absolute -bottom-2 -right-2 w-6 h-6 border-4 border-blue-500 border-l-0 border-t-0 rounded-br-lg" />

            {/* Scan line animation */}
            {isScanning && (
              <div className="absolute left-0 right-0 top-1/2 h-1 bg-blue-500/50 animate-pulse" />
            )}
          </div>
        </div>

        {/* Status indicator */}
        <div className="absolute top-3 left-3 right-3 flex justify-center">
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              isScanning ? "bg-green-500/90 text-white" : "bg-gray-600/90 text-gray-300"
            }`}
          >
            {isScanning ? "Escaneando..." : "Listo para escanear"}
          </span>
        </div>

        {/* Error toast */}
        {scanError && (
          <div className="absolute bottom-3 left-3 right-3">
            <div className="bg-red-500/90 text-white px-4 py-2 rounded-lg text-sm flex items-center justify-between">
              <span>{scanError}</span>
              <button onClick={clearError} className="ml-2 text-white hover:text-gray-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={isScanning ? handleStopScanning : handleStartScanning}
          disabled={hookIsScanning && !isScanning}
          className={`w-full sm:w-auto px-6 py-3 rounded-lg font-medium transition-colors ${
            isScanning
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-blue-600 text-white hover:bg-blue-700"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <svg
            className="inline w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {isScanning ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
              />
            ) : (
              <>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </>
            )}
          </svg>
          {isScanning ? "Detener" : "Iniciar escaneo"}
        </button>

        <button
          onClick={toggleCamera}
          disabled={!hasPermission}
          className="w-full sm:w-auto px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          <svg
            className="inline w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Cambiar cámara
        </button>
      </div>

      {/* Instructions */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600 text-center">
          Apunte el código QR dentro del marco. Formato esperado:{" "}
          <code className="text-blue-600 px-1 py-0.5 bg-blue-50 rounded">TQR-OC123-1</code>
        </p>
      </div>
    </div>
  );
}

export const QRScanner = memo(function QRScanner({
  onScanSuccess,
  onError,
  className = "",
}: QRScannerProps) {
  return <QRScannerInner onScanSuccess={onScanSuccess} onError={onError} className={className} />;
});

export type { QRScannerProps };
export default QRScanner;
