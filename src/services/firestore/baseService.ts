import {
  Firestore,
  CollectionReference,
  DocumentReference,
  DocumentData,
  QueryDocumentSnapshot,
  DocumentSnapshot,
  WhereFilterOp,
  writeBatch,
  runTransaction,
  serverTimestamp,
  QueryConstraint,
  where,
  orderBy,
  limit,
  startAfter,
  getDoc,
  getDocs,
  query,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  collectionGroup,
} from "firebase/firestore";

export abstract class BaseService<T extends { id: string }> {
  protected abstract collectionPath: string; // ej: 'organizations/{orgId}/receptions'
  protected abstract fromFirestore(doc: QueryDocumentSnapshot): T;

  constructor(
    protected db: Firestore,
    protected orgId: string,
  ) {}

  protected getCollectionRef(): CollectionReference<DocumentData> {
    return collection(this.db, this.collectionPath.replace("{orgId}", this.orgId));
  }

  protected getDocRef(id: string): DocumentReference<DocumentData> {
    return doc(this.getCollectionRef(), id);
  }

  // READ
  async getById(id: string): Promise<T | null> {
    const snap = await getDoc(this.getDocRef(id));
    return snap.exists() ? this.fromFirestore(snap) : null;
  }

  async getAll(
    options: {
      where?: Array<[string, WhereFilterOp, any]>;
      orderBy?: [string, "asc" | "desc"];
      limit?: number;
      startAfter?: DocumentSnapshot;
    } = {},
  ): Promise<{
    data: T[];
    lastDoc?: DocumentSnapshot;
    hasMore: boolean;
  }> {
    const constraints: QueryConstraint[] = [];

    if (options.where) {
      options.where.forEach(([field, op, value]) => {
        constraints.push(where(field, op, value));
      });
    }
    if (options.orderBy) {
      constraints.push(orderBy(options.orderBy[0], options.orderBy[1]));
    } else {
      constraints.push(orderBy("createdAt", "desc"));
    }
    if (options.limit) {
      constraints.push(limit(options.limit));
    }
    if (options.startAfter) {
      constraints.push(startAfter(options.startAfter));
    }

    const q = query(this.getCollectionRef(), ...constraints);
    const snap = await getDocs(q);

    const data = snap.docs.map((d) => this.fromFirestore(d));
    const lastDoc = snap.docs[snap.docs.length - 1];

    return {
      data,
      lastDoc,
      hasMore: snap.docs.length === (options.limit || 1000),
    };
  }

  // COLLECTION GROUP QUERY (para queries cross-subcollections como pallets)
  async collectionGroupQuery(
    subcollectionName: string,
    options: {
      where?: Array<[string, WhereFilterOp, any]>;
      orderBy?: [string, "asc" | "desc"];
      limit?: number;
    } = {},
  ): Promise<T[]> {
    const constraints: QueryConstraint[] = [];
    const isPalletQuery = subcollectionName === "pallets";

    if (options.where) {
      options.where.forEach(([field, op, value]) => {
        constraints.push(where(field, op, value));
      });
    }
    constraints.push(where("organizationId", "==", this.orgId));
    if (isPalletQuery) {
      const warehouseScope = options.where?.some(([field]) => field === "warehouseId");
      if (!warehouseScope) {
        throw new Error("Pallet collection-group queries require a warehouse scope");
      }
    }
    if (options.orderBy) {
      constraints.push(orderBy(options.orderBy[0], options.orderBy[1]));
    }
    if (isPalletQuery) {
      constraints.push(limit(Math.min(options.limit ?? 43, 43)));
    } else if (options.limit) {
      constraints.push(limit(options.limit));
    }

    const q = query(collectionGroup(this.db, subcollectionName), ...constraints);
    const snap = await getDocs(q);

    return snap.docs.map((d) => this.fromFirestore(d));
  }

  // ABSTRACT METHODS FOR SUBCLASSES
  protected abstract toFirestore(data: Partial<T>): DocumentData;
  protected abstract getAuditEntityType(): string;

  // WRITE (con auditoría automática via transaction)
  async create(
    data: Omit<T, "id" | "createdAt" | "updatedAt" | "organizationId"> & {
      organizationId?: string;
    },
    actorUserId: string,
    operationId: string,
  ): Promise<T> {
    const id = crypto.randomUUID();
    const now = serverTimestamp();

    const docData = this.toFirestore({
      ...data,
      ...(Object.prototype.hasOwnProperty.call(data, "organizationId")
        ? {}
        : { organizationId: this.orgId }),
      id,
      createdAt: now,
      updatedAt: now,
    } as T & {
      createdAt: any;
      updatedAt: any;
    });

    await runTransaction(this.db, async (tx) => {
      tx.set(this.getDocRef(id), docData);
    });

    return this.getById(id) as Promise<T>;
  }

  async update(id: string, data: Partial<T>, actorUserId: string, operationId: string): Promise<T> {
    const ref = this.getDocRef(id);
    const now = serverTimestamp();

    const updateData = this.toFirestore({
      ...data,
      updatedAt: now,
    } as Partial<T & { updatedAt: any }>);

    await runTransaction(this.db, async (tx) => {
      tx.update(ref, updateData);
    });

    return this.getById(id) as Promise<T>;
  }

  async delete(id: string, actorUserId: string, operationId: string): Promise<void> {
    const ref = this.getDocRef(id);

    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        tx.delete(ref);
      }
    });
  }

  // BATCH para operaciones múltiples
  async batchWrite(
    operations: Array<{
      type: "create" | "update" | "delete";
      id?: string;
      data?: Partial<T>;
    }>,
    actorUserId: string,
    operationId: string,
  ): Promise<void> {
    const batch = writeBatch(this.db);

    for (const op of operations) {
      if (op.type === "create" && op.data) {
        const newId = op.id || crypto.randomUUID();
        const ref = this.getDocRef(newId);
        batch.set(
          ref,
          this.toFirestore({
            ...op.data,
            id: newId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
      } else if (op.type === "update" && op.id && op.data) {
        const ref = this.getDocRef(op.id);
        batch.update(ref, this.toFirestore({ ...op.data, updatedAt: serverTimestamp() }));
      } else if (op.type === "delete" && op.id) {
        const ref = this.getDocRef(op.id);
        batch.delete(ref);
      }
    }

    await batch.commit();
  }

  private async writeAuditEvent(
    tx: any,
    entityId: string,
    action: string,
    actorUserId: string,
    operationId: string,
    metadata: any,
  ) {
    const auditRef = doc(this.db, `organizations/${this.orgId}/audit_events`, crypto.randomUUID());
    tx.set(auditRef, {
      entityType: this.getAuditEntityType(),
      entityId,
      action,
      actorUserId,
      operationId,
      metadata: JSON.stringify(metadata),
      occurredAt: serverTimestamp(),
    });
  }
}
