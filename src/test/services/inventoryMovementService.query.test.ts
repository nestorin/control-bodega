import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import { InventoryMovementService } from "../../services/firestore/domainServices";

type CapturedConstraint =
  | { kind: "where"; field: string; op: string; value: unknown }
  | { kind: "orderBy"; field: string; direction: "asc" | "desc" }
  | { kind: "limit"; value: number }
  | { kind: "startAfter"; value: unknown };

type QueryResult = {
  docs: Array<{ id: string; data: () => Record<string, unknown> }>;
};

const firestoreMock = vi.hoisted(() => {
  const state: {
    constraints: CapturedConstraint[];
    queryResults: QueryResult[];
  } = {
    constraints: [],
    queryResults: [],
  };

  return {
    state,
    collection: vi.fn(() => ({ id: "movement-collection" })),
    query: vi.fn((...args: unknown[]) => {
      state.constraints = args.slice(1) as CapturedConstraint[];
      return { id: "movement-query" };
    }),
    getDocs: vi.fn(async (): Promise<QueryResult> => state.queryResults.shift() ?? { docs: [] }),
    where: vi.fn((field: string, op: string, value: unknown) => ({
      kind: "where" as const,
      field,
      op,
      value,
    })),
    orderBy: vi.fn((field: string, direction: "asc" | "desc") => ({
      kind: "orderBy" as const,
      field,
      direction,
    })),
    limit: vi.fn((value: number) => ({ kind: "limit" as const, value })),
    startAfter: vi.fn((value: unknown) => ({ kind: "startAfter" as const, value })),
  };
});

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    collection: firestoreMock.collection as unknown as typeof actual.collection,
    query: firestoreMock.query as unknown as typeof actual.query,
    getDocs: firestoreMock.getDocs as unknown as typeof actual.getDocs,
    where: firestoreMock.where as unknown as typeof actual.where,
    orderBy: firestoreMock.orderBy as unknown as typeof actual.orderBy,
    limit: firestoreMock.limit as unknown as typeof actual.limit,
    startAfter: firestoreMock.startAfter as unknown as typeof actual.startAfter,
  };
});

const ORG_ID = "org_exepa_001";
const WAREHOUSE_ID = "wh_tehuacan_1";
const PRODUCT_ID = "prod_legacy_001";

function legacyMovementData(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG_ID,
    warehouseId: WAREHOUSE_ID,
    productId: PRODUCT_ID,
    movementType: "RECEIPT",
    quantity: 10,
    unit: "cajas",
    operationId: "operation-1",
    actorUserId: "user-1",
    occurredAt: Timestamp.fromDate(new Date("2026-09-19T09:42:00.000Z")),
    ...overrides,
  };
}

function orderByConstraints(): Array<Extract<CapturedConstraint, { kind: "orderBy" }>> {
  return firestoreMock.state.constraints.filter(
    (constraint): constraint is Extract<CapturedConstraint, { kind: "orderBy" }> =>
      constraint.kind === "orderBy",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  firestoreMock.state.constraints = [];
  firestoreMock.state.queryResults = [];
});

describe("InventoryMovementService query invariants", () => {
  it("returns movements without createdAt and builds no orderBy constraint", async () => {
    firestoreMock.state.queryResults.push({
      docs: [{ id: "movement-1", data: () => legacyMovementData() }],
    });
    const service = new InventoryMovementService({} as never, ORG_ID);

    const result = await service.getByWarehouseAndProduct(WAREHOUSE_ID, PRODUCT_ID);

    expect(result.map((movement) => movement.id)).toEqual(["movement-1"]);
    expect(orderByConstraints()).toEqual([]);
  });

  it("computes current stock from movements that carry no createdAt", async () => {
    firestoreMock.state.queryResults.push({
      docs: [
        { id: "movement-receipt", data: () => legacyMovementData({ quantity: 40 }) },
        {
          id: "movement-shipment",
          data: () =>
            legacyMovementData({
              movementType: "SHIPMENT",
              quantity: 12,
              operationId: "operation-2",
            }),
        },
        {
          id: "movement-adjustment",
          data: () =>
            legacyMovementData({
              movementType: "ADJUSTMENT",
              quantity: 3,
              operationId: "operation-3",
            }),
        },
      ],
    });
    const service = new InventoryMovementService({} as never, ORG_ID);

    const stock = await service.getCurrentStock(WAREHOUSE_ID, PRODUCT_ID);

    expect(stock).toBe(25);
    expect(orderByConstraints()).toEqual([]);
  });
});
