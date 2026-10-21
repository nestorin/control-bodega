import type { DocTipo, OcrProduct } from "./paddleOcr";
import type { ReceptionDoc, ReceptionLineDoc } from "./firestore/types";

export interface CatalogProduct {
  id: string;
  nombre: string;
  sku: string;
  unidad: string;
  codigosProveedor?: string[];
}

export interface ReceptionFormProduct {
  productId: string | null;
  codigo: string | null;
  nombre: string;
  unidad: string | null;
  cantidad: number;
  importe: number;
  estadoMatch: "confirmado" | "sugerido" | "manual";
}

export interface ReceptionPersistenceRequest {
  reception: Omit<ReceptionDoc, "id" | "createdAt" | "updatedAt" | "organizationId">;
  lines: Array<
    Omit<ReceptionLineDoc, "id" | "createdAt" | "updatedAt" | "organizationId" | "receptionId">
  >;
}

function normalize(value: string): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function getReceptionOcrDocumentType(hasPurchaseOrder: boolean): DocTipo {
  return hasPurchaseOrder ? "oc" : "cfdi";
}

export function mapOcrProductsToReceptionForm(
  products: OcrProduct[],
  catalog: CatalogProduct[],
): ReceptionFormProduct[] {
  return products
    .filter((line) => line.cantidad > 0)
    .map((line) => {
      const code = line.codigo?.trim().toUpperCase() || null;
      const name = normalize(line.nombre);
      const match =
        catalog.find(
          (product) =>
            (code != null &&
              ((product.codigosProveedor ?? []).some((providerCode) =>
                normalize(code).startsWith(normalize(providerCode)),
              ) ||
                normalize(product.sku) === normalize(code))) ||
            normalize(product.nombre) === name ||
            normalize(product.sku) === name,
        ) ?? null;

      return {
        productId: match?.id ?? null,
        codigo: match?.sku ?? code,
        nombre: match?.nombre ?? line.nombre,
        unidad: match?.unidad ?? line.unidad,
        cantidad: line.cantidad,
        importe: line.importe,
        estadoMatch: match ? "confirmado" : "sugerido",
      };
    });
}

export function mapReceptionFormToPersistence(input: {
  products: ReceptionFormProduct[];
  warehouseId: string;
  supplierId?: string;
  actorUserId: string;
  operationId: string;
}): ReceptionPersistenceRequest {
  return {
    reception: {
      warehouseId: input.warehouseId,
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
      status: "DRAFT",
      actorUserId: input.actorUserId,
      operationId: input.operationId,
    },
    lines: input.products
      .filter(
        (product) =>
          // A valid catalog ID is the authoritative confirmation. Do not
          // discard a selected product merely because OCR left its visual
          // match state as suggested/manual.
          typeof product.productId === "string" &&
          product.productId.trim().length > 0 &&
          product.cantidad > 0,
      )
      .map((product) => ({
        productId: product.productId as string,
        quantity: product.cantidad,
        unit: product.unidad || "cajas",
        palletsCreated: 0,
      })),
  };
}
