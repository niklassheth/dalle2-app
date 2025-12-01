import { openDB } from 'idb';

const DB_NAME = 'imageStorage';
const STORE_NAME = 'images';

// Cache object URLs so we don't recreate them for the same key.
const objectUrlCache = new Map<string, string>();

export async function initDB() {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            db.createObjectStore(STORE_NAME);
        },
    });
}

export async function saveImage(key: string, image: Blob) {
    const db = await initDB();
    await db.put(STORE_NAME, image, key);
}

export async function deleteImage(key: string) {
    const db = await initDB();

    // Revoke cached object URL to prevent memory leaks
    const url = objectUrlCache.get(key);
    if (url) {
        URL.revokeObjectURL(url);
        objectUrlCache.delete(key);
    }

    await db.delete(STORE_NAME, key);
}

// Returns an object URL for the stored image. Despite the name, we return object URLs
// to avoid expensive base64 conversions and keep memory lower.
export async function getImageAsDataUrl(key: string): Promise<string | undefined> {
    const cached = objectUrlCache.get(key);
    if (cached) return cached;

    const db = await initDB();
    const blob = await db.get(STORE_NAME, key);
    if (!blob) return undefined;

    const url = URL.createObjectURL(blob);
    objectUrlCache.set(key, url);
    return url;
}
