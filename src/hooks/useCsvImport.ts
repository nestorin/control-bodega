/**
 * useCsvImport Hook — CSV Import logic for Configuracion
 * Handles parse, validate, preview, commit, templates
 */

import { useState, useCallback, useRef } from "react";
import { useAuthorization } from "@/hooks/useAuthorization";
import { parseCsv, parseCsvFull } from "@/services/csvParser";
import { validateRows, createEmptyCrossRefs, generateCsvTemplate } from "@/validation/schemas";
import {
  commitBatch,
  createProductBatchWrites,
  createSupplierBatchWrites,
  createConversionBatchWrites,
  createWarehouseBatchWrites,
} from "@/services/firestoreBatch";
import { useCatalogos } from "@/hooks/useCatalogos";
import type { CatalogType, ValidationResult, ImportLog, CsvRow } from "@/types/csvImport";
import { TEMPLATE_EXAMPLES } from "@/types/csvImport";

export function useCsvImport() {
  const { canQuery } = useAuthorization();
  const { catalogoProductos, catalogoAlmacenes, catalogoProveedores, refreshCatalogos } =
    useCatalogos();

  const [previewRows, setPreviewRows] = useState<ValidationResult[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [importLog, setImportLog] = useState<ImportLog | null>(null);
  const [selectedType, setSelectedType] = useState<CatalogType>("products");
  const [commitProgress, setCommitProgress] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Build cross-refs from existing catalogs
  const buildCrossRefs = useCallback(() => {
    const crossRefs = createEmptyCrossRefs();
    crossRefs.existingSkus = new Set(catalogoProductos.map((p) => p.sku));
    crossRefs.existingWarehouseNames = new Set(catalogoAlmacenes.map((a) => a.nombre));
    crossRefs.existingProductNames = new Set(catalogoProductos.map((p) => p.nombre.toUpperCase()));
    return crossRefs;
  }, [catalogoProductos, catalogoAlmacenes]);

  const parseFile = useCallback(
    async (file: File, type: CatalogType) => {
      if (!canQuery) {
        throw new Error("No autorizado para importar");
      }

      setIsParsing(true);
      setPreviewRows([]);
      setImportLog(null);

      abortControllerRef.current = new AbortController();

      try {
        // Parse CSV (preview only - first 100 rows)
        const {
          rows,
          errors: parseErrors,
          meta,
        } = await parseCsv<Record<string, any>>(file, {
          previewLimit: 100,
        });

        if (abortControllerRef.current?.signal.aborted) return;

        // Validate rows
        const crossRefs = buildCrossRefs();
        const validation = validateRows(rows, type, crossRefs);

        // Add parse errors
        parseErrors.forEach((err) => {
          if (err.row > 0 && err.row <= validation.length) {
            validation[err.row - 1].errors.push({
              code: err.code as any,
              message: err.message,
            });
            validation[err.row - 1].isValid = false;
          }
        });

        setPreviewRows(validation);

        // Create preliminary import log
        const validCount = validation.filter((v) => v.isValid).length;
        const log: ImportLog = {
          id: `import-${Date.now()}`,
          organizationId: "org_exepa_001",
          userId: "current-user",
          userName: "Usuario",
          type,
          fileName: file.name,
          fileSize: file.size,
          totalRows: validation.length,
          validRows: validCount,
          invalidRows: validation.length - validCount,
          status: "preview",
          errors: validation
            .filter((v) => !v.isValid)
            .flatMap((v) =>
              v.errors.map((e) => ({
                row: v.rowIndex,
                code: e.code,
                message: e.message,
                data: v.data as unknown as Record<string, string>,
              })),
            ),
          createdAt: new Date(),
        };

        setImportLog(log);
      } catch (error) {
        throw error;
      } finally {
        setIsParsing(false);
      }
    },
    [canQuery, buildCrossRefs],
  );

  const commitImport = useCallback(async () => {
    if (!canQuery || !importLog || previewRows.length === 0) {
      throw new Error("No hay datos válidos para importar");
    }

    const validRows = previewRows.filter((v) => v.isValid);
    if (validRows.length === 0) {
      throw new Error("No hay filas válidas para importar");
    }

    setIsCommitting(true);
    setCommitProgress(0);

    try {
      // Parse full file for commit
      // Note: In real implementation, we'd need to store the file or re-read it
      // For now, use preview data (limited to 100 rows)
      const writes = validRows.map((v, idx) => {
        const data = v.data as any;
        switch (importLog.type) {
          case "products":
            return { type: "set" as const, collectionPath: "products", docId: data.sku, data };
          case "suppliers":
            return {
              type: "set" as const,
              collectionPath: "suppliers",
              docId: data.id || `SUP-${Date.now()}-${idx}`,
              data,
            };
          case "conversions":
            return {
              type: "set" as const,
              collectionPath: "conversions",
              docId: data.id || `CONV-${Date.now()}-${idx}`,
              data,
            };
          case "warehouses":
            return {
              type: "set" as const,
              collectionPath: "warehouses",
              docId: data.id || `WH-${Date.now()}-${idx}`,
              data,
            };
        }
      });

      const result = await commitBatch(writes, {
        onProgress: (committed) => setCommitProgress((committed / writes.length) * 100),
      });

      if (!result.success) {
        throw new Error(`Importación parcial: ${result.committed} OK, ${result.failed} fallaron`);
      }

      // Update import log
      const finalLog: ImportLog = {
        ...importLog,
        status: "committed",
        committedAt: new Date(),
        validRows: result.committed,
        invalidRows: result.failed,
        errors: result.errors.map((e) => ({
          row: e.index,
          code: "INVALID_TYPE" as any,
          message: e.error,
          data: {},
        })),
      };
      setImportLog(finalLog);

      // Refresh catalogs
      await refreshCatalogos();

      return result;
    } catch (error) {
      const failedLog: ImportLog = {
        ...importLog!,
        status: "failed",
        errors: [
          ...(importLog!.errors || []),
          {
            row: 0,
            code: "INVALID_TYPE",
            message: error instanceof Error ? error.message : "Error desconocido",
            data: {},
          },
        ],
      };
      setImportLog(failedLog);
      throw error;
    } finally {
      setIsCommitting(false);
      setCommitProgress(0);
    }
  }, [canQuery, importLog, previewRows, refreshCatalogos]);

  const downloadTemplate = useCallback((type: CatalogType) => {
    const examples = TEMPLATE_EXAMPLES[type] as Record<string, any>[];
    const headers = Object.keys(examples[0] || {}).join(",");
    const rows = examples.map((ex: Record<string, any>) => Object.values(ex).join(","));
    const csv = [headers, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `plantilla-${type}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewRows([]);
    setImportLog(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    previewRows,
    isParsing,
    isCommitting,
    importLog,
    selectedType,
    commitProgress,
    parseFile,
    commitImport,
    downloadTemplate,
    clearPreview,
    setSelectedType,
  };
}
