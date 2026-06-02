// Nén ảnh phía client (chỉ chạy trong browser) trước khi upload:
// resize cạnh dài nhất về <= MAX_EDGE và re-encode JPEG quality QUALITY.
// Giảm dung lượng Drive + băng thông upload đáng kể so với ảnh gốc từ điện thoại.

const MAX_EDGE = 1600;
const QUALITY = 0.8;

export type CompressedImage = { base64: string; mimeType: string };

export async function compressImage(file: File | Blob): Promise<CompressedImage> {
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  let { width, height } = img;
  if (width > MAX_EDGE || height > MAX_EDGE) {
    const scale = MAX_EDGE / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Không vẽ được canvas → trả ảnh gốc làm fallback.
    return { base64: stripDataUrl(dataUrl), mimeType: file.type || "image/jpeg" };
  }
  ctx.drawImage(img, 0, 0, width, height);

  const outUrl = canvas.toDataURL("image/jpeg", QUALITY);
  return { base64: stripDataUrl(outUrl), mimeType: "image/jpeg" };
}

function readAsDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Không đọc được tệp ảnh"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không tải được ảnh"));
    img.src = src;
  });
}

function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
