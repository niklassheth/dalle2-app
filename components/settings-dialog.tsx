"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Settings, Download, Upload } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { GenerationRecord } from "@/lib/types"
import { exportBackup, importBackup, downloadBackup } from "@/lib/backup"

interface SettingsDialogProps {
  history: GenerationRecord[]
  setHistory: (updater: (prev: GenerationRecord[]) => GenerationRecord[]) => void
}

export function SettingsDialog({ history, setHistory }: SettingsDialogProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const handleExport = async () => {
    if (history.length === 0) {
      toast({
        title: "Nothing to export",
        description: "Your history is empty.",
        variant: "destructive",
      })
      return
    }

    setIsExporting(true)
    try {
      const backup = await exportBackup(history)
      downloadBackup(backup)
      toast({
        title: "Export complete",
        description: `Exported ${history.length} records.`,
      })
    } catch (error) {
      console.error("Export failed:", error)
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith(".json")) {
      toast({
        title: "Invalid file",
        description: "Please select a JSON backup file.",
        variant: "destructive",
      })
      return
    }

    setIsImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const result = await importBackup(data, history)

      if (result.imported > 0) {
        setHistory((prev) => [...result.newRecords, ...prev])
      }

      toast({
        title: "Import complete",
        description: `Imported ${result.imported} records, skipped ${result.skipped} duplicates.`,
      })
    } catch (error) {
      console.error("Import failed:", error)
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Invalid backup file",
        variant: "destructive",
      })
    } finally {
      setIsImporting(false)
      if (e.target) e.target.value = ""
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-none">
          <Settings className="h-4 w-4" />
          <span className="sr-only">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Export your history to transfer to another computer, or import a backup.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Export Backup</p>
              <p className="text-sm text-muted-foreground">
                Download all {history.length} records as a JSON file.
              </p>
            </div>
            <Button onClick={handleExport} disabled={isExporting || history.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? "Exporting..." : "Export"}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Import Backup</p>
              <p className="text-sm text-muted-foreground">
                Restore records from a backup file.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: "none" }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              variant="outline"
            >
              <Upload className="h-4 w-4 mr-2" />
              {isImporting ? "Importing..." : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
