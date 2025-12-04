"use client"

import { useCallback, useState } from "react"
import Cropper from "react-easy-crop"
import { Button } from "./ui/button"
import type { Area } from "react-easy-crop"
import type { DataURL } from "@/lib/url-types"

interface CropInterfaceProps {
    image: DataURL  // Working state is always DataURL
    onCropComplete: (croppedImage: string) => void  // Returns DataURL string from canvas.toDataURL()
    onCancel: () => void
    aspectRatio?: number
}

export function CropInterface({ image, onCropComplete, onCancel, aspectRatio = 1 }: CropInterfaceProps) {
    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

    const onCropChange = useCallback((location: { x: number; y: number }) => {
        setCrop(location)
    }, [])

    const onZoomChange = useCallback((newZoom: number) => {
        setZoom(newZoom)
    }, [])

    const onCropAreaChange = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
        setCroppedAreaPixels(croppedAreaPixels)
    }, [])

    const createCroppedImage = useCallback(async () => {
        if (!croppedAreaPixels) return

        const canvas = document.createElement("canvas")
        const img = new Image()
        img.src = image

        await new Promise((resolve) => (img.onload = resolve))

        canvas.width = croppedAreaPixels.width
        canvas.height = croppedAreaPixels.height

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        ctx.drawImage(
            img,
            croppedAreaPixels.x,
            croppedAreaPixels.y,
            croppedAreaPixels.width,
            croppedAreaPixels.height,
            0,
            0,
            croppedAreaPixels.width,
            croppedAreaPixels.height
        )

        const croppedImage = canvas.toDataURL("image/png")
        onCropComplete(croppedImage)
    }, [croppedAreaPixels, image, onCropComplete])

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs">
            <div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg">
                <div className="relative h-[400px]">
                    <Cropper
                        image={image}
                        crop={crop}
                        zoom={zoom}
                        aspect={aspectRatio}
                        onCropChange={onCropChange}
                        onZoomChange={onZoomChange}
                        onCropComplete={onCropAreaChange}
                    />
                </div>
                <div className="flex justify-end gap-4">
                    <Button variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button onClick={createCroppedImage}>Crop Image</Button>
                </div>
            </div>
        </div>
    )
} 