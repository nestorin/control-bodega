// hooks/useOcr.ts
import { useState, useCallback } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";
import { type RawOcrResponseDto, type DocTipo } from "../services/paddleOcr";
import { normalizeOcrResponse, type OcrResponse } from "../services/domain/ocrMapper";

const app = getApp();
const functions = getFunctions(app, "us-central1");

export function useOcr() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OcrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Preview state (managed by hook so clear() resets everything)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [isPdfPreview, setIsPdfPreview] = useState(false);

  const runOcr = useCallback(async (file: File, tipo: DocTipo = "cfdi") => {
    setLoading(true);
    setError(null);
    // Set preview immediately for UX
    const url = URL.createObjectURL(file);
    setPreviewDataUrl(url);
    setPreviewFileName(file.name);
    setIsPdfPreview(file.type === "application/pdf");

    try {
      // Convertir archivo a base64
      const base64 = await fileToBase64(file);
      const mimeType = file.type || (tipo === "cfdi" ? "application/pdf" : "image/jpeg");

      // Llamar a la Callable Function segura
      const extractOcr = httpsCallable<
        {
          fileBase64: string;
          mimeType: string;
          tipo: DocTipo;
        },
        RawOcrResponseDto
      >(functions, "extract_ocr_secure");

      const response = await extractOcr({
        fileBase64: base64,
        mimeType,
        tipo,
      });

      // Normalizar usando el DTO canónico
      const normalized = normalizeOcrResponse(response.data, tipo);
      setResult(normalized);
      // Keep preview for display; backend preview replaces local if available
      if (normalized.preview?.dataUrl) {
        setPreviewDataUrl(normalized.preview.dataUrl);
      }
      return normalized;
    } catch (err: any) {
      const message = err.message || err.code || "Error en OCR";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
    setPreviewDataUrl(null);
    setPreviewFileName(null);
    setIsPdfPreview(false);
  }, []);

  return {
    runOcr,
    loading,
    result,
    error,
    clear,
    previewDataUrl,
    previewFileName,
    isPdfPreview,
    setPreviewDataUrl,
    setPreviewFileName,
    setIsPdfPreview,
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remover el prefijo "data:...;base64,"
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
  });
}
