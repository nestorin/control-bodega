/**
 * useImportLog Hook — Import history log for Configuracion
 * Handles paginated loading of import logs
 */

import { useState, useCallback, useEffect } from "react";
import { useAuthorization } from "@/hooks/useAuthorization";
import { getDb } from "@/services/firestoreBatch";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  startAfter,
  DocumentSnapshot,
} from "firebase/firestore";
import type { ImportLog } from "@/types/csvImport";

const ORG_ID = "org_exepa_001";
const PAGE_SIZE = 20;

export function useImportLog() {
  const { canQuery } = useAuthorization();

  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);

  const loadLogs = useCallback(
    async (append = false) => {
      if (!canQuery || isLoading) return;

      setIsLoading(true);

      try {
        const db = getDb();
        const logsRef = collection(db, `organizations/${ORG_ID}/importLogs`);

        let q = query(
          logsRef,
          where("organizationId", "==", ORG_ID),
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE),
        );

        if (append && lastDoc) {
          q = query(q, startAfter(lastDoc));
        }

        const snapshot = await getDocs(q);
        const newLogs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ImportLog[];

        if (append) {
          setLogs((prev) => [...prev, ...newLogs]);
        } else {
          setLogs(newLogs);
        }

        setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMore(newLogs.length === PAGE_SIZE);
      } catch (err) {
        console.error("Error loading import logs:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [canQuery, lastDoc],
  );

  // Initial load
  useEffect(() => {
    loadLogs(false);
  }, []);

  const loadMore = useCallback(async () => {
    await loadLogs(true);
  }, [loadLogs]);

  return {
    logs,
    isLoading,
    hasMore,
    loadMore,
  };
}
