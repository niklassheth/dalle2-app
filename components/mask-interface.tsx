"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "./ui/scroll-area"
import type { DataURL } from "@/lib/url-types"

interface MaskInterfaceProps {
    image: DataURL  // Working state is always DataURL
    onMaskComplete: (mask: string) => void  // Returns DataURL string from canvas.toDataURL()
    onCancel: () => void
}

export function MaskInterface({ image, onMaskComplete, onCancel }: MaskInterfaceProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null)
    const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null)
    const [maskCanvas, setMaskCanvas] = useState<HTMLCanvasElement | null>(null)
    const [maskCtx, setMaskCtx] = useState<CanvasRenderingContext2D | null>(null)
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
    const [brushSize, setBrushSize] = useState(20)
    const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null)

    const renderCanvas = useCallback(() => {
        if (!ctx || !canvasRef.current || !originalImage || !maskCanvas) return

        // Clear the display canvas
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)

        // Draw checkerboard pattern first, matching theme
        // Get theme colors from CSS variables
        const getCSSVar = (name: string, fallback: string) => {
            if (typeof window === "undefined") return fallback
            const val = getComputedStyle(document.documentElement).getPropertyValue(name)
            return val ? val.trim() : fallback
        }
        const bg = getCSSVar('--accent', '#e5e7eb')
        const fg = getCSSVar('--background', '#ffffff')
        // Create checkerboard pattern
        const size = 20
        const patternCanvas = document.createElement('canvas')
        patternCanvas.width = size * 2
        patternCanvas.height = size * 2
        const pctx = patternCanvas.getContext('2d')
        if (pctx) {
            pctx.fillStyle = bg
            pctx.fillRect(0, 0, patternCanvas.width, patternCanvas.height)
            pctx.fillStyle = fg
            pctx.fillRect(0, 0, size, size)
            pctx.fillRect(size, size, size, size)
        }
        const pattern = ctx.createPattern(patternCanvas, 'repeat')
        if (pattern) {
            ctx.fillStyle = pattern
            ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        }

        // Draw the original image masked by the mask
        ctx.globalCompositeOperation = "source-over"

        // Create a temporary canvas for the masked original image
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = canvasRef.current.width
        tempCanvas.height = canvasRef.current.height
        const tempCtx = tempCanvas.getContext('2d')
        if (tempCtx) {
            // Draw the original image
            tempCtx.drawImage(originalImage, 0, 0)
            // Use the mask as alpha
            tempCtx.globalCompositeOperation = "destination-in"
            tempCtx.drawImage(maskCanvas, 0, 0)
            // Draw the result on main canvas
            ctx.drawImage(tempCanvas, 0, 0)
        }
    }, [ctx, originalImage, maskCanvas])

    useEffect(() => {
        // Load image first to get dimensions
        const img = new Image()
        img.src = image
        img.onload = () => {
            setOriginalImage(img)
            setCanvasSize({ width: img.width, height: img.height })
            // Calculate initial brush size proportional to image width (20:1024)
            setBrushSize(Math.round((img.width / 1024) * 20))

            const canvas = canvasRef.current
            if (!canvas) return

            // Set canvas size to match image
            canvas.width = img.width
            canvas.height = img.height

            const context = canvas.getContext("2d", { willReadFrequently: true })
            if (!context) return
            setCtx(context)

            // Create mask canvas with same dimensions
            const mCanvas = document.createElement("canvas")
            mCanvas.width = img.width
            mCanvas.height = img.height
            const mContext = mCanvas.getContext("2d", { willReadFrequently: true })
            if (!mContext) return

            // Initialize mask as solid white (fully opaque)
            mContext.fillStyle = "white"
            mContext.fillRect(0, 0, mCanvas.width, mCanvas.height)

            setMaskCanvas(mCanvas)
            setMaskCtx(mContext)
        }
    }, [image])

    // Add effect to render canvas when dependencies are ready
    useEffect(() => {
        if (ctx && originalImage && maskCanvas) {
            renderCanvas()
        }
    }, [ctx, originalImage, maskCanvas, renderCanvas])

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!maskCtx || !canvasRef.current) return
        setIsDrawing(true)

        const rect = canvasRef.current.getBoundingClientRect()
        let x, y

        if ('touches' in e) {
            const touch = e.touches[0]
            x = (touch.clientX - rect.left) * (canvasRef.current.width / rect.width)
            y = (touch.clientY - rect.top) * (canvasRef.current.height / rect.height)
        } else {
            x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width)
            y = (e.clientY - rect.top) * (canvasRef.current.height / rect.height)
        }

        // Draw initial point
        maskCtx.globalCompositeOperation = "destination-out"
        maskCtx.beginPath()
        maskCtx.arc(x, y, brushSize, 0, Math.PI * 2)
        maskCtx.fill()

        setLastPoint({ x, y })
        renderCanvas()
    }

    const stopDrawing = () => {
        setIsDrawing(false)
        setLastPoint(null)
    }

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !ctx || !canvasRef.current || !originalImage || !maskCtx || !lastPoint) return

        const rect = canvasRef.current.getBoundingClientRect()
        let currentX, currentY

        if ('touches' in e) {
            // Touch event
            const touch = e.touches[0]
            currentX = (touch.clientX - rect.left) * (canvasRef.current.width / rect.width)
            currentY = (touch.clientY - rect.top) * (canvasRef.current.height / rect.height)
        } else {
            // Mouse event
            currentX = (e.clientX - rect.left) * (canvasRef.current.width / rect.width)
            currentY = (e.clientY - rect.top) * (canvasRef.current.height / rect.height)
        }

        // Draw line from last point to current point on the mask
        maskCtx.globalCompositeOperation = "destination-out"
        maskCtx.lineWidth = brushSize * 2 // Use diameter for line width
        maskCtx.lineCap = "round"
        maskCtx.lineJoin = "round"
        maskCtx.beginPath()
        maskCtx.moveTo(lastPoint.x, lastPoint.y)
        maskCtx.lineTo(currentX, currentY)
        maskCtx.stroke()

        // Update the last point
        setLastPoint({ x: currentX, y: currentY })

        // Render the updated state
        renderCanvas()
    }

    const createCheckerboardPattern = (ctx: CanvasRenderingContext2D) => {
        const patternCanvas = document.createElement("canvas")
        const patternContext = patternCanvas.getContext("2d")
        if (!patternContext) return "#fff"

        patternCanvas.width = 20
        patternCanvas.height = 20

        // Draw checkerboard
        patternContext.fillStyle = "#e5e5e5"
        patternContext.fillRect(0, 0, 10, 10)
        patternContext.fillRect(10, 10, 10, 10)
        patternContext.fillStyle = "#ffffff"
        patternContext.fillRect(0, 10, 10, 10)
        patternContext.fillRect(10, 0, 10, 10)

        return ctx.createPattern(patternCanvas, "repeat") || "#fff"
    }

    const handleComplete = useCallback(() => {
        if (!maskCanvas) return;

        // Check if the mask is "empty" (all alpha = 0, or all white)
        const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        const { width, height } = maskCanvas;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Check if all pixels are fully opaque (default, unmasked)
        let allOpaque = true;
        let allTransparent = true;
        for (let i = 0; i < data.length; i += 4) {
            // If any alpha is not 255, it's not fully opaque
            if (data[i + 3] !== 255) {
                allOpaque = false;
            }
            // If any alpha is not 0, it's not fully transparent
            if (data[i + 3] !== 0) {
                allTransparent = false;
            }
            // Early exit if both are false
            if (!allOpaque && !allTransparent) break;
        }

        // If mask is fully opaque (unchanged), treat as "no mask"
        // If mask is fully transparent, also treat as "no mask"
        if (allOpaque || allTransparent) {
            // Do not apply or send the mask, mark as unmasked
            onMaskComplete(""); // Send empty string or null to indicate unmasked
        } else {
            // Mask has been drawn, send the mask
            onMaskComplete(maskCanvas.toDataURL("image/png"));
        }
    }, [maskCanvas, onMaskComplete]);

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs">
            <div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg">
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <Label>Brush Size: {brushSize}px</Label>
                            <Slider
                                min={1}
                                // Adjust max brush size to be proportional to image width
                                max={Math.round((canvasSize.width / 1024) * 100)}
                                step={1}
                                value={[brushSize]}
                                onValueChange={([value]) => setBrushSize(value)}
                                className="my-2"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <ScrollArea className="h-[calc(70vh-80px)] -mr-2">
                            <div className="relative space-y-2">
                                <div className="relative w-full h-auto pr-2">
                                    <canvas
                                        ref={canvasRef}
                                        width={canvasSize.width}
                                        height={canvasSize.height}
                                        style={{
                                            width: "100%",
                                            height: "auto",
                                            aspectRatio: canvasSize.width ? `${canvasSize.width}/${canvasSize.height}` : "1",
                                            cursor: (() => {
                                                // Get theme colors from CSS variables
                                                const getCSSVar = (name: string, fallback: string) => {
                                                    if (typeof window === "undefined") return fallback;
                                                    const val = getComputedStyle(document.documentElement).getPropertyValue(name);
                                                    return val ? val.trim() : fallback;
                                                };
                                                const brushPx = brushSize * (1024 / canvasSize.width);
                                                const fill = getCSSVar('--background', '#fff'); // fallback to blue-500
                                                const stroke = getCSSVar('--foreground', '#000');
                                                // SVG with theme fill and stroke
                                                const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${brushPx}' height='${brushPx}'><circle cx='${brushPx / 2}' cy='${brushPx / 2}' r='${brushPx / 2 - 1}' fill='${fill.replace(/#/g, '%23')}' fill-opacity='0.3' stroke='${stroke.replace(/#/g, '%23')}' stroke-width='1'/></svg>`;
                                                return `url("data:image/svg+xml,${svg}") ${brushPx / 2} ${brushPx / 2}, auto`;
                                            })()
                                        }}
                                        className="touch-none border rounded-lg"
                                        onMouseDown={startDrawing}
                                        onMouseUp={stopDrawing}
                                        onMouseOut={stopDrawing}
                                        onMouseMove={draw}
                                        onTouchStart={startDrawing}
                                        onTouchEnd={stopDrawing}
                                        onTouchMove={draw}
                                    />
                                </div>
                                <div className="bg-background/80 p-2 text-xs text-center rounded-lg">
                                    Paint the areas you want to edit
                                </div>
                            </div>
                        </ScrollArea>
                    </div>
                    <div className="flex justify-end gap-4">
                        <Button variant="outline" type="button" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={handleComplete}>Apply Mask</Button>
                    </div>
                </div>
            </div>
        </div>
    )
} 