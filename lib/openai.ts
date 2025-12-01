export function dataURLtoBlob(dataURL: string): Blob {
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

interface GPTImage1Options {
  background?: "transparent" | "opaque" | "auto"
  moderation?: "low" | "auto"
  outputCompression?: number
  outputFormat?: "png" | "jpeg" | "webp"
  quality?: "auto" | "high" | "medium" | "low"
}

export async function generateImage(
  apiKey: string,
  prompt: string,
  n: number,
  size: string,
  model: "dall-e-2" | "gpt-image-1" = "dall-e-2",
  options?: GPTImage1Options
) {
  const body: {
    prompt: string;
    n: number;
    size: string;
    model: "dall-e-2" | "gpt-image-1";
    response_format?: string;
    background?: "transparent" | "opaque" | "auto";
    moderation?: "low" | "auto";
    output_compression?: number;
    output_format?: "png" | "jpeg" | "webp";
    quality?: "auto" | "high" | "medium" | "low";
  } = {
    prompt,
    n,
    size,
    model
  }

  if (model === "dall-e-2") {
    body.response_format = "b64_json"
  }

  if (model === "gpt-image-1") {
    if (options?.background) body.background = options.background
    if (options?.moderation) body.moderation = options.moderation
    if (options?.outputCompression) body.output_compression = options.outputCompression
    if (options?.outputFormat) body.output_format = options.outputFormat
    if (options?.quality) body.quality = options.quality
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Failed to generate image")
  }

  return response.json()
}

export async function createImageVariation(
  apiKey: string,
  imageDataUrl: string,
  n: number,
  size: string,
  model: "dall-e-2" | "gpt-image-1" = "dall-e-2"
) {
  const blob = dataURLtoBlob(imageDataUrl)

  const formData = new FormData()
  formData.append("image", blob, "image.png")
  formData.append("n", n.toString())
  formData.append("size", size)
  formData.append("model", model)

  if (model === "dall-e-2") {
    formData.append("response_format", "b64_json")
  }

  const response = await fetch("https://api.openai.com/v1/images/variations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Failed to create image variation")
  }

  return response.json()
}

export async function createImageEdit(
  apiKey: string,
  imageDataUrl: string,
  maskDataUrl: string | null,
  prompt: string,
  n: number,
  size: string,
  model: "dall-e-2" | "gpt-image-1" = "dall-e-2"
) {
  const imageBlob = dataURLtoBlob(imageDataUrl);

  const formData = new FormData();
  formData.append("image", imageBlob, "image.png");

  // For DALL-E 2, mask is required. For gpt-image-1, mask is optional.
  if (model === "dall-e-2" || (model === "gpt-image-1" && maskDataUrl)) {
    if (maskDataUrl) {
      const maskBlob = dataURLtoBlob(maskDataUrl);
      formData.append("mask", maskBlob, "mask.png");
    }
  }

  formData.append("prompt", prompt);
  formData.append("n", n.toString());
  formData.append("size", size);
  formData.append("model", model);

  if (model === "dall-e-2") {
    formData.append("response_format", "b64_json");
  }

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to create image edit");
  }

  return response.json();
}
