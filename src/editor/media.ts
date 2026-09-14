import { supabase } from "@/lib/supabase";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export class ImageUploadError extends Error {}

export type PreparedImage = { file: File; previewUrl: string };

export function isTemporaryImageSource(src: unknown): boolean {
  return typeof src === "string" && src.startsWith("blob:");
}

function extensionFor(type: string) {
  return type === "image/webp" ? "webp" : type === "image/png" ? "png" : type === "image/gif" ? "gif" : "jpg";
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.size > MAX_IMAGE_BYTES) throw new ImageUploadError("L’image dépasse la limite de 20 Mo.");
  if (file.type === "image/svg+xml") throw new ImageUploadError("Les images SVG ne sont pas prises en charge.");
  if (!acceptedTypes.has(file.type)) throw new ImageUploadError("Utilisez une image JPEG, PNG, WebP ou GIF.");
  if (file.type === "image/gif") return { file, previewUrl: URL.createObjectURL(file) };

  if (typeof createImageBitmap !== "function") {
    throw new ImageUploadError("Ce navigateur ne peut pas préparer cette image.");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new ImageUploadError("Préparation de l’image impossible.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  const output = webp && webp.size < file.size ? new File([webp], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" }) : file;
  return { file: output, previewUrl: URL.createObjectURL(output) };
}

export async function uploadImage(file: File, cardId: string) {
  if (!supabase) throw new ImageUploadError("Service média indisponible.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ImageUploadError("Authentification requise.");
  const form = new FormData();
  form.set("file", file);
  form.set("cardId", cardId);
  form.set("extension", extensionFor(file.type));
  const mediaApi = import.meta.env.VITE_MEDIA_API_URL ?? (import.meta.env.PROD ? "https://media.boardly.francklebas.com/api/media" : "/api/media");
  const response = await fetch(mediaApi, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!response.ok) throw new ImageUploadError((await response.json().catch(() => null))?.error ?? "Upload de l’image impossible.");
  return response.json() as Promise<{ storagePath: string; src: string }>;
}

/** Resolve a private R2 reference for display without putting credentials in the DOM. */
export async function resolveImageSource(src: string, storagePath: string | null): Promise<string> {
  if (!storagePath) return src;
  if (!supabase) return src;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return src;
  const response = await fetch(src, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new ImageUploadError("Image inaccessible.");
  return URL.createObjectURL(await response.blob());
}
