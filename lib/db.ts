// IndexedDB persistence: generated videos library + user settings.

import type { LibraryVideo } from "./types";

const DB_NAME = "roamline";
const DB_VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("videos")) {
        db.createObjectStore("videos", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export async function saveVideo(v: LibraryVideo): Promise<void> {
  await tx("videos", "readwrite", (s) => s.put(v));
}

export async function listVideos(): Promise<LibraryVideo[]> {
  const all = await tx<LibraryVideo[]>("videos", "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteVideo(id: string): Promise<void> {
  await tx("videos", "readwrite", (s) => s.delete(id));
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return tx<T>("settings", "readonly", (s) => s.get(key) as IDBRequest<T>);
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await tx("settings", "readwrite", (s) => s.put(value, key));
}
