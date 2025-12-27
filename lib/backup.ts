import type { GenerationRecord } from './types'
import type { DataURL, IndexedDBKey } from './url-types'
import { dataURLToBlob } from './url-types'
import { getImageAsDataUrl, saveImage } from './indexeddb'

export interface BackupData {
  version: 1
  exportedAt: number
  records: Array<{
    record: GenerationRecord
    images: {
      results: DataURL[]
      original?: DataURL
      mask?: DataURL
    }
  }>
}

export interface ImportResult {
  imported: number
  skipped: number
  newRecords: GenerationRecord[]
}

function isValidBackupData(data: unknown): data is BackupData {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  if (obj.version !== 1) return false
  if (typeof obj.exportedAt !== 'number') return false
  if (!Array.isArray(obj.records)) return false
  return true
}

export async function exportBackup(history: GenerationRecord[]): Promise<BackupData> {
  const records: BackupData['records'] = []

  for (const record of history) {
    const results: DataURL[] = []

    for (const imageKey of record.base64Images) {
      const dataUrl = await getImageAsDataUrl(imageKey)
      if (dataUrl) {
        results.push(dataUrl)
      }
    }

    let original: DataURL | undefined
    if (record.originalImage) {
      original = await getImageAsDataUrl(record.originalImage)
    }

    let mask: DataURL | undefined
    if (record.maskImage) {
      mask = await getImageAsDataUrl(record.maskImage)
    }

    records.push({
      record,
      images: {
        results,
        original,
        mask,
      },
    })
  }

  return {
    version: 1,
    exportedAt: Date.now(),
    records,
  }
}

export async function importBackup(
  data: unknown,
  existingHistory: GenerationRecord[]
): Promise<ImportResult> {
  if (!isValidBackupData(data)) {
    throw new Error('Invalid backup file format')
  }

  const existingIds = new Set(existingHistory.map(r => r.id))
  const newRecords: GenerationRecord[] = []
  let skipped = 0

  for (const entry of data.records) {
    if (existingIds.has(entry.record.id)) {
      skipped++
      continue
    }

    const newImageKeys: IndexedDBKey[] = []
    for (let i = 0; i < entry.images.results.length; i++) {
      const dataUrl = entry.images.results[i]
      const key = `${entry.record.id}_result_${i}` as IndexedDBKey
      const blob = dataURLToBlob(dataUrl)
      await saveImage(key, blob)
      newImageKeys.push(key)
    }

    let originalKey: IndexedDBKey | undefined
    if (entry.images.original) {
      originalKey = `${entry.record.id}_original` as IndexedDBKey
      const blob = dataURLToBlob(entry.images.original)
      await saveImage(originalKey, blob)
    }

    let maskKey: IndexedDBKey | undefined
    if (entry.images.mask) {
      maskKey = `${entry.record.id}_mask` as IndexedDBKey
      const blob = dataURLToBlob(entry.images.mask)
      await saveImage(maskKey, blob)
    }

    const newRecord: GenerationRecord = {
      ...entry.record,
      base64Images: newImageKeys,
      originalImage: originalKey,
      maskImage: maskKey,
    }

    newRecords.push(newRecord)
  }

  return {
    imported: newRecords.length,
    skipped,
    newRecords,
  }
}

export function downloadBackup(data: BackupData): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `imagegen-backup-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
