import {
  Firestore,
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  serverTimestamp,
  writeBatch,
  runTransaction,
  collectionGroup,
  documentId,
  updateDoc,
  setDoc,
  deleteDoc,
  CollectionReference,
  DocumentData,
  Timestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { BaseService } from "./baseService";
import { InventoryService } from "./inventoryService";
import { WAREHOUSE_IDS } from "@/config/warehouses";
import type {
  WarehouseDoc,
  SupplierDoc,
  ProductDoc,
  ConversionDoc,
  PurchaseOrderDoc,
  PurchaseOrderLine,
  ReceptionDoc,
  ReceptionCreateInput,
  ReceptionLineDoc,
  PalletDoc,
  InventoryMovementDoc,
  ShipmentDoc,
  ShipmentLine,
  LotCaducidadDoc,
} from "./types";

export class WarehouseService extends BaseService<WarehouseDoc> {
  protected collectionPath = "organizations/{orgId}/warehouses";
  protected fromFirestore(doc: any): WarehouseDoc {
    return { id: doc.id, ...doc.data() } as WarehouseDoc;
  }
  protected toFirestore(data: Partial<WarehouseDoc>) {
    return data;
  }
  protected getAuditEntityType() {
    return "warehouse";
  }

  async getCanonical(): Promise<{ data: WarehouseDoc[] }> {
    const q = query(
      this.getCollectionRef(),
      where(documentId(), "in", Object.values(WAREHOUSE_IDS)),
    );
    const snap = await getDocs(q);
    const data = snap.docs
      .map((warehouse) => this.fromFirestore(warehouse))
      .sort((left, right) => (left.code ?? "").localeCompare(right.code ?? ""));
    return { data };
  }
}

export class SupplierService extends BaseService<SupplierDoc> {
  protected collectionPath = "organizations/{orgId}/suppliers";
  protected fromFirestore(doc: any): SupplierDoc {
    return { id: doc.id, ...doc.data() } as SupplierDoc;
  }
  protected toFirestore(data: Partial<SupplierDoc>) {
    return data;
  }
  protected getAuditEntityType() {
    return "supplier";
  }
}

export class ProductService extends BaseService<ProductDoc> {
  protected collectionPath = "organizations/{orgId}/products";
  protected fromFirestore(doc: any): ProductDoc {
    return { id: doc.id, ...doc.data() } as ProductDoc;
  }
  protected toFirestore(data: Partial<ProductDoc>) {
    return data;
  }
  protected getAuditEntityType() {
    return "product";
  }

  async getBySku(sku: string): Promise<ProductDoc | null> {
    const result = await this.getAll({ where: [["sku", "==", sku]], limit: 1 });
    return result.data[0] || null;
  }
}

export class ConversionService extends BaseService<ConversionDoc> {
  protected collectionPath = "organizations/{orgId}/conversions";
  protected fromFirestore(doc: any): ConversionDoc {
    return { id: doc.id, ...doc.data() } as ConversionDoc;
  }
  protected toFirestore(data: Partial<ConversionDoc>) {
    return data;
  }
  protected getAuditEntityType() {
    return "conversion";
  }

  async getByProductName(productName: string): Promise<ConversionDoc | null> {
    const result = await this.getAll({
      where: [["productName", "==", productName]],
      limit: 1,
    });
    return result.data[0] || null;
  }
}

export class PurchaseOrderService extends BaseService<PurchaseOrderDoc> {
  protected collectionPath = "organizations/{orgId}/purchase_orders";
  protected fromFirestore(doc: any): PurchaseOrderDoc {
    return { id: doc.id, ...doc.data() } as PurchaseOrderDoc;
  }
  protected toFirestore(data: Partial<PurchaseOrderDoc>) {
    return data;
  }
  protected getAuditEntityType() {
    return "purchase_order";
  }

  async getByNumber(number: string): Promise<PurchaseOrderDoc | null> {
    const result = await this.getAll({
      where: [["number", "==", number]],
      limit: 1,
    });
    return result.data[0] || null;
  }

  async getByWarehouse(warehouseId: string): Promise<PurchaseOrderDoc[]> {
    const result = await this.getAll({
      where: [["warehouseId", "==", warehouseId]],
    });
    return result.data;
  }
}

export class ReceptionService extends BaseService<ReceptionDoc> {
  protected collectionPath = "organizations/{orgId}/receptions";
  protected fromFirestore(doc: any): ReceptionDoc {
    return { id: doc.id, ...doc.data() } as ReceptionDoc;
  }
  protected toFirestore(data: Partial<ReceptionDoc>) {
    return data;
  }
  protected getAuditEntityType() {
    return "reception";
  }

  async getByOperationId(operationId: string): Promise<ReceptionDoc | null> {
    const result = await this.getAll({
      where: [["operationId", "==", operationId]],
      limit: 1,
    });
    return result.data[0] || null;
  }

  async getByWarehouse(
    warehouseId: string,
    status?: ReceptionDoc["status"],
  ): Promise<ReceptionDoc[]> {
    const whereClauses: Array<[string, any, any]> = [["warehouseId", "==", warehouseId]];
    if (status) whereClauses.push(["status", "==", status]);
    const result = await this.getAll({ where: whereClauses });
    return result.data;
  }

  async confirmReception(
    receptionId: string,
    actorUserId: string,
    operationId: string,
  ): Promise<void> {
    const confirm = httpsCallable(getFunctions(), "confirm_reception");
    await confirm({ receptionId, operationId });
    return;
  }

  async advanceToInProgress(
    receptionId: string,
    actorUserId: string,
    operationId: string,
  ): Promise<void> {
    await this.update(
      receptionId,
      {
        status: "IN_PROGRESS",
      },
      actorUserId,
      operationId,
    );
  }

  // Create reception with lines in a transaction
  async createReception(
    data: ReceptionCreateInput,
    lines: Array<
      Omit<ReceptionLineDoc, "id" | "createdAt" | "updatedAt" | "organizationId" | "receptionId">
    >,
    actorUserId: string,
    operationId: string,
  ): Promise<ReceptionDoc> {
    const create = httpsCallable(getFunctions(), "create_reception");
    const result = await create({
      operationId,
      warehouseId: data.warehouseId,
      supplierId: data.supplierId,
      purchaseOrderId: data.purchaseOrderId,
      purchaseOrderNumber: data.purchaseOrderNumber,
      folio: data.folio,
      scheduledDate: data.scheduledDate,
      supplierCode: data.supplierCode,
      supplierName: data.supplierName,
      logisticsProvider: data.logisticsProvider,
      plannedPallets: data.plannedPallets,
      lines: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unit: line.unit,
        lot: line.lot || null,
      })),
    });
    const response = result.data as {
      receptionId?: string;
      evidenceId?: string;
      folio?: string;
      scheduledDate?: string;
      purchaseOrderId?: string;
      purchaseOrderNumber?: string;
      supplierCode?: string;
      supplierName?: string;
      logisticsProvider?: string;
      productName?: string;
      palletCount?: number;
      plannedPallets?: ReceptionDoc["plannedPallets"];
    };
    const receptionId = response?.receptionId;
    if (!receptionId) throw new Error("create_reception returned no receptionId");
    if (data.plannedPallets && !Array.isArray(response.plannedPallets)) {
      throw new Error("create_reception returned no canonical plannedPallets");
    }
    // The callable is the source of truth. Do not add a second client read
    // here: it can fail under a stricter membership rule after the authorized
    // write already succeeded and would incorrectly surface a generic save error.
    return {
      ...data,
      id: receptionId,
      evidenceId: response.evidenceId,
      organizationId: this.orgId,
      folio: response.folio ?? data.folio,
      scheduledDate: response.scheduledDate ?? data.scheduledDate,
      purchaseOrderId: response.purchaseOrderId ?? data.purchaseOrderId,
      purchaseOrderNumber: response.purchaseOrderNumber ?? data.purchaseOrderNumber,
      supplierCode: response.supplierCode ?? data.supplierCode,
      supplierName: response.supplierName ?? data.supplierName,
      logisticsProvider: response.logisticsProvider ?? data.logisticsProvider,
      productName: response.productName ?? data.productName,
      palletCount: response.palletCount ?? data.palletCount,
      ...(response.plannedPallets ? { plannedPallets: response.plannedPallets } : {}),
    } as unknown as ReceptionDoc;
  }

  async editReception(
    receptionId: string,
    data: ReceptionCreateInput,
    lines: Array<
      Omit<ReceptionLineDoc, "id" | "createdAt" | "updatedAt" | "organizationId" | "receptionId">
    >,
    actorUserId: string,
    operationId: string,
  ): Promise<ReceptionDoc> {
    const edit = httpsCallable(getFunctions(), "edit_reception");
    const result = await edit({
      operationId,
      receptionId,
      warehouseId: data.warehouseId,
      supplierId: data.supplierId,
      purchaseOrderId: data.purchaseOrderId,
      purchaseOrderNumber: data.purchaseOrderNumber,
      folio: data.folio,
      scheduledDate: data.scheduledDate,
      supplierCode: data.supplierCode,
      supplierName: data.supplierName,
      logisticsProvider: data.logisticsProvider,
      plannedPallets: data.plannedPallets,
      lines: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unit: line.unit,
        lot: line.lot || null,
      })),
    });
    const response = result.data as {
      receptionId?: string;
      folio?: string;
      scheduledDate?: string;
      purchaseOrderId?: string;
      purchaseOrderNumber?: string;
      supplierCode?: string;
      supplierName?: string;
      logisticsProvider?: string;
      productName?: string;
      palletCount?: number;
      version?: number;
      plannedPallets?: ReceptionDoc["plannedPallets"];
    };
    if (response?.receptionId !== receptionId || !Array.isArray(response.plannedPallets)) {
      throw new Error("edit_reception returned an incomplete canonical reception");
    }
    return {
      ...data,
      id: receptionId,
      organizationId: this.orgId,
      folio: response.folio ?? data.folio,
      scheduledDate: response.scheduledDate ?? data.scheduledDate,
      purchaseOrderId: response.purchaseOrderId ?? data.purchaseOrderId,
      purchaseOrderNumber: response.purchaseOrderNumber ?? data.purchaseOrderNumber,
      supplierCode: response.supplierCode ?? data.supplierCode,
      supplierName: response.supplierName ?? data.supplierName,
      logisticsProvider: response.logisticsProvider ?? data.logisticsProvider,
      productName: response.productName ?? data.productName,
      palletCount: response.palletCount ?? response.plannedPallets.length,
      plannedPallets: response.plannedPallets,
      version: response.version,
    } as unknown as ReceptionDoc;
  }

  // Update reception
  async updateReception(
    receptionId: string,
    data: Partial<ReceptionDoc>,
    actorUserId: string,
    operationId: string,
  ): Promise<ReceptionDoc> {
    return this.update(receptionId, data, actorUserId, operationId);
  }

  async saveEvidence(
    receptionId: string,
    evidencePhotos: {
      trailer?: string;
      product?: string;
      documentation?: string;
    },
    operationId: string,
  ): Promise<void> {
    const save = httpsCallable(getFunctions(), "save_evidence");
    await save({ receptionId, evidencePhotos, operationId });
  }

  async validatePalletScan(
    receptionId: string,
    qrIdentifier: string,
    warehouseId: string,
  ): Promise<{
    receptionId: string;
    palletId?: string;
    qrIdentifier: string;
    status: "PLANNED" | "IN_CAPTURE";
    lot?: string;
    expiryDate?: string;
    activated: false;
  }> {
    const validate = httpsCallable(getFunctions(), "validate_reception_pallet_scan");
    const result = await validate({ receptionId, qrIdentifier, warehouseId });
    return result.data as {
      receptionId: string;
      palletId?: string;
      qrIdentifier: string;
      status: "PLANNED" | "IN_CAPTURE";
      lot?: string;
      expiryDate?: string;
      activated: false;
    };
  }

  async savePalletCapture(
    receptionId: string,
    qrIdentifier: string,
    lot: string,
    expiryDate: string,
    operationId: string,
  ): Promise<void> {
    const save = httpsCallable(getFunctions(), "save_reception_pallet_capture");
    await save({
      receptionId,
      qrIdentifier,
      lot: lot || null,
      expiryDate: expiryDate || null,
      operationId,
    });
  }

  // Delete reception (and its lines/pallets)
  async deleteReception(
    receptionId: string,
    actorUserId: string,
    operationId: string,
  ): Promise<void> {
    await this.delete(receptionId, actorUserId, operationId);

    // Also delete lines and pallets in a batch
    const batch = writeBatch(this.db);

    // Delete lines
    const linesSnap = await getDocs(
      query(
        collection(this.db, `organizations/${this.orgId}/receptions/${receptionId}/lines`),
        where("organizationId", "==", this.orgId),
      ),
    );
    linesSnap.docs.forEach((d) => batch.delete(d.ref));

    // Delete pallets
    const palletsSnap = await getDocs(
      query(
        collection(this.db, `organizations/${this.orgId}/receptions/${receptionId}/pallets`),
        where("organizationId", "==", this.orgId),
      ),
    );
    palletsSnap.docs.forEach((d) => batch.delete(d.ref));

    await batch.commit();
  }
}

export class ReceptionLineService extends BaseService<ReceptionLineDoc> {
  protected collectionPath = "organizations/{orgId}/receptions/{receptionId}/lines";
  protected fromFirestore(doc: any): ReceptionLineDoc {
    return { id: doc.id, ...doc.data() } as ReceptionLineDoc;
  }
  protected toFirestore(data: Partial<ReceptionLineDoc>) {
    return data;
  }
  protected getAuditEntityType() {
    return "reception_line";
  }

  constructor(
    db: Firestore,
    orgId: string,
    private receptionId: string,
  ) {
    super(db, orgId);
  }

  protected getCollectionRef() {
    return collection(this.db, `organizations/${this.orgId}/receptions/${this.receptionId}/lines`);
  }

  async getByReception(receptionId: string): Promise<ReceptionLineDoc[]> {
    const result = await this.getAll({
      where: [["receptionId", "==", receptionId]],
    });
    return result.data;
  }
}

export class PalletService extends BaseService<PalletDoc> {
  protected collectionPath = "organizations/{orgId}/receptions/{receptionId}/pallets";
  protected fromFirestore(doc: any): PalletDoc {
    return { id: doc.id, ...doc.data() } as PalletDoc;
  }
  protected toFirestore(data: Partial<PalletDoc>) {
    return data;
  }
  protected getAuditEntityType() {
    return "pallet";
  }

  constructor(
    db: Firestore,
    orgId: string,
    private receptionId?: string,
  ) {
    super(db, orgId);
  }

  // Override to handle both subcollection and collection group
  protected getCollectionRefForReception(receptionId: string): CollectionReference<DocumentData> {
    return collection(this.db, `organizations/${this.orgId}/receptions/${receptionId}/pallets`);
  }

  async getByQR(qrIdentifier: string, authorizedWarehouseIds: string[]): Promise<PalletDoc | null> {
    if (authorizedWarehouseIds.length === 0) return null;
    const results = await this.collectionGroupQuery("pallets", {
      where: [
        ["qrIdentifier", "==", qrIdentifier],
        [
          "warehouseId",
          authorizedWarehouseIds.length === 1 ? "==" : "in",
          authorizedWarehouseIds.length === 1 ? authorizedWarehouseIds[0] : authorizedWarehouseIds,
        ],
      ],
      limit: 1,
    });
    return results[0] || null;
  }

  async getByReception(
    receptionId: string,
    authorizedWarehouseIds: string[],
  ): Promise<PalletDoc[]> {
    if (authorizedWarehouseIds.length === 0) return [];
    return this.collectionGroupQuery("pallets", {
      where: [
        ["receptionId", "==", receptionId],
        [
          "warehouseId",
          authorizedWarehouseIds.length === 1 ? "==" : "in",
          authorizedWarehouseIds.length === 1 ? authorizedWarehouseIds[0] : authorizedWarehouseIds,
        ],
      ],
      limit: 43,
    });
  }

  async getByWarehouse(warehouseId: string, status?: PalletDoc["status"]): Promise<PalletDoc[]> {
    const whereClauses: Array<[string, any, any]> = [["warehouseId", "==", warehouseId]];
    if (status) whereClauses.push(["status", "==", status]);
    return this.collectionGroupQuery("pallets", {
      where: whereClauses,
      limit: 43,
    });
  }

  // Create multiple pallets in a transaction with inventory movements
  async createPalletsForReception(
    receptionId: string,
    pallets: Array<
      Omit<
        PalletDoc,
        "id" | "createdAt" | "updatedAt" | "organizationId" | "receptionId" | "expiryDate"
      > & {
        lot?: string;
        expiryDate?: Timestamp | Date | null;
      }
    >,
    actorUserId: string,
    operationId: string,
  ): Promise<PalletDoc[]> {
    const register = httpsCallable(getFunctions(), "register_reception_pallet");
    const created: PalletDoc[] = [];
    for (const [index, pallet] of pallets.entries()) {
      const operation = pallets.length === 1 ? operationId : `${operationId}-${index}`;
      const result = await register({
        receptionId,
        warehouseId: pallet.warehouseId,
        productId: pallet.productId,
        qrIdentifier: pallet.qrIdentifier,
        quantity: pallet.quantity,
        unit: pallet.unit,
        lot: pallet.lot || null,
        expiryDate:
          pallet.expiryDate instanceof Date
            ? pallet.expiryDate.toISOString().slice(0, 10)
            : pallet.expiryDate instanceof Timestamp
              ? pallet.expiryDate.toDate().toISOString().slice(0, 10)
              : null,
        operationId: operation,
      });
      const palletId = (result.data as { palletId?: string })?.palletId;
      if (!palletId) throw new Error("register_reception_pallet returned no palletId");
      created.push({ ...pallet, id: palletId, receptionId } as PalletDoc);
    }
    return created;
  }

  async updateStatus(
    palletId: string,
    status: PalletDoc["status"],
    actorUserId: string,
    operationId: string,
  ): Promise<void> {
    // Need to find which reception this pallet belongs to
    const pallet = await this.getById(palletId);
    if (!pallet) throw new Error("Pallet not found");

    const receptionId = pallet.receptionId;
    const ref = doc(
      this.db,
      `organizations/${this.orgId}/receptions/${receptionId}/pallets/${palletId}`,
    );
    await updateDoc(ref, { status, updatedAt: serverTimestamp() });
  }
}

export class InventoryMovementService extends BaseService<InventoryMovementDoc> {
  protected collectionPath = "organizations/{orgId}/inventory_movements";
  protected fromFirestore(doc: any): InventoryMovementDoc {
    return { id: doc.id, ...doc.data() } as InventoryMovementDoc;
  }
  protected toFirestore(data: Partial<InventoryMovementDoc>) {
    return data;
  }
  protected getAuditEntityType() {
    return "inventory_movement";
  }

  async getByWarehouseAndProduct(
    warehouseId: string,
    productId: string,
  ): Promise<InventoryMovementDoc[]> {
    const result = await this.getAll({
      where: [
        ["warehouseId", "==", warehouseId],
        ["productId", "==", productId],
      ],
    });
    return result.data;
  }

  async getByOperationId(operationId: string): Promise<InventoryMovementDoc[]> {
    return this.collectionGroupQuery("inventory_movements", {
      where: [["operationId", "==", operationId]],
    });
  }

  // Get current stock for a product in a warehouse (sum of RECEIPT - SHIPMENT - ADJUSTMENT)
  async getCurrentStock(warehouseId: string, productId: string): Promise<number> {
    const movements = await this.getByWarehouseAndProduct(warehouseId, productId);
    return movements.reduce((sum, m) => {
      if (m.movementType === "RECEIPT" || m.movementType === "TRANSFER") return sum + m.quantity;
      if (m.movementType === "SHIPMENT" || m.movementType === "ADJUSTMENT") return sum - m.quantity;
      return sum;
    }, 0);
  }
}

export function validateShipmentCompletion(
  shipment: Pick<ShipmentDoc, "status" | "lines">,
  stockByProduct: ReadonlyMap<string, number>,
): void {
  if (shipment.status === "COMPLETED") {
    throw new Error("El embarque ya está completado");
  }
  if (shipment.status === "CANCELLED") {
    throw new Error("No se puede completar un embarque cancelado");
  }

  const requestedByProduct = new Map<string, number>();
  for (const line of shipment.lines) {
    if (line.palletsScanned.length !== line.quantity) {
      throw new Error(
        `Producto ${line.productId}: se declararon ${line.quantity} tarimas pero solo se escanearon ${line.palletsScanned.length}`,
      );
    }
    requestedByProduct.set(
      line.productId,
      (requestedByProduct.get(line.productId) ?? 0) + line.quantity,
    );
  }

  for (const [productId, requested] of requestedByProduct) {
    const available = stockByProduct.get(productId) ?? 0;
    if (available < requested) {
      throw new Error(
        `Stock insuficiente para ${productId}: disponibles ${available}, requeridas ${requested}`,
      );
    }
  }
}

export class ShipmentService extends BaseService<ShipmentDoc> {
  protected collectionPath = "organizations/{orgId}/shipments";
  protected fromFirestore(doc: any): ShipmentDoc {
    return { id: doc.id, ...doc.data() } as ShipmentDoc;
  }
  protected toFirestore(data: Partial<ShipmentDoc>) {
    return data;
  }
  protected getAuditEntityType() {
    return "shipment";
  }

  async getByWarehouse(
    warehouseId: string,
    status?: ShipmentDoc["status"],
  ): Promise<ShipmentDoc[]> {
    const whereClauses: Array<[string, any, any]> = [["warehouseId", "==", warehouseId]];
    if (status) whereClauses.push(["status", "==", status]);
    const result = await this.getAll({ where: whereClauses });
    return result.data;
  }

  async advanceStatus(
    shipmentId: string,
    status: ShipmentDoc["status"],
    actorUserId: string,
    operationId: string,
  ): Promise<void> {
    await this.update(shipmentId, { status }, actorUserId, operationId);
  }

  // Get shipment by ID (for detail view)
  async getById(shipmentId: string): Promise<ShipmentDoc | null> {
    return super.getById(shipmentId);
  }

  // Validate stock availability for all shipment lines
  async validateStock(
    warehouseId: string,
    lines: ShipmentLine[],
  ): Promise<{
    valid: boolean;
    missing: Array<{
      productId: string;
      requested: number;
      available: number;
    }>;
  }> {
    const inventoryService = new InventoryService(this.db, this.orgId);
    const missing: Array<{
      productId: string;
      requested: number;
      available: number;
    }> = [];

    for (const line of lines) {
      const available = await inventoryService.getCurrentStock(warehouseId, line.productId);
      if (available < line.quantity) {
        missing.push({
          productId: line.productId,
          requested: line.quantity,
          available,
        });
      }
    }

    return { valid: missing.length === 0, missing };
  }

  // Create shipment (status: PROGRAMMED) with stock validation
  async createShipment(
    data: Omit<ShipmentDoc, "id" | "createdAt" | "updatedAt" | "organizationId"> & {
      warehouseId: string;
      lines: ShipmentLine[];
      validateStock?: boolean;
    },
    actorUserId: string,
    operationId: string,
  ): Promise<ShipmentDoc> {
    // Validate stock if requested (default true for non-draft shipments)
    if (data.validateStock !== false) {
      const validation = await this.validateStock(data.warehouseId, data.lines);
      if (!validation.valid) {
        const details = validation.missing
          .map((m) => `${m.productId}: pedidas ${m.requested}, disponibles ${m.available}`)
          .join("; ");
        throw new Error(`Stock insuficiente: ${details}`);
      }
    }

    const shipmentData = {
      ...data,
      status: "PROGRAMMED" as ShipmentDoc["status"],
      organizationId: this.orgId,
    };

    return this.create(shipmentData, actorUserId, operationId);
  }

  // Scan a pallet (step 2 - IN_PROGRESS)
  async scanPallet(
    shipmentId: string,
    palletId: string,
    productId: string,
    actorUserId: string,
    operationId: string,
  ): Promise<ShipmentDoc> {
    const shipment = await this.getById(shipmentId);
    if (!shipment) throw new Error("Embarque no encontrado");

    // Check if pallet already scanned
    if (shipment.lines.some((l) => l.palletsScanned.includes(palletId))) {
      throw new Error("Esta tarima ya fue escaneada en este embarque");
    }

    // Find the line for this product
    const lineIndex = shipment.lines.findIndex((l) => l.productId === productId);
    if (lineIndex === -1) {
      throw new Error("El producto de esta tarima no está en el embarque");
    }

    const updatedLines = [...shipment.lines];
    updatedLines[lineIndex] = {
      ...updatedLines[lineIndex],
      palletsScanned: [...updatedLines[lineIndex].palletsScanned, palletId],
    };

    const newStatus = shipment.status === "PROGRAMMED" ? "IN_PROGRESS" : shipment.status;

    await this.update(
      shipmentId,
      {
        lines: updatedLines,
        status: newStatus,
      },
      actorUserId,
      operationId,
    );

    return this.getById(shipmentId) as Promise<ShipmentDoc>;
  }

  // Complete shipment (step 3 - COMPLETED) with atomic stock reduction
  async completeShipment(
    shipmentId: string,
    actorUserId: string,
    operationId: string,
  ): Promise<ShipmentDoc> {
    const confirmShipment = httpsCallable(getFunctions(), "confirm_shipment");
    try {
      await confirmShipment({ shipmentId, operationId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Shipment confirmation failed";
      throw new Error(`Authorized shipment confirmation failed: ${message}`);
    }
    return this.getById(shipmentId) as Promise<ShipmentDoc>;

    /* istanbul ignore next -- retained only as migration reference; unreachable by design. */
    const shipmentRef = doc(this.db, `organizations/${this.orgId}/shipments/${shipmentId}`);
    const shipmentBeforeTransaction = await getDoc(shipmentRef);
    if (!shipmentBeforeTransaction.exists()) throw new Error("Embarque no encontrado");
    const shipmentBeforeData = shipmentBeforeTransaction.data() as ShipmentDoc;
    const productIds = [...new Set(shipmentBeforeData.lines.map((line) => line.productId))].sort();
    const movementSnapshots = await Promise.all(
      productIds.map((productId) =>
        getDocs(
          query(
            collection(this.db, `organizations/${this.orgId}/inventory_movements`),
            where("warehouseId", "==", shipmentBeforeData.warehouseId),
            where("productId", "==", productId),
          ),
        ),
      ),
    );
    const movementRefs = movementSnapshots.flatMap((snapshot) =>
      snapshot.docs.map((movement) => movement.ref),
    );
    const lockRefs = productIds.map((productId) =>
      doc(
        this.db,
        `organizations/${this.orgId}/inventory_locks/${shipmentBeforeData.warehouseId}_${productId}`,
      ),
    );

    // The Web SDK cannot execute a query through a transaction. The query
    // result is therefore a bounded snapshot; a trusted backend transaction
    // is required for production-grade revalidation against newly-added
    // inventory movements (see handoff).
    await runTransaction(this.db, async (tx) => {
      const shipmentSnap = await tx.get(shipmentRef);
      for (const lockRef of lockRefs) await tx.get(lockRef);
      const movementReads: any[] = [];
      for (const movementRef of movementRefs) movementReads.push(await tx.get(movementRef));
      if (!shipmentSnap.exists()) throw new Error("Embarque no encontrado");
      const shipment = shipmentSnap.data() as ShipmentDoc;

      // Read the shipment, the bounded movement snapshot, and deterministic
      // product locks before writing. A concurrent confirmation conflicts on
      // the same lock document and Firestore retries it against the shipment.
      const stockByProduct = new Map<string, number>();
      productIds.forEach((productId, productIndex) => {
        const firstMovementIndex = movementSnapshots
          .slice(0, productIndex)
          .reduce((count, snapshot) => count + snapshot.docs.length, 0);
        const movementCount = movementSnapshots[productIndex].docs.length;
        const available = movementReads
          .slice(firstMovementIndex, firstMovementIndex + movementCount)
          .reduce((stock: number, movement: any) => {
            const data = movement.data() as InventoryMovementDoc;
            if (
              data.direction === "IN" ||
              data.movementType === "RECEIPT" ||
              data.movementType === "TRANSFER"
            ) {
              return stock + data.quantity;
            }
            if (data.direction === "OUT" || data.movementType === "SHIPMENT") {
              return stock - data.quantity;
            }
            return stock;
          }, 0);
        stockByProduct.set(productId, available);
      });
      validateShipmentCompletion(shipment, stockByProduct);

      lockRefs.forEach((lockRef) =>
        tx.set(
          lockRef,
          {
            organizationId: this.orgId,
            updatedAt: serverTimestamp(),
            operationId,
          },
          { merge: true },
        ),
      );

      tx.update(shipmentRef, {
        status: "COMPLETED",
        updatedAt: serverTimestamp(),
      });

      // Create inventory movements for each line (SHIPMENT = OUT)
      for (const line of shipment.lines) {
        const movementRef = doc(
          collection(this.db, `organizations/${this.orgId}/inventory_movements`),
        );
        tx.set(movementRef, {
          organizationId: this.orgId,
          warehouseId: shipment.warehouseId,
          productId: line.productId,
          movementType: "SHIPMENT",
          quantity: line.quantity,
          unit: line.unit,
          lot: "",
          expiryDate: null,
          direction: "OUT",
          operationId,
          actorUserId,
          occurredAt: serverTimestamp(),
        });
      }

      // Audit event
      const auditRef = doc(
        this.db,
        `organizations/${this.orgId}/audit_events`,
        crypto.randomUUID(),
      );
      tx.set(auditRef, {
        entityType: "shipment",
        entityId: shipmentId,
        action: "COMPLETE",
        actorUserId,
        operationId,
        metadata: JSON.stringify({ lines: shipment.lines.length }),
        occurredAt: serverTimestamp(),
      });
    });

    return this.getById(shipmentId) as Promise<ShipmentDoc>;
  }

  // Cancel shipment
  async cancelShipment(
    shipmentId: string,
    actorUserId: string,
    operationId: string,
  ): Promise<ShipmentDoc> {
    const shipment = await this.getById(shipmentId);
    if (!shipment) throw new Error("Embarque no encontrado");

    if (shipment.status === "COMPLETED") {
      throw new Error("No se puede cancelar un embarque completado");
    }

    await this.update(shipmentId, { status: "CANCELLED" }, actorUserId, operationId);
    return this.getById(shipmentId) as Promise<ShipmentDoc>;
  }

  // Get shipments by status for a warehouse
  async getByStatus(warehouseId: string, status: ShipmentDoc["status"]): Promise<ShipmentDoc[]> {
    const result = await this.getAll({
      where: [
        ["warehouseId", "==", warehouseId],
        ["status", "==", status],
      ],
    });
    return result.data;
  }
}

export class LotCaducidadService extends BaseService<LotCaducidadDoc> {
  protected collectionPath = "organizations/{orgId}/lotes_caducidades";
  protected fromFirestore(doc: any): LotCaducidadDoc {
    return { id: doc.id, ...doc.data() } as LotCaducidadDoc;
  }
  protected toFirestore(data: Partial<LotCaducidadDoc>) {
    return data;
  }
  protected getAuditEntityType() {
    return "lot_caducidad";
  }

  async getByWarehouse(warehouseId: string): Promise<LotCaducidadDoc[]> {
    const result = await this.getAll({
      where: [["warehouseId", "==", warehouseId]],
    });
    return result.data;
  }

  async getByProduct(warehouseId: string, productId: string): Promise<LotCaducidadDoc[]> {
    const result = await this.getAll({
      where: [
        ["warehouseId", "==", warehouseId],
        ["productId", "==", productId],
      ],
    });
    return result.data;
  }

  async upsertLot(
    data: Omit<LotCaducidadDoc, "id" | "createdAt" | "updatedAt" | "organizationId">,
    actorUserId: string,
    operationId: string,
  ): Promise<LotCaducidadDoc> {
    // Check if lot already exists for this product/warehouse/lot/month
    const existing = await this.getAll({
      where: [
        ["warehouseId", "==", data.warehouseId],
        ["productId", "==", data.productId],
        ["lot", "==", data.lot],
        ["monthKey", "==", data.monthKey],
      ],
      limit: 1,
    });

    if (existing.data.length > 0) {
      // Update existing
      return this.update(
        existing.data[0].id,
        { cajas: data.cajas, expiryDate: data.expiryDate },
        actorUserId,
        operationId,
      );
    } else {
      // Create new
      return this.create(data, actorUserId, operationId);
    }
  }

  async batchUpsertLots(
    lots: Array<Omit<LotCaducidadDoc, "id" | "createdAt" | "updatedAt" | "organizationId">>,
    actorUserId: string,
    operationId: string,
  ): Promise<LotCaducidadDoc[]> {
    const batch = writeBatch(this.db);
    const created: LotCaducidadDoc[] = [];
    const now = serverTimestamp();

    for (const lot of lots) {
      const existing = await this.getAll({
        where: [
          ["warehouseId", "==", lot.warehouseId],
          ["productId", "==", lot.productId],
          ["lot", "==", lot.lot],
          ["monthKey", "==", lot.monthKey],
        ],
        limit: 1,
      });

      if (existing.data.length > 0) {
        // Update
        const ref = this.getDocRef(existing.data[0].id);
        batch.update(ref, this.toFirestore({ ...lot, updatedAt: now as unknown as Timestamp }));
        created.push({
          ...existing.data[0],
          ...lot,
          updatedAt: now as unknown as Timestamp,
        } as LotCaducidadDoc);
      } else {
        // Create
        const id = crypto.randomUUID();
        const ref = this.getDocRef(id);
        const docData = this.toFirestore({
          ...lot,
          id,
          organizationId: this.orgId,
          createdAt: now,
          updatedAt: now,
        } as LotCaducidadDoc & {
          createdAt: any;
          updatedAt: any;
        });
        batch.set(ref, docData);
        created.push(docData as LotCaducidadDoc);
      }
    }

    await batch.commit();
    return created;
  }
}
