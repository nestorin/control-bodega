/**
 * useQrScanner — God Component Refactor Phase 6
 *
 * QR Code scanner hook using @zxing/browser with AbortController for race condition prevention.
 * Uses callback ref pattern for video element. Manual start/stop, auto-cleanup, camera permission handling.
 * Reusable for both CapturaTarima and EscanearQR screens (reception flow).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { BrowserQRCodeReader } from '@zxing/browser';

// ============================================
// Types
// ============================================

export interface UseQrScannerReturn {
  // Callback ref for video element
  qrReaderRef: (el: HTMLVideoElement | null) => void;

  // State
  isScanning: boolean;
  scanError: string | null;
  lastResult: string | null;

  // Actions
  startScanning: (onScanSuccess: (result: string) => void) => Promise<void>;
  stopScanning: () => void;
  onScanSuccess: (result: string) => void;
  clearError: () => void;
}

interface ScannerState {
  reader: BrowserQRCodeReader | null;
  abortController: AbortController | null;
  videoElement: HTMLVideoElement | null;
  onScanCallback: ((result: string) => void) | null;
}

// ============================================
// Hook
// ============================================

export function useQrScanner(): UseQrScannerReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const stateRef = useRef<ScannerState>({
    reader: null,
    abortController: null,
    videoElement: null,
    onScanCallback: null,
  });

  // Callback ref for video element
  const qrReaderRef = useCallback((el: HTMLVideoElement | null) => {
    stateRef.current.videoElement = el;
  }, []);

  // Dynamic import of @zxing/browser to avoid SSR issues
  const loadZxing = useCallback(async () => {
    const { BrowserQRCodeReader } = await import('@zxing/browser');
    return BrowserQRCodeReader;
  }, []);

  const startScanning = useCallback(
    async (onScanSuccess: (result: string) => void) => {
      if (isScanning) return;

      try {
        setScanError(null);

        // Check for camera permission
        const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (permission.state === 'denied') {
          throw new Error('Permiso de cámara denegado. Habilítalo en la configuración del navegador.');
        }

        const BrowserQRCodeReader = await loadZxing();
        const reader = new BrowserQRCodeReader();

        // Create abort controller for race condition prevention
        const abortController = new AbortController();

        // Get video element from ref
        const videoElement = stateRef.current.videoElement;
        if (!videoElement) {
          throw new Error('Elemento de video no encontrado');
        }

        // Store state
        stateRef.current = {
          reader,
          abortController,
          videoElement,
          onScanCallback: onScanSuccess,
        };

        setIsScanning(true);

        // Start scanning with abort signal
        await reader.decodeFromVideoDevice(
          undefined, // Use default camera
          videoElement,
          (result, _err) => {
            // Check if aborted
            if (abortController.signal.aborted) return;

            if (result) {
              const text = result.getText();
              setLastResult(text);
              onScanSuccess(text);
            }
          }
        ).catch((err) => {
          // Ignore abort errors
          if (err.name === 'AbortError' || abortController.signal.aborted) {
            return;
          }
          // Check if it's a permission error
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setScanError('Permiso de cámara denegado. Habilítalo en la configuración del navegador.');
          } else if (err.name === 'NotFoundError') {
            setScanError('No se encontró cámara disponible');
          } else if (err.name === 'NotReadableError') {
            setScanError('No se pudo acceder a la cámara. Verifica que no esté en uso por otra app.');
          } else {
            setScanError(`Error al escanear: ${err.message}`);
          }
          setIsScanning(false);
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al iniciar escáner';
        setScanError(msg);
        setIsScanning(false);
      }
    },
    [isScanning, loadZxing]
  );

  const stopScanning = useCallback(() => {
    const { reader, abortController } = stateRef.current;

    // Signal abort to stop any pending decode operation
    if (abortController) {
      abortController.abort();
    }

    // Clear reader reference (BrowserQRCodeReader doesn't have reset())
    if (reader) {
      try {
        stateRef.current.reader = null;
      } catch {
        // Ignore errors
      }
    }

    // Clear state
    stateRef.current = {
      reader: null,
      abortController: null,
      videoElement: stateRef.current.videoElement, // Keep video element ref
      onScanCallback: null,
    };

    setIsScanning(false);
  }, []);

  const handleScanSuccess = useCallback((result: string) => {
    const { onScanCallback } = stateRef.current;
    if (onScanCallback) {
      onScanCallback(result);
    }
  }, []);

  const clearError = useCallback(() => {
    setScanError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  return {
    qrReaderRef,
    isScanning,
    scanError,
    lastResult,
    startScanning,
    stopScanning,
    onScanSuccess: handleScanSuccess,
    clearError,
  };
}

export default useQrScanner;