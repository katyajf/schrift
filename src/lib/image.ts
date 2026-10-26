// Client-side resize before upload. 2000px on the long edge keeps handwriting
// legible for the model while turning a 5–10 MB phone photo into ~400–800 KB.

const MAX_EDGE = 2000;
const QUALITY = 0.85;

export async function compressImage(file: File): Promise<Blob> {
  // imageOrientation applies the EXIF rotation, so portrait photos stay upright.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("Couldn't compress the image");
  return blob;
}
