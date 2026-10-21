import { useState, useEffect, useCallback, useRef } from "react";
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  QueryConstraint,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  Unsubscribe,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

interface UseCollectionOptions<T> {
  constraints?: QueryConstraint[];
  mapFn?: (doc: QueryDocumentSnapshot) => T;
  enabled?: boolean;
}

const EMPTY_CONSTRAINTS: QueryConstraint[] = [];

interface UseCollectionResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCollection<T>(
  db: Firestore | null,
  collectionPath: string,
  options: UseCollectionOptions<T> = {},
): UseCollectionResult<T> {
  const { constraints = EMPTY_CONSTRAINTS, mapFn, enabled = true } = options;
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const lastDocRef = useRef<DocumentSnapshot | null>(null);
  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const isMountedRef = useRef(true);

  const buildQuery = useCallback(() => {
    if (!db) throw new Error("Firestore not initialized");
    const colRef = collection(db, collectionPath);
    return query(colRef, ...constraints, orderBy("createdAt", "desc"), limit(50));
  }, [db, collectionPath, constraints]);

  const subscribe = useCallback(() => {
    if (!enabled || !db || !collectionPath) {
      setLoading(false);
      setData([]);
      return;
    }
    unsubscribeRef.current?.();
    setLoading(true);
    setError(null);

    const q = buildQuery();
    unsubscribeRef.current = onSnapshot(
      q,
      (snap) => {
        if (!isMountedRef.current) return;
        const items = snap.docs.map((d) => (mapFn ? mapFn(d) : ({ id: d.id, ...d.data() } as T)));
        setData(items);
        setHasMore(snap.docs.length === 50);
        lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
        setLoading(false);
      },
      (err) => {
        if (!isMountedRef.current) return;
        setError(err);
        setLoading(false);
      },
    );
  }, [buildQuery, enabled, mapFn, db]);

  const loadMore = useCallback(async () => {
    if (!lastDocRef.current || loading || !hasMore || !db) return;
    setLoading(true);
    try {
      const q = query(buildQuery(), startAfter(lastDocRef.current), limit(50));
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => (mapFn ? mapFn(d) : ({ id: d.id, ...d.data() } as T)));
      setData((prev) => [...prev, ...items]);
      setHasMore(snap.docs.length === 50);
      lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [buildQuery, loading, hasMore, db]);

  const refresh = useCallback(async () => {
    lastDocRef.current = null;
    subscribe();
  }, [subscribe]);

  useEffect(() => {
    isMountedRef.current = true;
    subscribe();
    return () => {
      isMountedRef.current = false;
      unsubscribeRef.current?.();
    };
  }, [subscribe]);

  return { data, loading, error, hasMore, loadMore, refresh };
}

interface UseDocumentOptions<T> {
  mapFn?: (doc: DocumentSnapshot) => T;
  enabled?: boolean;
}

interface UseDocumentResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useDocument<T>(
  db: Firestore | null,
  docPath: string,
  options: UseDocumentOptions<T> = {},
): UseDocumentResult<T> {
  const { mapFn, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const isMountedRef = useRef(true);

  const subscribe = useCallback(() => {
    if (!enabled || !db) return;
    setLoading(true);
    setError(null);

    const docRef = doc(db, docPath);
    unsubscribeRef.current = onSnapshot(
      docRef,
      (snap) => {
        if (!isMountedRef.current) return;
        if (snap.exists()) {
          setData(mapFn ? mapFn(snap) : ({ id: snap.id, ...snap.data() } as T));
        } else {
          setData(null);
        }
        setLoading(false);
      },
      (err) => {
        if (!isMountedRef.current) return;
        setError(err);
        setLoading(false);
      },
    );
  }, [db, docPath, enabled, mapFn]);

  const refresh = useCallback(async () => {
    if (!db) return;
    const docRef = doc(db, docPath);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      setData(mapFn ? mapFn(snap) : ({ id: snap.id, ...snap.data() } as T));
    } else {
      setData(null);
    }
  }, [db, docPath, mapFn]);

  useEffect(() => {
    isMountedRef.current = true;
    subscribe();
    return () => {
      isMountedRef.current = false;
      unsubscribeRef.current?.();
    };
  }, [subscribe]);

  return { data, loading, error, refresh };
}

// Offline Queue Hook
interface QueuedOperation {
  id: string;
  type: "create" | "update" | "delete";
  collectionPath: string;
  docId?: string;
  data?: any;
  timestamp: number;
  retryCount: number;
  operationId: string;
}

export function resolveOfflineQueuePath(path: string, orgId: string): string {
  const resolvedPath = path.split("{orgId}").join(orgId);
  if (/\{[^}]+\}/.test(resolvedPath)) {
    throw new Error(`Offline queue path contains an unresolved token: ${resolvedPath}`);
  }
  return resolvedPath;
}

interface UseOfflineQueueResult {
  queue: QueuedOperation[];
  isOnline: boolean;
  syncing: boolean;
  enqueue: (op: Omit<QueuedOperation, "id" | "timestamp" | "retryCount">) => void;
  clearQueue: () => void;
}

export function useOfflineQueue(db: Firestore | null, orgId: string): UseOfflineQueueResult {
  const [queue, setQueue] = useState<QueuedOperation[]>([]);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [syncing, setSyncing] = useState(false);
  const processingRef = useRef(false);

  // Load queue from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(`offline_queue_${orgId}`);
    if (saved) {
      try {
        setQueue(JSON.parse(saved));
      } catch {
        setQueue([]);
      }
    }
  }, [orgId]);

  // Persist queue to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(`offline_queue_${orgId}`, JSON.stringify(queue));
  }, [queue, orgId]);

  // Online/offline detection
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => {
      setIsOnline(true);
      processQueue();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const enqueue = useCallback(
    (op: Omit<QueuedOperation, "id" | "timestamp" | "retryCount">) => {
      const newOp: QueuedOperation = {
        ...op,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        retryCount: 0,
      };
      setQueue((prev) => [...prev, newOp]);
      if (isOnline) processQueue();
    },
    [isOnline],
  );

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current || !isOnline || queue.length === 0 || !db) return;
    processingRef.current = true;
    setSyncing(true);

    for (const op of queue) {
      try {
        await executeOperation(db, orgId, op);
        setQueue((prev) => prev.filter((q) => q.id !== op.id));
      } catch (err) {
        if (op.retryCount >= 3) {
          console.error("Operation failed permanently:", op, err);
          setQueue((prev) => prev.filter((q) => q.id !== op.id));
        } else {
          setQueue((prev) =>
            prev.map((q) => (q.id === op.id ? { ...q, retryCount: q.retryCount + 1 } : q)),
          );
        }
      }
    }

    processingRef.current = false;
    setSyncing(false);
  }, [queue, isOnline, orgId, db]);

  return { queue, isOnline, syncing, enqueue, clearQueue };
}

async function executeOperation(db: Firestore, orgId: string, op: QueuedOperation) {
  const fullPath = resolveOfflineQueuePath(op.collectionPath, orgId);
  const ref = op.docId ? doc(db, fullPath, op.docId) : doc(collection(db, fullPath));

  switch (op.type) {
    case "create":
      await setDoc(ref, {
        ...op.data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      break;
    case "update":
      await updateDoc(ref, { ...op.data, updatedAt: serverTimestamp() });
      break;
    case "delete":
      await deleteDoc(ref);
      break;
  }
}
