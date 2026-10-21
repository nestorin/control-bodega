import { Timestamp } from "firebase/firestore";

export interface BaseDoc {
  id: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface PaginatedResult<T> {
  data: T[];
  lastDoc?: any;
  hasMore: boolean;
}

export interface QueryOptions {
  where?: Array<
    [
      string,
      (
        | "=="
        | "!="
        | ">"
        | ">="
        | "<"
        | "<="
        | "array-contains"
        | "array-contains-any"
        | "in"
        | "not-in"
      ),
      any,
    ]
  >;
  orderBy?: [string, "asc" | "desc"];
  limit?: number;
  startAfter?: any;
}

export type WhereFilterOp =
  | "=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "array-contains"
  | "array-contains-any"
  | "in"
  | "not-in";

export interface UserMembershipDoc extends BaseDoc {
  organizationId: string;
  warehouseId?: string | null;
  userId: string;
  role: "OPERATOR" | "SUPERVISOR" | "AUDITOR" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
}

export interface WarehouseDoc extends BaseDoc {
  organizationId: string;
  code: string;
  name: string;
  location?: string;
  manager?: string;
  active?: boolean;
}

export interface SupplierDoc extends BaseDoc {
  organizationId: string;
  code: string;
  name: string;
  tipo: "mercancia" | "logistica";
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface ProductDoc extends BaseDoc {
  organizationId: string;
  sku: string;
  name: string;
  unit: string;
  lotControlled: boolean;
  expiryControlled: boolean;
  conversionFactor?: number;
  supplierCodes?: string[];
  category?: string;
}

/** UI/catalog product shape shared by reception and configuration screens. */
export interface Producto {
  id: string;
  nombre: string;
  sku?: string;
  categoria?: string;
  unidad?: "cajas" | "piezas" | "kg";
  activo?: boolean;
  codigosProveedor?: string[];
}

export interface ConversionDoc extends BaseDoc {
  organizationId: string;
  productName: string;
  piecesPerBox: number;
  boxesPerPallet: number;
  weightKgPerBox?: string;
}

export interface PurchaseOrderDoc extends BaseDoc {
  organizationId: string;
  warehouseId: string;
  supplierId: string;
  number: string;
  status: "DRAFT" | "OPEN" | "RECEIVED" | "CLOSED" | "CANCELLED";
  lines: PurchaseOrderLine[];
}

export interface PurchaseOrderLine {
  productId: string;
  orderedQuantity: number;
  unit: string;
}

export interface ReceptionDoc extends BaseDoc {
  organizationId: string;
  warehouseId: string;
  purchaseOrderId?: string;
  supplierId?: string;
  status: "DRAFT" | "IN_PROGRESS" | "CONFIRMED" | "CANCELLED";
  operationId: string;
  receivedAt?: Timestamp;
  actorUserId: string;
  draftExpiresAt?: Timestamp;
  evidencePhotos?: {
    trailer?: string;
    product?: string;
    documentation?: string;
  };
  invoicePreviewPath?: string;
  invoicePreviewUrl?: string;
}

export interface ReceptionLineDoc extends BaseDoc {
  receptionId: string;
  productId: string;
  quantity: number;
  unit: string;
  lot?: string;
  expiryDate?: Timestamp;
  palletsCreated: number;
}

export interface PalletDoc extends BaseDoc {
  organizationId: string;
  warehouseId: string;
  receptionId: string;
  qrIdentifier: string;
  status: "CREATED" | "RECEIVED" | "STORED" | "BLOCKED";
  productId: string;
  quantity: number;
  unit: string;
  location?: string;
  lot?: string;
  expiryDate?: Timestamp;
}

export interface InventoryMovementDoc extends BaseDoc {
  organizationId: string;
  warehouseId: string;
  palletId?: string;
  productId: string;
  movementType: "RECEIPT" | "TRANSFER" | "ADJUSTMENT" | "SHIPMENT";
  direction?: "IN" | "OUT";
  quantity: number;
  unit: string;
  lot?: string;
  expiryDate?: Timestamp;
  operationId: string;
  actorUserId: string;
  occurredAt: Timestamp;
}

export interface ShipmentDoc extends BaseDoc {
  organizationId: string;
  warehouseId: string;
  clientName: string;
  status: "PROGRAMMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  lines: ShipmentLine[];
  evidencePhotos?: {
    trailer?: string;
    product?: string;
    documentation?: string;
  };
}

export interface ShipmentLine {
  productId: string;
  quantity: number;
  unit: string;
  palletsScanned: string[];
}

export interface AuditEventDoc extends BaseDoc {
  organizationId: string;
  warehouseId?: string;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string;
  operationId?: string;
  metadata?: string;
  occurredAt: Timestamp;
}

export interface LotCaducidadDoc extends BaseDoc {
  // e.g., "Dec-26"
  organizationId: string;
  warehouseId: string;
  productId: string;
  productName: string;
  lot: string;
  expiryDate: Timestamp;
  monthKey: string;
  cajas: number;
}
