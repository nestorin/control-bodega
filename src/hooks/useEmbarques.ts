import { useState, useCallback, useEffect } from "react";
import {
  Embarque,
  Tarima,
  TarimaScanInput,
  EmbarqueStatus,
  TarimaStatus,
  EmbarqueWithProgress,
  TarimaWithProgress,
} from "@/types/embarque";
import { DocumentoCargado } from "@/types/documento";
import {
  planificarEmbarque,
  generarImpresion,
  escanearTarima,
  confirmarEmbarque,
  getEmbarque,
  getTarimas,
  getEmbarquesByPedido,
} from "@/services/embarques";
import { getStockDisponible } from "@/services/inventario"; // Asumiendo que existe

interface UseEmbarquesReturn {
  // Estado
  embarques: EmbarqueWithProgress[];
  loading: boolean;
  error: string | null;

  // Acciones
  planificar: (documento: DocumentoCargado) => Promise<Embarque | null>;
  imprimir: (embarqueId: string) => Promise<{ etiquetas: any[] } | null>;
  escanear: (qr: string, input: TarimaScanInput) => Promise<Tarima | null>;
  confirmar: (embarqueId: string) => Promise<boolean>;
  cargarEmbarque: (embarqueId: string) => Promise<EmbarqueWithProgress | null>;
  cargarEmbarquesPorPedido: (pedidoId: string) => Promise<void>;

  // Utils
  clearError: () => void;
}

export function useEmbarques(): UseEmbarquesReturn {
  const [embarques, setEmbarques] = useState<EmbarqueWithProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const withLoading = useCallback(
    async <T>(
      fn: () => Promise<T>,
      errorMsg: string = "Error en la operación",
    ): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : errorMsg;
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const planificar = useCallback(
    async (documento: DocumentoCargado) => {
      return withLoading(async () => {
        const embarque = await planificarEmbarque(documento, async (almacenId, productoId) => {
          return getStockDisponible(almacenId, productoId);
        });
        // Actualizar lista local
        setEmbarques((prev) => [{ ...embarque, progressPercent: 0 }, ...prev]);
        return embarque;
      }, "Error al planificar embarque");
    },
    [withLoading],
  );

  const imprimir = useCallback(
    async (embarqueId: string) => {
      return withLoading(async () => {
        const job = await generarImpresion(embarqueId);
        return job;
      }, "Error al generar impresión");
    },
    [withLoading],
  );

  const escanear = useCallback(
    async (qr: string, input: TarimaScanInput) => {
      return withLoading(async () => {
        const tarima = await escanearTarima(qr, input);
        // Actualizar embarque en lista local
        setEmbarques((prev) =>
          prev.map((e) =>
            e.id === tarima.embarqueId
              ? {
                  ...e,
                  tarimasCompletadas: e.tarimasCompletadas + 1,
                  status: "in_progress" as EmbarqueStatus,
                }
              : e,
          ),
        );
        return tarima;
      }, "Error al escanear tarima");
    },
    [withLoading],
  );

  const confirmar = useCallback(
    async (embarqueId: string) => {
      return (
        (await withLoading(async () => {
          await confirmarEmbarque(embarqueId);
          setEmbarques((prev) =>
            prev.map((e) =>
              e.id === embarqueId ? { ...e, status: "completed" as EmbarqueStatus } : e,
            ),
          );
          return true;
        }, "Error al confirmar embarque")) ?? false
      );
    },
    [withLoading],
  );

  const cargarEmbarque = useCallback(
    async (embarqueId: string) => {
      return withLoading(async () => {
        const [embarque, tarimas] = await Promise.all([
          getEmbarque(embarqueId),
          getTarimas(embarqueId),
        ]);

        if (!embarque) return null;

        const progressPercent =
          embarque.totalTarimas > 0
            ? (embarque.tarimasCompletadas / embarque.totalTarimas) * 100
            : 0;

        const tarimasWithProgress: TarimaWithProgress[] = tarimas.map((t, i) => ({
          ...t,
          isNext: t.status === "pending" && i === tarimas.findIndex((x) => x.status === "pending"),
        }));

        return {
          ...embarque,
          progressPercent,
          tarimas: tarimasWithProgress,
        };
      }, "Error al cargar embarque");
    },
    [withLoading],
  );

  const cargarEmbarquesPorPedido = useCallback(
    async (pedidoId: string) => {
      await withLoading(async () => {
        const list = await getEmbarquesByPedido(pedidoId);
        const withProgress = list.map((e) => ({
          ...e,
          progressPercent: e.totalTarimas > 0 ? (e.tarimasCompletadas / e.totalTarimas) * 100 : 0,
        }));
        setEmbarques(withProgress);
      }, "Error al cargar embarques");
    },
    [withLoading],
  );

  return {
    embarques,
    loading,
    error,
    planificar,
    imprimir,
    escanear,
    confirmar,
    cargarEmbarque,
    cargarEmbarquesPorPedido,
    clearError,
  };
}
