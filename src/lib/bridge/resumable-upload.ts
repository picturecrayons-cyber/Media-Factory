const DB_NAME = "crayons-bridge-upload-v1";
const STORE = "uploads";
export const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
export const MULTIPART_PART_SIZE = 10 * 1024 * 1024;

export type SavedUpload = {
  key: string;
  titleId: string;
  userId: string;
  kind: string;
  filename: string;
  contentType: string;
  file: File;
  assetId: string;
  parUrl: string;
  multipartUrl?: string;
  completedParts: Array<{ number: number; etag: string; size: number }>;
  verificationPending?: boolean;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser does not support resumable upload storage."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local upload storage."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Local upload storage operation failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Local upload storage transaction aborted."));
    });
  } finally {
    db.close();
  }
}

export const saveUpload = (upload: SavedUpload) => withStore("readwrite", store => store.put(upload));
export const getUpload = (key: string) => withStore<SavedUpload | undefined>("readonly", store => store.get(key));
export const listUploads = () => withStore<SavedUpload[]>("readonly", store => store.getAll());
export const deleteUpload = (key: string) => withStore("readwrite", store => store.delete(key));

export function uploadKey(userId: string, titleId: string, kind: string, file: File) {
  return [userId, titleId, kind, file.name, file.size, file.lastModified].join(":");
}

function xhrRequest<T>(url: string, method: string, body: Blob | null, headers: Record<string, string> = {}): Promise<{ value: T; etag: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.timeout = 120_000;
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Multipart request failed (${xhr.status}).`));
        return;
      }
      let value: T;
      try { value = xhr.responseText ? JSON.parse(xhr.responseText) as T : (undefined as T); }
      catch { value = undefined as T; }
      resolve({ value, etag: xhr.getResponseHeader("etag")?.replaceAll('"', "") ?? null });
    };
    xhr.onerror = () => reject(new TypeError("Could not reach OCI multipart storage. Check Preview-origin CORS."));
    xhr.ontimeout = () => reject(new Error("Multipart request timed out."));
    xhr.send(body);
  });
}

export async function startMultipart(parUrl: string, contentType: string): Promise<string> {
  const { value } = await xhrRequest<{ accessUri?: string }>(parUrl, "PUT", new Blob([]), { "opc-multipart": "true", "content-type": contentType });
  if (!value?.accessUri) throw new Error("OCI did not return a multipart access URI.");
  // OCI returns a relative access URI; resolve it against the same region host as the original PAR.
  return new URL(value.accessUri, parUrl).toString();
}

export async function uploadMultipartPart(
  multipartUrl: string,
  file: File,
  partNumber: number,
  partSize = MULTIPART_PART_SIZE,
): Promise<{ number: number; etag: string; size: number }> {
  const start = (partNumber - 1) * partSize;
  const end = Math.min(file.size, start + partSize);
  const { etag } = await xhrRequest<unknown>(`${multipartUrl}${partNumber}`, "PUT", file.slice(start, end), { "content-type": "application/octet-stream" });
  if (!etag) throw new Error("OCI did not expose the uploaded part ETag. Check CORS exposed headers.");
  return { number: partNumber, etag, size: end - start };
}

export async function commitMultipart(multipartUrl: string): Promise<void> {
  await xhrRequest<unknown>(multipartUrl, "POST", null);
}
