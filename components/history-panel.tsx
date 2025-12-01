"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Trash2, CheckSquare, Square, ArrowLeftRight, Eye, History, Edit, Images, Sparkles, CheckCheck } from "lucide-react"
import type { GenerationRecord } from "@/lib/types"
import Image from "next/image"
import { Virtuoso } from "react-virtuoso"
import { cn } from "@/lib/utils"
import { getBatchImagesAsDataUrls, getImageAsDataUrl } from "@/lib/indexeddb"

interface HistoryPanelProps {
  history: GenerationRecord[]
  onDelete: (ids: string[]) => void
  onSelect: (record: GenerationRecord) => void
  className?: string
}

export function HistoryPanel({ history, onDelete, onSelect, className = "" }: HistoryPanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [imageCache, setImageCache] = useState<Record<string, string>>({})
  const [visibleRange, setVisibleRange] = useState({ startIndex: 0, endIndex: 10 })

  // Load images from IndexedDB
  useEffect(() => {
    const loadImages = async () => {
      const visibleRecords = history.slice(visibleRange.startIndex, visibleRange.endIndex + 1)
      const keysToLoad: string[] = []

      for (const record of visibleRecords) {
        for (const imageKey of record.base64Images) {
          if (!imageCache[imageKey]) {
            keysToLoad.push(imageKey)
          }
        }
      }

      if (keysToLoad.length > 0) {
        try {
          const newImages = await getBatchImagesAsDataUrls(keysToLoad)
          setImageCache(prev => ({ ...prev, ...newImages }))
        } catch (error) {
          console.error('Failed to load images:', error)
        }
      }
    }

    loadImages()
  }, [history, visibleRange])

  const isAllSelected = history.length > 0 && selectedIds.length === history.length
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(history.map(record => record.id))
    }
  }

  const downloadImages = async (imageKeys: string[], recordId: string, recordType: string) => {
    for (const [index, imageKey] of imageKeys.entries()) {
      try {
        const dataUrl = imageCache[imageKey] || await getImageAsDataUrl(imageKey)
        if (!dataUrl) continue

        const response = await fetch(dataUrl)
        const blob = await response.blob()
        const fileName = `dalle2-${recordType}-${recordId}-${index + 1}.png`

        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } catch (error) {
        console.error("Error downloading image:", error)
      }
    }
  }

  const handleDownload = async () => {
    const selectedRecords = history.filter((record) => selectedIds.includes(record.id))
    for (const record of selectedRecords) {
      await downloadImages(record.base64Images, record.id, record.type)
    }
    setSelectedIds([])
  }

  const handleDelete = () => {
    onDelete(selectedIds)
    setSelectedIds([])
  }


  const handleSingleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete([id])
  }

  const getImageSource = (record: GenerationRecord, index: number): string => {
    const imageKey = record.base64Images[index]
    return imageCache[imageKey] || '' // Return empty string or placeholder if image not loaded
  }

  const openOriginalImage = (record: GenerationRecord, index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const imageSource = getImageSource(record, index)
    const win = window.open()
    if (win) {
      win.document.write(`<img src="${imageSource}" style="max-width: 100%; height: auto;">`)
    }
  }

  const handleSingleDownload = async (record: GenerationRecord, e: React.MouseEvent) => {
    e.stopPropagation()
    await downloadImages(record.base64Images, record.id, record.type)
  }

  const reverseSelection = () => {
    setSelectedIds(history
      .map(record => record.id)
      .filter(id => !selectedIds.includes(id)))
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  return (
    <div className={`${className} h-screen flex flex-col p-4 pb-0 pr-0`}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {selectedIds.length === 0 && (
            <><History /><h2 className="text-lg font-bold py-1">History</h2></>
          )}
        </div>
        {selectedIds.length > 0 && (
          <div className="flex justify-between w-full pr-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="default"
                onClick={toggleSelectAll}
              >
                {isAllSelected ? (
                  <>
                    <CheckCheck className="h-4 w-4" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Square className="h-4 w-4" />
                    Select All
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={reverseSelection}
              >
                <ArrowLeftRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2 items-center">
              <Button variant="outline" size="icon" onClick={handleDownload}>
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="destructive" size="icon" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Virtuoso
        className="flex-1 pr-4 pt-4"
        data={history}
        increaseViewportBy={{ top: 200, bottom: 400 }}
        rangeChanged={setVisibleRange}
        itemContent={(_, record) => (
          <div className="mb-4">
            <Card
              key={record.id}
              className={`transition-colors group relative ${selectedIds.includes(record.id) ? "border-primary" : ""}
                cursor-pointer hover:border-primary/50`}
              onClick={() => selectedIds.length > 0 ? toggleSelection(record.id) : onSelect(record)}
            >
              <div className={`absolute bottom-2 right-2 z-10 transition-opacity ${selectedIds.length > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 bg-secondary/50"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelection(record.id);
                  }}
                >
                  {selectedIds.includes(record.id) ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {selectedIds.length === 0 && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => handleSingleDownload(record, e)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => handleSingleDelete(record.id, e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {record.type === "generate" && <Sparkles className="h-4 w-4 text-primary" />}
                      {record.type === "variation" && <Images className="h-4 w-4 text-primary" />}
                      {record.type === "edit" && <Edit className="h-4 w-4 text-primary" />}
                      <p className="font-medium">{record.type.charAt(0).toUpperCase() + record.type.slice(1)}</p>
                    </div>
                    {record.prompt && <p className="text-sm text-muted-foreground break-words">{record.prompt}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      Size: {record.size} | Cost: ${record.cost.toFixed(3)} | Images: {record.n} | Model: {record.model === "dall-e-2" ? "DALL·E 2" : "GPT-Image-1"}
                    </p>
                  </div>
                </div>

                {/* Preview Grid */}
                <div className={cn(
                  "w-full",
                  record.base64Images.length > 1 ? "grid grid-cols-2 gap-2" : "relative aspect-square"
                )}>
                  {record.base64Images.map((imageKey, index) => (
                    <div key={imageKey} className="relative aspect-square group/image">
                      <div className="relative w-full h-full">
                        {imageCache[imageKey] && (
                          <Image
                            src={imageCache[imageKey]}
                            alt={`Generated image ${index + 1}`}
                            fill
                            sizes="(max-width: 768px) 100vw, 50vw"
                            className="object-contain rounded-md shadow"
                          />
                        )}
                        {!selectedIds.includes(record.id) && (
                          <div
                            className="absolute inset-0 bg-background/80 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                            onClick={(e) => openOriginalImage(record, index, e)}
                          >
                            <Eye className="h-6 w-6 text-primary" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      />
    </div>
  )
}
