import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import { BaseService } from "../../services/firestore/baseService";
import { LotCaducidadService } from "../../services/firestore/domainServices";

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
    collection: vi.fn(() => ({ id: "lot-collection" })),
    query: vi.fn((...args: unknown[]) => {
      state.constraints = args.slice(1) as CapturedConstraint[];
      return { id: "lot-query" };
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

type TestDoc = {
  id: string;
  createdAt?: unknown;
};

class TestService extends BaseService<TestDoc> {
  protected collectionPath = "organizations/{orgId}/test";
  protected fromFirestore(doc: QueryDocumentSnapshot): TestDoc {
    return { id: doc.id, ...doc.data() } as TestDoc;
  }
  protected toFirestore(data: Partial<TestDoc>): DocumentData {
    return data;
  }
  protected getAuditEntityType() {
    return "test";
  }
}

function legacyLotData() {
  return {
    organizationId: ORG_ID,
    warehouseId: WAREHOUSE_ID,
    productId: PRODUCT_ID,
    productName: "Legacy product",
    lot: "LOT-LEGACY-001",
    expiryDate: Timestamp.fromDate(new Date("2027-01-01T00:00:00.000Z")),
    monthKey: "Jan-27",
    cajas: 3,
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

describe("LotCaducidadService query invariants", () => {
  it("returns legacy warehouse lots without createdAt and builds no orderBy constraint", async () => {
    firestoreMock.state.queryResults.push({
      docs: [{ id: "legacy-lot-1", data: legacyLotData }],
    });
    const service = new LotCaducidadService({} as never, ORG_ID);

    const result = await service.getByWarehouse(WAREHOUSE_ID);

    expect(result.map((lot) => lot.id)).toEqual(["legacy-lot-1"]);
    expect(orderByConstraints()).toEqual([]);
  });

  it("returns legacy product lots without createdAt and builds no orderBy constraint", async () => {
    firestoreMock.state.queryResults.push({
      docs: [{ id: "legacy-lot-2", data: legacyLotData }],
    });
    const service = new LotCaducidadService({} as never, ORG_ID);

    const result = await service.getByProduct(WAREHOUSE_ID, PRODUCT_ID);

    expect(result.map((lot) => lot.id)).toEqual(["legacy-lot-2"]);
    expect(orderByConstraints()).toEqual([]);
  });

  it("updates an existing legacy lot without an orderBy existence lookup", async () => {
    firestoreMock.state.queryResults.push({
      docs: [{ id: "legacy-lot-3", data: legacyLotData }],
    });
    const service = new LotCaducidadService({} as never, ORG_ID);
    const input = {
      warehouseId: WAREHOUSE_ID,
      productId: PRODUCT_ID,
      productName: "Legacy product",
      lot: "LOT-LEGACY-001",
      expiryDate: Timestamp.fromDate(new Date("2027-01-01T00:00:00.000Z")),
      monthKey: "Jan-27",
      cajas: 4,
    };
    const updatedLot = {
      id: "legacy-lot-3",
      organizationId: ORG_ID,
      ...input,
      createdAt: Timestamp.now(),
    };
    const updateSpy = vi.spyOn(service, "update").mockResolvedValue(updatedLot);
    const createSpy = vi.spyOn(service, "create").mockResolvedValue({
      ...updatedLot,
      id: "duplicate-lot",
    });

    const result = await service.upsertLot(input, "actor-1", "operation-1");

    expect(orderByConstraints()).toEqual([]);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(
      "legacy-lot-3",
      { cajas: input.cajas, expiryDate: input.expiryDate },
      "actor-1",
      "operation-1",
    );
    expect(createSpy).not.toHaveBeenCalled();
    expect(result.id).toBe("legacy-lot-3");
  });
});

describe("BaseService.getAll ordering contract", () => {
  it("keeps createdAt descending as the default order", async () => {
    const service = new TestService({} as never, ORG_ID);

    await service.getAll();

    expect(orderByConstraints()).toEqual([
      { kind: "orderBy", field: "createdAt", direction: "desc" },
    ]);
  });

  it("adds no orderBy constraint when orderBy is null", async () => {
    const service = new TestService({} as never, ORG_ID);

    await service.getAll({ orderBy: null });

    expect(orderByConstraints()).toEqual([]);
  });
});
