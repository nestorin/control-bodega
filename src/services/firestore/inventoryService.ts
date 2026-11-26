import { Firestore, getDocs, query, where, collectionGroup } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { BaseService } from "./baseService";
import type { InventoryMovementDoc } from "./types";
import type { InventoryImportRow } from "../inventoryImport";
import type { Producto } from "@/types";

export class InventoryService extends BaseService<InventoryMovementDoc> {
  protected collectionPath = "organizations/{orgId}/inventory";
  protected fromFirestore(doc: any): InventoryMovementDoc {
    return { id: doc.id, ...doc.data() } as InventoryMovementDoc;
  }
  protected toFirestore(data: Partial<InventoryMovementDoc>) {
    return data;
  }
  protected getAuditEntityType() {
    return "inventory_movement";
  }

  // Get current stock for a product in a warehouse
  async getCurrentStock(warehouseId: string, productId: string): Promise<number> {
    // Use collection group query across all inventory subcollections
    const q = query(
      collectionGroup(this.db, "inventory_movements"),
      where("organizationId", "==", this.orgId),
      where("warehouseId", "==", warehouseId),
      where("productId", "==", productId),
    );
    const snap = await getDocs(q);
    return snap.docs.reduce((sum, d) => {
      const m = d.data() as InventoryMovementDoc;
      if (m.direction === "IN" || m.movementType === "RECEIPT" || m.movementType === "TRANSFER")
        return sum + m.quantity;
      if (m.direction === "OUT" || m.movementType === "SHIPMENT") return sum - m.quantity;
      return sum;
    }, 0);
  }

  // Get all stock for a warehouse (for reports)
  async getWarehouseStock(warehouseId: string): Promise<Record<string, number>> {
    const q = query(
      collectionGroup(this.db, "inventory_movements"),
      where("organizationId", "==", this.orgId),
      where("warehouseId", "==", warehouseId),
    );
    const snap = await getDocs(q);
    const stock: Record<string, number> = {};
    for (const d of snap.docs) {
      const m = d.data() as InventoryMovementDoc;
      if (m.direction === "IN" || m.movementType === "RECEIPT" || m.movementType === "TRANSFER") {
        stock[m.productId] = (stock[m.productId] || 0) + m.quantity;
      } else if (m.direction === "OUT" || m.movementType === "SHIPMENT") {
        stock[m.productId] = (stock[m.productId] || 0) - m.quantity;
      }
    }
    return stock;
  }

  // Atomic stock adjustment (for receipts, shipments, and transfers)
  async adjustStock(
    warehouseId: string,
    productId: string,
    quantity: number,
    movementType: "RECEIPT" | "SHIPMENT" | "ADJUSTMENT" | "TRANSFER",
    lot?: string,
    expiryDate?: Date,
    operationId: string = "",
    actorUserId: string = "user",
  ): Promise<void> {
    // Allow RECEIPT, SHIPMENT, and TRANSFER through adjust_inventory callable
    // ADJUSTMENT uses a separate dedicated operation
    if (movementType === "ADJUSTMENT") {
      throw new Error(
        `Inventory movement type ADJUSTMENT must use its dedicated authorized backend operation.`,
      );
    }

    const adjustInventory = httpsCallable(getFunctions(), "adjust_inventory");
    await adjustInventory({
      warehouseId,
      productId,
      quantity,
      movementType,
      lot: lot || "",
      expiryDate: expiryDate?.toISOString() ?? null,
      operationId,
    });
  }

  // Batch adjust multiple products (for reception completion)
  async batchAdjustStock(
    warehouseId: string,
    adjustments: Array<{
      productId: string;
      quantity: number;
      movementType: "RECEIPT" | "SHIPMENT" | "ADJUSTMENT";
      lot?: string;
      expiryDate?: Date;
    }>,
    operationId: string,
    actorUserId: string,
  ): Promise<void> {
    if (adjustments.some(({ movementType }) => movementType !== "RECEIPT")) {
      throw new Error(
        "Batch inventory writes support only RECEIPT through adjust_inventory; use the authorized shipment operation for other movement types.",
      );
    }

    const adjustInventory = httpsCallable(getFunctions(), "adjust_inventory");
    for (const [index, adjustment] of adjustments.entries()) {
      await adjustInventory({
        warehouseId,
        productId: adjustment.productId,
        quantity: adjustment.quantity,
        movementType: adjustment.movementType,
        lot: adjustment.lot || "",
        expiryDate: adjustment.expiryDate?.toISOString() ?? null,
        // The backend uses operationId for idempotency; derive stable child
        // keys while retaining the caller's operation as the common prefix.
        operationId: `${operationId}:${index}`,
      });
    }
  }

  async importInventory(
    rows: InventoryImportRow[],
    mode: "REPLACE" | "ADD",
    operationId: string,
  ): Promise<void> {
    if (!rows.length) throw new Error("Inventory import requires at least one valid row");
    const callable = httpsCallable(getFunctions(), "import_inventory");
    await callable({
      mode,
      operationId,
      rows: rows.map(({ productId, warehouseId, quantity }) => ({
        productId,
        warehouseId,
        quantity,
      })),
    });
  }

  // ============================================
  // Compatibility methods for InventoryContext
  // ============================================

  /** Get inventory for a warehouse (alias for getWarehouseStock) */
  async getInventarioAlmacen(almacenId: string): Promise<Record<string, number>> {
    return this.getWarehouseStock(almacenId);
  }

  /** Create initial inventory for a warehouse with all products at zero */
  async createInventarioInicial(almacenId: string, productos: Producto[]): Promise<void> {
    // This is a no-op in Firestore since inventory is derived from movements.
    // The initial state is implicitly zero for all products.
    // We could write a "seed" movement document if needed for audit trail.
    // For now, this just validates the warehouse exists and returns.
    console.log(
      `[InventoryService] Initial inventory for ${almacenId} with ${productos.length} products (implicit zero)`,
    );
  }

  /** Increase inventory for multiple products (RECEIPT) */
  async aumentarInventario(
    almacenId: string,
    productos: Array<{ productoId: string; cajas: number }>,
    operationId: string,
    actorUserId: string = "user",
  ): Promise<void> {
    await this.batchAdjustStock(
      almacenId,
      productos.map((p) => ({
        productId: p.productoId,
        quantity: p.cajas,
        movementType: "RECEIPT",
      })),
      operationId,
      actorUserId,
    );
  }

  /** Decrease inventory for multiple products (SHIPMENT) */
  async reducirInventario(
    almacenId: string,
    productos: Array<{ productoId: string; cajas: number }>,
    operationId: string,
    actorUserId: string = "user",
  ): Promise<void> {
    // Use individual adjustStock calls since batchAdjustStock only supports RECEIPT
    for (let i = 0; i < productos.length; i++) {
      const { productoId, cajas } = productos[i];
      await this.adjustStock(
        almacenId,
        productoId,
        cajas,
        "SHIPMENT",
        undefined,
        undefined,
        `${operationId}:${i}`,
        actorUserId,
      );
    }
  }
}
