import { openDB } from 'idb';
import type { DataURL, ObjectURL, IndexedDBKey } from './url-types';

const DB_NAME = 'imageStorage';
const STORE_NAME = 'images';

// Cache object URLs so we don't recreate them for the same key.
const objectUrlCache = new Map<IndexedDBKey, ObjectURL>();

export async function initDB() {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            db.createObjectStore(STORE_NAME);
        },
    });
}

export async function saveImage(key: IndexedDBKey, image: Blob): Promise<IndexedDBKey> {
    const db = await initDB();
    await db.put(STORE_NAME, image, key);
    return key;
}

export async function deleteImage(key: IndexedDBKey) {
    const db = await initDB();

    // Revoke cached object URL to prevent memory leaks
    const url = objectUrlCache.get(key);
    if (url) {
        URL.revokeObjectURL(url);
        objectUrlCache.delete(key);
    }

    await db.delete(STORE_NAME, key);
}

export async function getImageAsObjectUrl(key: IndexedDBKey): Promise<ObjectURL | undefined> {
    const cached = objectUrlCache.get(key);
    if (cached) return cached;

    const db = await initDB();
    const blob = await db.get(STORE_NAME, key);
    if (!blob) return undefined;

    const url = URL.createObjectURL(blob) as ObjectURL;
    objectUrlCache.set(key, url);
    return url;
}

// Helper to create a key for a record's image
export function createImageKey(recordId: string, suffix: string): IndexedDBKey {
    return `${recordId}_${suffix}` as IndexedDBKey;
}

// Get image as DataURL (for working state - simpler, no cleanup needed)
export async function getImageAsDataUrl(key: IndexedDBKey): Promise<DataURL | undefined> {
    const db = await initDB();
    const blob = await db.get(STORE_NAME, key);
    if (!blob) return undefined;

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as DataURL);
        reader.readAsDataURL(blob);
    });
}
