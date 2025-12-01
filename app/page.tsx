"use client"
import { HistoryPanel } from "@/components/history-panel"
import { ImageWorkspace } from "@/components/image-workspace"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu, MoonIcon, SunIcon, GithubIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useLocalStorage } from "@/lib/use-local-storage"
import type { GenerationRecord } from "@/lib/types"
import { useState } from "react"
import { saveImage, deleteImage } from "@/lib/indexeddb"
import { dataURLtoBlob } from "@/lib/openai"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AnimatedCharacter } from "@/components/animated-character"

export default function Home() {
  const [history, setHistory] = useLocalStorage<GenerationRecord[]>("history", [])
  const { setTheme, theme } = useTheme()
  const [selectedRecord, setSelectedRecord] = useState<GenerationRecord | undefined>(undefined)
  const [model, setModel] = useState<"dall-e-2" | "gpt-image-1">("gpt-image-1")
  const MAX_HISTORY_LENGTH = 100; // Set a limit for the number of records

  const updateHistory = async (newRecord: GenerationRecord) => {
    // Save images to IndexedDB and create a modified record for localStorage
    const storageRecord = { ...newRecord };

    try {
      // Save each image to IndexedDB (parallel) without hitting the network stack
      const imageKeys = await Promise.all(
        newRecord.base64Images.map(async (base64Image, index) => {
          const blob = dataURLtoBlob(base64Image);
          const imageKey = `${newRecord.id}_${index}`;
          await saveImage(imageKey, blob);
          return imageKey;
        })
      );

      // Remove base64 data before storing in localStorage
      storageRecord.base64Images = imageKeys;

      // Update metadata in local storage
      setHistory((prev) => {
        const updated = [storageRecord, ...prev];
        if (updated.length > MAX_HISTORY_LENGTH) {
          const oldest = updated.pop();
          if (oldest) {
            // Delete all images associated with the oldest record
            (async () => {
              try {
                // Delete each image for the record
                for (const imageKey of oldest.base64Images) {
                  await deleteImage(imageKey);
                }
              } catch (error) {
                console.error(`Failed to delete oldest record images:`, error);
              }
            })();
          }
        }
        return updated;
      });
    } catch (error) {
      console.error('Failed to save images:', error);
      throw error; // Re-throw to handle in the UI
    }
  }

  const deleteRecords = async (ids: string[]) => {
    // Delete images from IndexedDB first
    for (const id of ids) {
      const record = history.find(r => r.id === id)
      if (record) {
        // Delete all images associated with this record
        try {
          for (const imageKey of record.base64Images) {
            await deleteImage(imageKey);
          }
        } catch (error) {
          console.error(`Failed to delete images for record ${id}:`, error)
        }
      }
    }

    // Then update the history in localStorage
    setHistory(history.filter((record) => !ids.includes(record.id)))
  }

  const clearSelection = () => {
    setSelectedRecord(undefined)
  }

  return (
    <main className="min-h-screen flex select-none">
      {/* Desktop History Panel */}
      <div className="hidden md:block w-80 border-r bg-background overflow-y-auto">
        <HistoryPanel
          history={history}
          onDelete={deleteRecords}
          onSelect={setSelectedRecord}
          className="p-4"
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-4xl mx-auto ">
          {/* Top Bar */}
          <div className="p-4 pb-0 flex justify-between items-center">
            {/* Mobile History Toggle */}
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-r-none">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80 p-0">
                  <HistoryPanel history={history} onDelete={deleteRecords} onSelect={setSelectedRecord} className="p-4" />
                </SheetContent>
              </Sheet>
            </div>
            <Select value={model} onValueChange={(value: "dall-e-2" | "gpt-image-1") => setModel(value)}>
              <SelectTrigger className="w-[160px] rounded-l-none md:rounded">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Models</SelectLabel>
                  <SelectItem value="dall-e-2">
                    <div className="flex items-center gap-2">
                      <img
                        src="https://cdn.openai.com/API/docs/images/model-page/model-icons/dall-e-2.png"
                        alt="DALL·E 2 icon"
                        className="h-4 w-4"
                      />
                      DALL·E 2
                    </div>
                  </SelectItem>
                  <SelectItem value="gpt-image-1">
                    <div className="flex items-center gap-2">
                      <img
                        src="https://cdn.openai.com/API/docs/images/model-page/model-icons/gpt-image-1.png"
                        alt="GPT Image 1 icon"
                        className="h-4 w-4"
                      />
                      GPT Image 1
                    </div>
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-4 ml-auto">
              <div className="hidden sm:flex relative items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="120" height="24" viewBox="0 0 120 24">
                  {["#ffff66", "#42ffff", "#51da4c", "#ff6e3c", "#3c46ff"].map((color, index) => (
                    <rect
                      key={index}
                      x={index * 24}
                      width="24"
                      height="24"
                      fill={color}
                      className="animate-pulse"
                      style={{ animationDelay: `${Math.random() * 2}s` }}
                    />
                  ))}
                </svg>
                <h1
                  className="text-lg absolute inset-0 flex items-center justify-center w-full h-full font-semibold text-accent-foreground dark:text-accent pointer-events-none"
                  style={{ letterSpacing: "0.05em" }}
                >
                  {"ImageGen".split("").map((char, index) => (
                    <AnimatedCharacter key={index}>{char}</AnimatedCharacter>
                  ))}
                </h1>
              </div>
            </div>

            <div className="flex items-center ml-auto">
              <a
                href="https://github.com/Yijia-Z/dalle2-app"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="icon" className="rounded-r-none">
                  <GithubIcon className="h-4 w-4" />
                  <span className="sr-only">GitHub repository</span>
                </Button>
              </a>

              {/* Theme Toggle */}
              <Button
                variant="outline"
                size="icon"
                className="rounded-l-none"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                <SunIcon className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <MoonIcon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </div>
          </div>

          {/* Main Workspace */}
          <ImageWorkspace
            updateHistory={updateHistory}
            selectedRecord={selectedRecord}
            onClearSelection={clearSelection}
            model={model}
          />
        </div>
      </div>
    </main>
  )
}
