import { uploadEvidence, uploadCaseEvidence } from "./api";

export interface OfflineEvidenceDraft {
  id: string;
  userId: string;
  idempotencyKey: string;
  caseId: string | null;
  name: string;
  type: string;
  ownerOrg: string;
  description: string | null;
  fileBlob: Blob;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: "DRAFT" | "QUEUED" | "UPLOADING" | "SYNCED" | "FAILED";
  progress: number;
  error?: string;
  evidenceId?: string;
  sha256?: string;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = "evichain-offline";
const DB_VERSION = 1;
const STORE_NAME = "evidence_drafts";

let dbInstance: IDBDatabase | null = null;
let isSyncingActive = false;

/**
 * Opens or initializes the offline IndexedDB database.
 * Never stores authentication credentials or session secrets.
 */
export async function openOfflineDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("IndexedDB is not supported in this environment.");
  }

  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("idempotencyKey", "idempotencyKey", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
  });
}

/**
 * Saves a new or updated offline evidence draft.
 */
export async function saveOfflineDraft(
  draftData: Omit<OfflineEvidenceDraft, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<OfflineEvidenceDraft> {
  const db = await openOfflineDB();
  const id = draftData.id || crypto.randomUUID();
  const now = Date.now();

  const draft: OfflineEvidenceDraft = {
    ...draftData,
    id,
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(draft);

    request.onsuccess = () => resolve(draft);
    request.onerror = () => reject(request.error || new Error("Failed to save draft"));
  });
}

/**
 * Retrieves all offline drafts belonging strictly to the authenticated user.
 */
export async function getOfflineDrafts(userId: string): Promise<OfflineEvidenceDraft[]> {
  const db = await openOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("userId");
    const request = index.getAll(IDBKeyRange.only(userId));

    request.onsuccess = () => {
      const results = (request.result || []) as OfflineEvidenceDraft[];
      // Sort newest first
      results.sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
    };

    request.onerror = () => reject(request.error || new Error("Failed to read drafts"));
  });
}

/**
 * Retrieves a single offline draft by its ID.
 */
export async function getOfflineDraft(id: string): Promise<OfflineEvidenceDraft | null> {
  const db = await openOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve((request.result as OfflineEvidenceDraft) || null);
    request.onerror = () => reject(request.error || new Error("Failed to read draft"));
  });
}

/**
 * Updates properties of an existing offline draft.
 */
export async function updateOfflineDraft(
  id: string,
  updates: Partial<OfflineEvidenceDraft>,
): Promise<OfflineEvidenceDraft> {
  const db = await openOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result as OfflineEvidenceDraft | undefined;
      if (!existing) {
        return reject(new Error(`Draft ${id} not found`));
      }

      const updated: OfflineEvidenceDraft = {
        ...existing,
        ...updates,
        id,
        updatedAt: Date.now(),
      };

      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = () => reject(putReq.error || new Error("Failed to update draft"));
    };

    getReq.onerror = () => reject(getReq.error || new Error("Failed to get draft for update"));
  });
}

/**
 * Deletes a draft from local storage.
 */
export async function deleteOfflineDraft(id: string): Promise<void> {
  const db = await openOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Failed to delete draft"));
  });
}

/**
 * Clears all successfully synced drafts for the user.
 */
export async function clearSyncedDrafts(userId: string): Promise<void> {
  const drafts = await getOfflineDrafts(userId);
  const synced = drafts.filter((d) => d.status === "SYNCED");
  for (const item of synced) {
    await deleteOfflineDraft(item.id);
  }
}

/**
 * Estimates storage usage and device quota safely.
 */
export async function getStorageQuota(): Promise<{
  usedBytes: number;
  quotaBytes: number;
  percentage: number;
  isLowStorage: boolean;
}> {
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usedBytes = estimate.usage || 0;
      const quotaBytes = estimate.quota || 1024 * 1024 * 1024; // 1 GB fallback
      const percentage = Math.round((usedBytes / quotaBytes) * 100);
      const isLowStorage = percentage > 85;

      return { usedBytes, quotaBytes, percentage, isLowStorage };
    } catch {
      // Fallback
    }
  }

  return { usedBytes: 0, quotaBytes: 1024 * 1024 * 1024, percentage: 0, isLowStorage: false };
}

/**
 * Sequentially uploads queued offline drafts to prevent saturating mobile bandwidth.
 * Guaranteed idempotency key reuse protection.
 */
export async function syncOfflineDrafts(
  userId: string,
  token: string,
  onDraftProgress?: (draftId: string, progress: number) => void,
): Promise<{ successCount: number; failedCount: number; drafts: OfflineEvidenceDraft[] }> {
  if (isSyncingActive) {
    console.warn("Sync queue already active; skipping concurrent execution.");
    const drafts = await getOfflineDrafts(userId);
    return { successCount: 0, failedCount: 0, drafts };
  }

  if (!navigator.onLine) {
    const drafts = await getOfflineDrafts(userId);
    return { successCount: 0, failedCount: 0, drafts };
  }

  isSyncingActive = true;
  let successCount = 0;
  let failedCount = 0;

  try {
    const drafts = await getOfflineDrafts(userId);
    const pendingDrafts = drafts.filter((d) => d.status === "QUEUED" || d.status === "DRAFT" || d.status === "FAILED");

    for (const draft of pendingDrafts) {
      if (!navigator.onLine) break;

      try {
        await updateOfflineDraft(draft.id, { status: "UPLOADING", progress: 5, error: undefined });
        if (onDraftProgress) onDraftProgress(draft.id, 5);

        // Convert Blob to File
        const file = new File([draft.fileBlob], draft.fileName, {
          type: draft.mimeType,
          lastModified: draft.createdAt,
        });

        let uploadRes;
        if (draft.caseId) {
          uploadRes = await uploadCaseEvidence(
            token,
            draft.caseId,
            file,
            {
              name: draft.name,
              evidenceType: draft.type,
              ownerOrg: draft.ownerOrg,
              description: draft.description || undefined,
            },
            (pct) => {
              updateOfflineDraft(draft.id, { progress: Math.min(pct, 95) }).catch(() => {});
              if (onDraftProgress) onDraftProgress(draft.id, Math.min(pct, 95));
            },
            draft.idempotencyKey,
          );
        } else {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("name", draft.name);
          formData.append("type", draft.type);
          formData.append("ownerOrg", draft.ownerOrg);
          if (draft.description) formData.append("description", draft.description);
          formData.append("idempotencyKey", draft.idempotencyKey);

          uploadRes = await uploadEvidence(
            token,
            formData,
            (pct) => {
              updateOfflineDraft(draft.id, { progress: Math.min(pct, 95) }).catch(() => {});
              if (onDraftProgress) onDraftProgress(draft.id, Math.min(pct, 95));
            },
            draft.idempotencyKey,
          );
        }

        await updateOfflineDraft(draft.id, {
          status: "SYNCED",
          progress: 100,
          evidenceId: uploadRes.id,
          sha256: uploadRes.sha256,
          error: undefined,
        });

        if (onDraftProgress) onDraftProgress(draft.id, 100);
        successCount++;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Sync failed";
        console.error(`Failed to sync draft ${draft.id}:`, errMsg);
        await updateOfflineDraft(draft.id, {
          status: "FAILED",
          progress: 0,
          error: errMsg,
        });
        failedCount++;
      }
    }
  } finally {
    isSyncingActive = false;
  }

  const updatedDrafts = await getOfflineDrafts(userId);
  return { successCount, failedCount, drafts: updatedDrafts };
}
