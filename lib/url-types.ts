// Branded types for type-safe URL handling
export type DataURL = string & { readonly __brand: 'DataURL' }
export type ObjectURL = string & { readonly __brand: 'ObjectURL' }

// Branded type for IndexedDB storage keys - prevents accidentally passing
// a base64 string or URL to IndexedDB helpers
export type IndexedDBKey = string & { readonly __brand: 'IndexedDBKey' }

// Convert DataURL to Blob
export function dataURLToBlob(dataURL: DataURL): Blob {
  const arr = dataURL.split(",")
  const mime = arr[0].match(/:(.*?);/)?.[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new Blob([u8arr], { type: mime })
}
