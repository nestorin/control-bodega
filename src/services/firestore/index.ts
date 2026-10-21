export * from "./types";
export * from "./baseService";
export * from "./domainServices";
export * from "./inventoryService";

// Factory function to create all services for an organization
import { Firestore } from "firebase/firestore";
import {
  WarehouseService,
  SupplierService,
  ProductService,
  ConversionService,
  PurchaseOrderService,
  ReceptionService,
  ReceptionLineService,
  PalletService,
  InventoryMovementService,
  ShipmentService,
  LotCaducidadService,
} from "./domainServices";
import { InventoryService } from "./inventoryService";

export interface FirestoreServices {
  warehouses: WarehouseService;
  suppliers: SupplierService;
  products: ProductService;
  conversions: ConversionService;
  purchaseOrders: PurchaseOrderService;
  receptions: ReceptionService;
  pallets: PalletService;
  inventory: InventoryService;
  inventoryMovements: InventoryMovementService;
  shipments: ShipmentService;
  lotesCaducidades: LotCaducidadService;
}

export function createFirestoreServices(db: Firestore, orgId: string): FirestoreServices {
  return {
    warehouses: new WarehouseService(db, orgId),
    suppliers: new SupplierService(db, orgId),
    products: new ProductService(db, orgId),
    conversions: new ConversionService(db, orgId),
    purchaseOrders: new PurchaseOrderService(db, orgId),
    receptions: new ReceptionService(db, orgId),
    pallets: new PalletService(db, orgId),
    inventory: new InventoryService(db, orgId),
    inventoryMovements: new InventoryMovementService(db, orgId),
    shipments: new ShipmentService(db, orgId),
    lotesCaducidades: new LotCaducidadService(db, orgId),
  };
}

export function createReceptionLineService(
  db: Firestore,
  orgId: string,
  receptionId: string,
): ReceptionLineService {
  return new ReceptionLineService(db, orgId, receptionId);
}

export function createPalletServiceForReception(
  db: Firestore,
  orgId: string,
  receptionId: string,
): PalletService {
  return new PalletService(db, orgId, receptionId);
}
