export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3000";
export const MEDIA_URL =
  process.env.NEXT_PUBLIC_MEDIA_URL || "http://localhost:8000/static";

export function getMediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.startsWith("http")) return key;
  return `${MEDIA_URL}/${key}`;
}
