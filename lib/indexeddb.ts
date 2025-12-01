import { openDB } from 'idb';

const DB_NAME = 'imageStorage';
const STORE_NAME = 'images';

// Cache object URLs so we don't recreate them for the same key.
const objectUrlCache = new Map<string, string>();

function revokeCachedUrl(key: string) {
    const url = objectUrlCache.get(key);
    if (url) {
        URL.revokeObjectURL(url);
        objectUrlCache.delete(key);
    }
}

export async function initDB() {
    if (typeof indexedDB === 'undefined') {
        throw new Error('IndexedDB is not available in this environment');
    }
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        },
    });
}

export async function saveImage(key: string, image: Blob) {
    const db = await initDB();
    revokeCachedUrl(key);
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.store.put(image, key);
    await tx.done;
}

export async function deleteImage(key: string) {
    const db = await initDB();
    revokeCachedUrl(key);
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.store.delete(key);
    await tx.done;
}

// Returns an object URL for the stored image. Despite the name, we return object URLs
// to avoid expensive base64 conversions and keep memory lower.
export async function getImageAsDataUrl(key: string): Promise<string | undefined> {
    const cached = objectUrlCache.get(key);
    if (cached) return cached;

    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const blob = await tx.store.get(key);
    await tx.done;
    if (!blob) return undefined;

    const url = URL.createObjectURL(blob);
    objectUrlCache.set(key, url);
    return url;
}

export async function getBatchImagesAsDataUrls(keys: string[]): Promise<Record<string, string>> {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');

    const results = await Promise.all(
        keys.map(async (key) => {
            const cached = objectUrlCache.get(key);
            if (cached) {
                return { key, dataUrl: cached };
            }

            const blob = await tx.store.get(key);
            if (!blob) return { key, dataUrl: undefined };

            const url = URL.createObjectURL(blob);
            objectUrlCache.set(key, url);
            return { key, dataUrl: url };
        })
    );

    await tx.done;

    const batch: Record<string, string> = {};
    for (const { key, dataUrl } of results) {
        if (dataUrl) {
            batch[key] = dataUrl;
        }
    }
    return batch;
}
