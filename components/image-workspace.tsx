"use client"

import type React from "react"
import Image from "next/image"

import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { CropInterface } from "./crop-interface"
import { MaskInterface } from "./mask-interface"
import { Download, Edit, Eye, Grid2X2, Grid3X3, ImageMinus, ImageOff, ImagePlus, Images, Loader2, LoaderPinwheel, Maximize2, Paintbrush, RectangleHorizontal, RectangleVertical, Sparkles, Square, SquareX, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { dataURLtoBlob, generateImage, createImageEdit, createImageVariation } from "@/lib/openai"
import { getImageAsDataUrl, saveImage } from "@/lib/indexeddb"
import type { GenerationRecord } from "@/lib/types"
import { useLocalStorage } from "@/lib/use-local-storage"
import { cn } from "@/lib/utils"

// Constants for validation
const DALLE2_MAX_SIZE_MB = 4;
const GPT_IMAGE_1_MAX_SIZE_MB = 25;
const DALLE2_ALLOWED_TYPES = ['image/png'];
const GPT_IMAGE_1_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// Helper function for size validation
const isFileSizeValid = (file: File, maxSizeMB: number): boolean => {
  return file.size <= maxSizeMB * 1024 * 1024;
};

// Helper function for type validation
const isFileTypeValid = (file: File, allowedTypes: string[]): boolean => {
  return allowedTypes.includes(file.type);
};

interface ImageWorkspaceProps {
  updateHistory: (newRecord: GenerationRecord) => void
  selectedRecord?: GenerationRecord
  onClearSelection: () => void
  model: "dall-e-2" | "gpt-image-1"
}

export function ImageWorkspace({
  updateHistory,
  selectedRecord,
  onClearSelection,
  model,
}: ImageWorkspaceProps) {
  // Hooks: Toast and Local Storage
  const { toast } = useToast();
  const [apiKey, setApiKey] = useLocalStorage<string>("apiKey", "");

  // Prompt and Dialog State
  const [prompt, setPrompt] = useState("");
  const [isPromptPopupOpen, setIsPromptPopupOpen] = useState(false);
  const [popupPromptText, setPopupPromptText] = useState("");

  // Image Generation Parameters
  const [size, setSize] = useState<
    "256x256" | "512x512" | "1024x1024" | "1536x1024" | "1024x1536" | "auto"
  >(model === "dall-e-2" ? "1024x1024" : "auto");
  const [numImages, setNumImages] = useState(1);
  const [quality, setQuality] = useState<"auto" | "high" | "medium" | "low">("high");
  const [background, setBackground] = useState<"transparent" | "opaque" | "auto">("auto");
  const [moderation, setModeration] = useState<"low" | "auto">("low");
  const [outputCompression, setOutputCompression] = useState(100);
  const [outputFormat, setOutputFormat] = useState<"png" | "jpeg" | "webp">("png");

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [showMaskInterface, setShowMaskInterface] = useState(false);

  // Image Data State
  const [results, setResults] = useState<string[]>([]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [additionalImages, setAdditionalImages] = useState<string[] | null>(null);
  const [originalImageFile, setOriginalImageFile] = useState<string | null>(null);
  const [mask, setMask] = useState<string | null>(null);

  // Mode and Aspect Ratio
  const [mode, setMode] = useState<"generate" | "edit" | "variation">("generate");

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stableOnClearSelection = useRef(onClearSelection);

  useEffect(() => {
    if (selectedRecord) {
      setPrompt(selectedRecord.prompt || "")
      setSize(selectedRecord.size)
      setNumImages(selectedRecord.n)
      setMode(selectedRecord.type)

      // Load images from IndexedDB
      const loadImages = async () => {
        try {
          if (selectedRecord.originalImage) {
            const originalDataUrl = await getImageAsDataUrl(selectedRecord.originalImage)
            setUploadedImage(originalDataUrl || null)
          }

          if (selectedRecord.maskImage) {
            const maskDataUrl = await getImageAsDataUrl(selectedRecord.maskImage)
            setMask(maskDataUrl || null)
          }

          // Load result images
          const loadedImages = await Promise.all(
            selectedRecord.base64Images.map(key => getImageAsDataUrl(key))
          )
          setResults(loadedImages.filter((img): img is string => img !== undefined))
        } catch (error) {
          console.error("Failed to load images:", error)
        }
      }

      loadImages()
    }
  }, [selectedRecord])

  // Update size when model changes
  useEffect(() => {
    setSize(model === "dall-e-2" ? "1024x1024" : "auto")
  }, [model])

  // Update ref when prop changes
  useEffect(() => {
    stableOnClearSelection.current = onClearSelection;
  }, [onClearSelection]);

  // Clear non-reusable fields when model changes
  useEffect(() => {
    // Clear the primary uploaded image
    setUploadedImage(null)
    // Clear the mask image
    setMask(null)
    // Clear the generated results
    setResults([])
    // Reset mode to "generate"
    setMode("generate")
    // Remove the original image file reference
    setOriginalImageFile(null)
    // Hide the cropper UI
    setShowCropper(false)
    // Hide the mask interface
    setShowMaskInterface(false)
    // Call the provided callback to clear any external selection state
    stableOnClearSelection.current()
    // Clear any additional images
    setAdditionalImages(null);
  }, [model])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const allowedTypes = model === 'dall-e-2' ? DALLE2_ALLOWED_TYPES : GPT_IMAGE_1_ALLOWED_TYPES;
    const maxSizeMB = model === 'dall-e-2' ? DALLE2_MAX_SIZE_MB : GPT_IMAGE_1_MAX_SIZE_MB;

    const validFiles: File[] = [];
    const invalidFiles: { name: string; reason: string }[] = [];

    Array.from(files).forEach(file => {
      if (!isFileTypeValid(file, allowedTypes)) {
        invalidFiles.push({ name: file.name, reason: `Invalid type (Allowed: ${allowedTypes.map(t => t.split('/')[1]).join(', ')})` });
      } else if (!isFileSizeValid(file, maxSizeMB)) {
        invalidFiles.push({ name: file.name, reason: `Too large (> ${maxSizeMB}MB)` });
      } else {
        validFiles.push(file);
      }
    });

    // Show toasts for invalid files
    if (invalidFiles.length > 0) {
      toast({
        title: "Invalid Files Skipped",
        description: `${invalidFiles.map(f => `${f.name}: ${f.reason}`).join('\n')}`,
        variant: "destructive",
      });
    }

    if (validFiles.length === 0) {
      if (e.target) e.target.value = ''; // Reset file input if all files were invalid
      return; // No valid files to process
    }

    const filePromises = validFiles.map(file => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(filePromises).then(dataUrls => {
      if (model === "gpt-image-1") {
        if (!uploadedImage) {
          // If no primary image yet, set the first as primary, rest as additional
          setUploadedImage(dataUrls[0]);
          if (dataUrls.length > 1) {
            setAdditionalImages(dataUrls.slice(1));
          } else {
            setAdditionalImages([]); // Ensure it's an empty array if only one image uploaded
          }
          setMode("edit"); // Set mode only when the first image is set
        } else {
          // If primary image exists, add all new images to additional
          setAdditionalImages(prev => [...(prev || []), ...dataUrls]);
        }
        setOriginalImageFile(null); // Not used for gpt flow
      } else if (model === "dall-e-2") {
        // DALL-E 2 only uses the first valid file for cropping/variation
        setOriginalImageFile(dataUrls[0]);
        setShowCropper(true);
        setUploadedImage(null); // Clear primary image until crop is done
        setAdditionalImages(null); // Ensure no additional images for DALL-E 2
      }
    }).catch(error => {
      console.error("Error reading files:", error);
      toast({ title: "Error Reading Files", description: "Could not process uploaded files.", variant: "destructive" });
    });

    // Reset file input value to allow re-uploading the same file(s)
    if (e.target) e.target.value = '';
  };

  const handleCropComplete = (croppedImage: string) => {
    setUploadedImage(croppedImage);
    setShowCropper(false);
    setAdditionalImages(null); // Cropping is DALL-E 2 specific, clear additional images
    // Only set mode if it wasn't already set (e.g., by selecting a record)
    if (mode !== 'edit' && mode !== 'variation') {
      setMode("variation");
    }
    setOriginalImageFile(null); // Clear the temp original file
  };

  const handlePromptChange = (value: string) => {
    setPrompt(value);
  };

  const handlePopupPromptChange = (value: string) => {
    setPopupPromptText(value);
  };

  const savePopupPrompt = () => {
    setPrompt(popupPromptText);
    setIsPromptPopupOpen(false);
  };

  const openPromptPopup = () => {
    setPopupPromptText(prompt);
    setIsPromptPopupOpen(true);
  };

  const isPromptOverLimit = (text: string) => {
    const maxLength = model === "gpt-image-1" ? 32000 : 1000;
    return text.length > maxLength;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;
    // Prompt validation check
    if (mode !== "variation" && isPromptOverLimit(prompt)) {
      toast({
        title: "Prompt Too Long",
        description: `Prompt exceeds the maximum length of ${model === "gpt-image-1" ? "32,000" : "1,000"} characters. Please shorten your prompt.`,
        variant: "destructive",
      });
      return;
    }

    // Check if an image is required and missing
    if ((mode === 'edit' || mode === 'variation') && !uploadedImage) {
      toast({
        title: "Image Required",
        description: `An image is needed for ${mode} mode. Please upload one.`,
        variant: "destructive",
      });
      return;
    }
    // Check if mask is required for edit mode and missing
    if (mode === 'edit' && !mask && model === 'dall-e-2') { // DALL-E 2 requires a mask for edits
      toast({
        title: "Mask Required",
        description: "Editing with DALL·E 2 requires a mask. Please create one.",
        variant: "destructive",
      });
      return;
    }
    // Note: gpt-image-1 can do edits without a mask (edits whole image if null), required for dall-e-2 (handled above)

    setIsLoading(true);
    try {
      let response

      if (mode === "generate") {
        response = await generateImage(apiKey, prompt, numImages, size, model, {
          background,
          moderation,
          outputCompression,
          outputFormat,
          quality
        })
      } else if (mode === "variation" && uploadedImage) {
        // Pass only the primary image for variation
        response = await createImageVariation(apiKey, uploadedImage, numImages, size, model)
      } else if (mode === "edit" && uploadedImage) {
        // Pass only the primary image and mask for edit
        // Mask is optional for gpt-image-1 (edits whole image if null), required for dall-e-2 (handled above)
        response = await createImageEdit(apiKey, uploadedImage, mask, prompt, numImages, size, model)
      } else {
        throw new Error("Invalid mode or missing data")
      }

      const base64Images = response.data.map((item: { b64_json: string }) =>
        `data:image/png;base64,${item.b64_json}`
      )
      setResults(base64Images)

      // Display token usage toast for gpt-image-1
      let totalCost = calculateCost(size, numImages, model, quality); // Calculate output cost first
      let inputTokenCost = 0; // Initialize input cost

      if (model === "gpt-image-1" && response.usage) {
        const inputTokens = response.usage.input_tokens || 0; // Ensure input_tokens exists
        inputTokenCost = (inputTokens / 1_000_000) * 10.00;
        totalCost += inputTokenCost; // Add input cost to total cost

        const outputCost = totalCost - inputTokenCost; // Recalculate output cost for the toast

        toast({
          title: "GPT-Image-1 Usage",
          description: `Input Cost: $${inputTokenCost.toFixed(3)}, Output Cost: $${outputCost.toFixed(3)}, Total Cost: $${totalCost.toFixed(3)} (Input: ${inputTokens}, Output: ${response.usage.output_tokens}, Total: ${response.usage.total_tokens} tokens)`,
        })
      } else if (model === "dall-e-2") {
        // Optional: Toast for DALL-E 2 cost
        toast({
          title: "DALL·E 2 Usage",
          description: `Total Cost: $${totalCost.toFixed(3)}`,
        })
      }

      const newRecord: GenerationRecord = {
        id: Date.now().toString(),
        type: mode,
        prompt: mode !== "variation" ? prompt : undefined,
        size,
        base64Images, // Will be replaced by keys before saving to local storage
        requestTime: response.created * 1000, // Use API timestamp
        n: numImages,
        cost: totalCost, // Store the final total cost (output + input)
        createdAt: Date.now(), // Keep local timestamp for sorting
        originalImage: undefined, // Placeholder, will be added later if needed
        maskImage: undefined, // Placeholder
        model,
        // Store usage details if available, especially for gpt-image-1
        usage: response.usage ? {
          input_tokens: response.usage.input_tokens,
          input_tokens_details: response.usage.input_tokens_details,
          output_tokens: response.usage.output_tokens,
          total_tokens: response.usage.total_tokens,
        } : undefined,
      }

      // Add original/mask image keys before saving to history
      try {
        if (mode !== 'generate' && uploadedImage) {
          const originalKey = `${newRecord.id}_original`;
          await saveImageFromDataUrl(originalKey, uploadedImage);
          newRecord.originalImage = originalKey;
        }
        if (mode === 'edit' && mask) {
          const maskKey = `${newRecord.id}_mask`;
          await saveImageFromDataUrl(maskKey, mask);
          newRecord.maskImage = maskKey;
        }
        // Now pass the complete record (with image keys) to updateHistory
        await updateHistory(newRecord);
      } catch (saveError) {
        console.error("Error saving images to IndexedDB:", saveError);
        toast({
          title: "Error Saving Images",
          description: "Could not save generated images locally. Check console for details.",
          variant: "destructive",
        });
        // Decide if you still want to update history without images, maybe with a flag
        // For now, we proceed to update history metadata but images might be missing
        // await updateHistory({ ...newRecord, base64Images: [] }); // Example: update without images
      }

    } catch (error) {
      console.error("Error during generation:", error)
      toast({
        title: "Generation Error",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Helper function to save data URL to IndexedDB
  const saveImageFromDataUrl = async (key: string, dataUrl: string) => {
    const blob = dataURLtoBlob(dataUrl);
    await saveImage(key, blob);
  };

  const calculateCost = (size: string, n: number, model: string, quality: string = "auto") => {
    if (model === "gpt-image-1") {
      const gptImage1Costs = {
        low: {
          "1024x1024": 0.011,
          "1024x1536": 0.016,
          "1536x1024": 0.016,
          auto: 0.011, // Default to lowest cost if size is auto
        },
        medium: {
          "1024x1024": 0.042,
          "1024x1536": 0.063,
          "1536x1024": 0.063,
          auto: 0.042, // Default to medium 1024x1024 if size is auto
        },
        high: {
          "1024x1024": 0.167,
          "1024x1536": 0.250,
          "1536x1024": 0.250,
          auto: 0.167, // Default to high 1024x1024 if size is auto
        },
        auto: {
          // Default to medium quality if quality is auto
          "1024x1024": 0.042,
          "1024x1536": 0.063,
          "1536x1024": 0.063,
          auto: 0.042, // Default to medium 1024x1024
        }
      };

      const effectiveQuality = (quality === "auto" ? "medium" : quality) as keyof typeof gptImage1Costs;
      const effectiveSize = size as keyof typeof gptImage1Costs[typeof effectiveQuality];

      const costPerImage = gptImage1Costs[effectiveQuality]?.[effectiveSize] ?? gptImage1Costs.auto.auto; // Fallback to absolute default

      return costPerImage * n;

    } else if (model === "dall-e-2") {
      const costMap = {
        "256x256": 0.016,
        "512x512": 0.018,
        "1024x1024": 0.02,
        auto: 0.02 // Default for DALL-E 2 if size is 'auto'
      }
      return (costMap[size as keyof typeof costMap] ?? costMap.auto) * n
    } else {
      return 0; // Unknown model
    }
  }

  const handleModeChange = (newMode: "variation" | "edit") => {
    setMode(newMode)
    if (newMode === "edit" && !mask) {
      setShowMaskInterface(true)
    }
  }

  const openOriginalImage = (base64Image: string) => {
    const win = window.open()
    if (win) {
      win.document.write(`<img src="${base64Image}" style="max-width: 100%; height: auto;">`)
    }
  }

  const handleDownload = async (base64Image: string, index: number) => {
    try {
      const response = await fetch(base64Image)
      const blob = await response.blob()
      const fileName = `dalle2-${mode}-${Date.now()}-${index + 1}.png`

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

  const getEstimatedCost = () => {
    // Pass the primary image for cost calculation if needed (though currently cost depends on size/n/model/quality)
    return calculateCost(size, numImages, model, quality).toFixed(3)
  }

  const handleSelectAsUpload = (base64Image: string) => {
    setUploadedImage(base64Image) // Set as the new primary image
    setAdditionalImages(null); // Clear any previous additional images
    setMask(null); // Clear mask when selecting a result
    setResults([]) // Clear previous results

    if (model === "gpt-image-1") {
      setMode("edit") // Set mode to edit for gpt-image-1
      // Don't automatically show mask interface, let user click if needed
      // setShowMaskInterface(true)
    } else {
      setMode("variation") // Keep variation mode for dall-e-2
    }
  }

  const handleSetPrimaryImage = (index: number) => {
    if (!additionalImages || index < 0 || index >= additionalImages.length || !uploadedImage) return;

    const newPrimary = additionalImages[index];
    const oldPrimary = uploadedImage;

    setUploadedImage(newPrimary);
    setAdditionalImages(prev => {
      if (!prev) return [];
      const updated = [...prev];
      updated[index] = oldPrimary; // Replace the clicked image with the old primary
      return updated;
    });
    setMask(null); // Clear mask as the primary image changed
    setShowMaskInterface(false); // Close mask interface if open
    // Recalculate aspect ratio for the new primary image
    const img = new window.Image();
    img.src = newPrimary;
  };

  const handleRemoveImage = (index: number, isPrimary: boolean) => {
    if (isPrimary) {
      if (additionalImages && additionalImages.length > 0) {
        // Promote first additional image to primary
        const newPrimary = additionalImages[0];
        setUploadedImage(newPrimary);
        setAdditionalImages(additionalImages.slice(1));
        setMask(null); // Clear mask
        setShowMaskInterface(false);
        // Recalculate aspect ratio
        const img = new window.Image();
        img.src = newPrimary;
      } else {
        // No additional images left, clear everything
        setUploadedImage(null);
        setAdditionalImages(null);
        setMask(null);
        setMode("generate"); // Revert to generate mode
        setShowMaskInterface(false);
      }
    } else {
      // Remove from additionsl
      setAdditionalImages(prev => prev ? prev.filter((_, i) => i !== index) : null);
    }
  };

  return (
    <ScrollArea className="h-[calc(100vh-60px)]">
      <div className="space-y-6 p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* API Key Input */}
          <div className="flex gap-4">
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="OpenAI API Key"
              className="font-mono text-xs h-9"
            />
          </div>

          {/* Hidden file input - updated */}
          <input
            key={`${model}-file-input`} // Change key to force re-render on model change if needed
            ref={fileInputRef}
            type="file"
            accept={model === 'dall-e-2' ? DALLE2_ALLOWED_TYPES.join(',') : GPT_IMAGE_1_ALLOWED_TYPES.join(',')}
            className="hidden"
            onChange={handleImageUpload}
            multiple={model === 'gpt-image-1'} // Allow multiple only for gpt-image-1
          />

          {selectedRecord && (
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm sm:text-lg">
                <Eye />
                {selectedRecord.type === "generate" && <Sparkles />}
                {selectedRecord.type === "variation" && <Images />}
                {selectedRecord.type === "edit" && <Edit />}
                Viewing saved {selectedRecord.type} request
              </div>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setPrompt("")
                  setSize(model === "dall-e-2" ? "1024x1024" : "auto") // Reset size based on current model
                  setNumImages(1)
                  setMode("generate")
                  setUploadedImage(null)
                  setAdditionalImages(null); // Clear additional images
                  setMask(null)
                  setResults([])
                  onClearSelection()
                  setShowMaskInterface(false)
                  setShowCropper(false)
                  setOriginalImageFile(null)
                }}
              >
                <SquareX className="h-4 w-4" />
                <span className="hidden md:inline">Clear All</span>
              </Button>
            </div>
          )}
          {/* Prompt Input Section (Logic unchanged, but context for layout) */}
          {uploadedImage ? (
            <div className="flex gap-4 items-start"> {/* Main prompt/upload buttons row */}
              <div className="relative flex-1"> {/* Prompt input with popup */}
                <Input
                  value={prompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  placeholder={mode === "variation" ? "No prompt needed for variations" : "Enter your prompt here"}
                  maxLength={model === "gpt-image-1" ? 32000 : 1000}
                  className="flex-1 pr-10"
                  disabled={mode === "variation"}
                  required={mode === "generate" || mode === "edit"}
                />
                <Badge className={`hidden sm:block absolute right-10 top-1/2 -translate-y-1/2 text-xs font-mono`} variant={prompt.length > (model === "gpt-image-1" ? 32000 : 1000) ? 'destructive' : undefined}>
                  {prompt.length} / {model === "gpt-image-1" ? 32000 : 1000}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5.5 w-5.5 p-0 text-muted-foreground border"
                  onClick={openPromptPopup}
                  disabled={mode === "variation"}
                  aria-label="Edit prompt in popup"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2"> {/* Upload/Clear buttons */}
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  title={model === 'gpt-image-1' ? "Add more images" : "Replace image"}
                >
                  <ImagePlus className="h-4 w-4" />
                  <span className="hidden md:inline">
                    {/* Change Button Text based on Context */}
                    {model === 'gpt-image-1' ? "Add" : "Replace"}
                  </span>
                </Button>
                {/* Keep the "Clear All" button concept for simplicity */}
                <Button
                  type="button"
                  variant="destructive"
                  className="gap-2"
                  title="Clear all uploaded images"
                  onClick={() => {
                    setUploadedImage(null)
                    setAdditionalImages(null); // Clear additional images too
                    setMask(null)
                    setMode("generate")
                    setShowMaskInterface(false)
                    // Also reset file input if needed (careful with refs)
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                >
                  <ImageOff className="h-4 w-4" />
                  <span className="hidden md:inline">Clear Image(s)</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-4">{/* Prompt input section when no image uploaded */}
              <div className="relative flex-1"> {/* Prompt input with popup */}
                <Input
                  value={prompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  placeholder="Enter your prompt here"
                  maxLength={model === "gpt-image-1" ? 32000 : 1000}
                  className="flex-1 pr-10"
                  required
                />
                <Badge className={`p-1 hidden sm:block absolute right-10 top-1/2 -translate-y-1/2 text-xs font-mono`} variant={prompt.length > (model === "gpt-image-1" ? 32000 : 1000) ? 'destructive' : undefined}>
                  {prompt.length} / {model === "gpt-image-1" ? 32000 : 1000}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5.5 w-5.5 p-0 text-muted-foreground"
                  onClick={openPromptPopup}
                  aria-label="Edit prompt in popup"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                <span className="hidden md:inline">
                  {model === 'gpt-image-1' ? 'Upload (Multiple)' : 'Upload'}
                </span>
              </Button>
            </div>
          )}

          {/* --- Combined Image Management UI --- */}
          {uploadedImage && (
            <div className="border rounded-lg p-4 bg-muted/50 shadow">
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm font-medium">
                  {/* Title changes based on model and mode */}
                  {model === 'dall-e-2'
                    ? (mode === 'variation' ? 'Image to Vary' : 'Image to Edit')
                    : 'Image(s) to Edit'
                  }
                </div>
                {/* Mode switch buttons (only for DALL-E 2) */}
                {model === "dall-e-2" && (
                  <div className="flex items-center gap-2">
                    {/* DALL-E 2 variation/edit mode buttons remain unchanged here */}
                    <Button
                      type="button"
                      variant={mode === "variation" ? "default" : "outline"}
                      size="sm"
                      className="gap-2"
                      onClick={() => handleModeChange("variation")}
                    >
                      <Images className="h-4 w-4" />
                      <span className="hidden md:inline">Variation</span>
                    </Button>
                    <Button
                      type="button"
                      variant={mode === 'edit' ? 'default' : 'outline'}
                      size="sm"
                      className="gap-2"
                      onClick={() => handleModeChange("edit")}
                    >
                      <Edit className="h-4 w-4" />
                      <span className="hidden md:inline">Edit</span>
                    </Button>
                  </div>
                )}
              </div>

              {/* Grid for Primary and Additional Images (Primarily for gpt-image-1) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {/* Primary Image */}
                <div className="relative group aspect-square border-2 border-primary rounded-lg overflow-hidden">
                  <div className="w-full h-full relative">
                    <Image
                      src={uploadedImage}
                      alt="Primary image for editing"
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                      className="object-contain bg-background"
                    />
                    {/* Pulse effect inside masked area */}
                    {mask && mode !== "variation" && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          maskImage: `url(${mask})`,
                          WebkitMaskImage: `url(${mask})`,
                          maskPosition: "center",
                          WebkitMaskPosition: "center",
                          maskRepeat: "no-repeat",
                          WebkitMaskRepeat: "no-repeat",
                          maskSize: "contain",
                          WebkitMaskSize: "contain",
                          maskMode: "alpha",
                          background: "none",
                        }}
                      >
                        <div className="w-full h-full animate-pulse bg-primary/30" />
                      </div>
                    )}
                  </div>
                  {/* Remove Primary Button */}
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="Remove Image"
                    onClick={() => handleRemoveImage(0, true)}
                  >
                    <ImageMinus className="h-3 w-3" />
                  </Button>
                  {model === 'gpt-image-1' && (
                    <>
                      {/* Primary badge on top left */}
                      <Badge variant="secondary" className="absolute bottom-1 left-1 text-xs px-1.5 py-0.5 z-10">
                        Primary
                      </Badge>
                      {/* Mask indicator: only show if not in variation mode, on bottom left */}
                      {mask && mode !== "variation" && (
                        <Badge variant="outline" className="absolute bottom-8 left-1 text-xs px-1.5 py-0.5 z-10 bg-background/80">
                          Masked
                        </Badge>
                      )}
                      {/* Mask Edit/View Button on bottom right */}
                      {mode !== "variation" && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="absolute top-1 left-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          title={mask ? "Edit Mask" : "Create Mask"}
                          onClick={() => setShowMaskInterface(true)}
                        >
                          <Paintbrush className="h-3 w-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>

                {/* Additional Images (only for gpt-image-1) */}
                {model === 'gpt-image-1' && additionalImages && additionalImages.map((imgSrc, index) => (
                  <div key={index} className="relative group aspect-square border rounded-lg overflow-hidden cursor-pointer hover:border-primary/50"
                    title="Click to set as primary image"
                    onClick={() => handleSetPrimaryImage(index)}
                  >
                    <Image
                      src={imgSrc}
                      alt={`Additional image ${index + 1}`}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                      className="object-contain bg-background shadow" // Use white bg for non-primary previews
                    />
                    {/* Remove Additional Button */}
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Remove Image"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent setting as primary when clicking remove
                        handleRemoveImage(index, false);
                      }}
                    >
                      <ImageMinus className="h-3 w-3" />
                    </Button>
                    {/* Make Primary affordance */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium p-1 text-center z-0">
                      Set Primary
                    </div>
                  </div>
                ))}
              </div>

              {/* Instructions / Info Area below the grid */}
              <div className="mt-3 text-sm text-muted-foreground">
                {model === 'gpt-image-1' ? (
                  <div>
                    <span>
                      Click an image thumbnail to make it the{" "}
                      <Badge variant="secondary" className="text-xs px-1 py-0 align-middle">
                        Primary
                      </Badge>{" "}
                      image for editing.
                    </span>
                    <span className="ml-1">
                      Use the{" "}
                      <Paintbrush className="inline h-3 w-3 mx-0.5 align-middle" />
                      <span className="align-middle">button on the primary image to create or edit its mask.</span>
                    </span>
                    <span className="block mt-1">
                      Edits based on the prompt will be applied according to the mask (or to the whole image if no mask is present). Only the primary image is sent for editing.
                    </span>
                  </div>
                ) : (
                  <span>
                    {mode === 'variation'
                      ? "Generates variations of the uploaded image."
                      : (
                        <>
                          Use the <Paintbrush className="inline h-3 w-3 mx-0.5 align-middle" />
                          <span className="align-middle">icon to edit the mask. Painted areas indicate where edits based on the prompt will occur. A mask is required for DALL-E 2 edits.</span>
                        </>
                      )
                    }
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="sm:hidden">
                <Select value={numImages.toString()} onValueChange={(value) => setNumImages(parseInt(value))}>
                  <SelectTrigger>
                    <div className="flex items-center gap-2">
                      <Images className="h-4 w-4" />
                      <SelectValue placeholder="Number of images" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Number of Images</SelectLabel>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                        <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="hidden sm:block">
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={[numImages]}
                  onValueChange={([value]) => setNumImages(value)}
                  className="my-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground px-2">
                  <div className="w-0.5 h-1.5 bg-muted-foreground"></div>
                  <div className="w-0.5 h-1.5 bg-muted-foreground"></div>
                  <div className="w-0.5 h-1.5 bg-muted-foreground"></div>
                  <div className="w-0.5 h-1.5 bg-muted-foreground"></div>
                  <div className="w-0.5 h-1.5 bg-muted-foreground"></div>
                  <div className="w-0.5 h-1.5 bg-muted-foreground"></div>
                  <div className="w-0.5 h-1.5 bg-muted-foreground"></div>
                  <div className="w-0.5 h-1.5 bg-muted-foreground"></div>
                  <div className="w-0.5 h-1.5 bg-muted-foreground"></div>
                  <div className="w-0.5 h-1.5 bg-muted-foreground"></div>
                </div>
                <div className="text-xs text-muted-foreground text-center">{numImages}</div>
              </div>
            </div>
            <div className="w-32">
              <Select value={size} onValueChange={(value: "256x256" | "512x512" | "1024x1024" | "1536x1024" | "1024x1536" | "auto") => setSize(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Image Size</SelectLabel>
                    {model === "dall-e-2" ? (
                      <>
                        <SelectItem value="256x256">
                          <div className="flex items-center gap-2">
                            <Square className="h-4 w-4" />
                            <span>256px</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="512x512">
                          <div className="flex items-center gap-2">
                            <Grid2X2 className="h-4 w-4" />
                            <span>512px</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="1024x1024">
                          <div className="flex items-center gap-2">
                            <Grid3X3 className="h-4 w-4" />
                            <span>1024px</span>
                          </div>
                        </SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="1024x1024">
                          <div className="flex items-center gap-2">
                            <Grid3X3 className="h-4 w-4" />
                            <span>Square</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="1536x1024">
                          <div className="flex items-center gap-2">
                            <RectangleHorizontal className="h-4 w-4" />
                            <span>Landscape</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="1024x1536">
                          <div className="flex items-center gap-2">
                            <RectangleVertical className="h-4 w-4" />
                            <span>Portrait</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="auto">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4" />
                            <span>Auto</span>
                          </div>
                        </SelectItem>
                      </>
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              className="w-full sm:w-auto justify-center" // Full width on small screens
              disabled={
                isLoading ||
                !apiKey ||
                (
                  (mode === 'edit' || mode === 'variation') &&
                  !uploadedImage
                ) ||
                (mode === 'edit' && model === 'dall-e-2' && !mask)
              }
              title={
                !apiKey ? "API Key required" :
                  ((mode === 'edit' || mode === 'variation') && !uploadedImage) ? `Upload an image first` :
                    (mode === 'edit' && model === 'dall-e-2' && !mask) ? "Create a mask for DALL·E 2 edit mode" :
                      undefined
              }
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Processing...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    Generate
                    {getEstimatedCost() && parseFloat(getEstimatedCost()) > 0 && (
                      <Badge variant="secondary" className="ml-1.5 font-mono text-xs tabular-nums px-1.5 py-0.5">
                        ${getEstimatedCost()}
                      </Badge>
                    )}
                  </span>
                </div>
              )}
            </Button>
          </div>

          {/* Model-specific options (gpt-image-1) */}
          {model === "gpt-image-1" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Background</label>
                <Select value={background} onValueChange={(value: "transparent" | "opaque" | "auto") => setBackground(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select background" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="transparent">Transparent</SelectItem>
                    <SelectItem value="opaque">Opaque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Moderation</label>
                <Select value={moderation} onValueChange={(value: "low" | "auto") => setModeration(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select moderation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Format</label>
                <Select value={outputFormat} onValueChange={(value: "png" | "jpeg" | "webp") => setOutputFormat(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpeg">JPEG</SelectItem>
                    <SelectItem value="webp">WebP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Quality</label>
                <Select value={quality} onValueChange={(value: "auto" | "high" | "medium" | "low") => setQuality(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select quality" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {outputFormat !== 'png' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Output Compression ({outputCompression}%)</label>
                  <Slider
                    value={[outputCompression]}
                    onValueChange={([value]) => setOutputCompression(value)}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>
              )}
            </div>
          )}
        </form>

        {/* Crop Interface (Logic mostly unchanged) */}
        {showCropper && originalImageFile && (
          <CropInterface
            image={originalImageFile}
            onCropComplete={handleCropComplete}
            onCancel={() => {
              setShowCropper(false)
              setOriginalImageFile(null)
              // Clear states if crop is cancelled fully
              setUploadedImage(null);
              setAdditionalImages(null);
              setMode("generate");
            }}
          />
        )}

        {/* Mask Interface (Logic mostly unchanged, uses updated primary image) */}
        {showMaskInterface && uploadedImage && (
          <MaskInterface
            image={uploadedImage}
            onMaskComplete={(maskImage) => {
              if (!maskImage) {
                setMask(null);
                if (model === "dall-e-2") setMode("variation");
              } else {
                setMask(maskImage);
              }
              setShowMaskInterface(false);
            }}
            onCancel={() => {
              setShowMaskInterface(false);
              // Cancelling mask doesn't change image or mode for gpt-image-1
              // For DALL-E 2, revert to variation if cancelling mask creation and none existed
              if (!mask && model === "dall-e-2") {
                setMode("variation");
              }
            }}
          />
        )}

        {/* Loading Skeletons */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: numImages }).map((_, index) => (
              <div key={index} className="relative aspect-square">
                <Skeleton className="w-full h-full rounded-lg" />
                <div className="absolute inset-0 flex items-center justify-center animate-spin">
                  <LoaderPinwheel className="h-6 w-6 text-primary" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((base64Image, index) => (
              <div key={index} className="relative aspect-square group">
                <div className="relative w-full h-full">
                  {base64Image ? (
                    <Image
                      src={base64Image}
                      alt={`Generated image ${index + 1}`}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-contain rounded-lg shadow"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted rounded-lg">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openOriginalImage(base64Image)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDownload(base64Image, index)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSelectAsUpload(base64Image)}
                  >
                    <ImagePlus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Prompt Popup Dialog */}
        <Dialog open={isPromptPopupOpen} onOpenChange={setIsPromptPopupOpen}>
          <DialogContent className="sm:max-w-[625px] select-none">
            <DialogHeader>
              <DialogTitle>Edit Prompt</DialogTitle>
              <DialogDescription>
                {model === "gpt-image-1"
                  ? "GPT Image 1"
                  : "DALL·E 2"
                }
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Textarea
                value={popupPromptText}
                onChange={(e) => handlePopupPromptChange(e.target.value)}
                placeholder="Enter your prompt here"
                className={cn(
                  "min-h-[200px] max-h-[60vh] resize-y",
                  isPromptOverLimit(popupPromptText) && "text-destructive"
                )}
                style={{ wordBreak: "break-word" }}
              />
              <div className="text-xs text-right mt-1">
                <span className={cn(
                  isPromptOverLimit(popupPromptText) ? "text-destructive" : "text-muted-foreground"
                )}>
                  {popupPromptText.length} / {model === "gpt-image-1" ? "32,000" : "1,000"} characters
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsPromptPopupOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={savePopupPrompt}>
                Save Prompt
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </ScrollArea>
  )
}
