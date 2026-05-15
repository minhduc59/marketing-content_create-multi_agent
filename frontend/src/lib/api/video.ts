import apiClient from "./client";

// ── Types ─────────────────────────────────────────────────────────────────

export interface Font {
  id: string;
  name: string;
  storageUrl: string;
  isDefault: boolean;
}

export interface CaptionTemplate {
  id: string;
  name: string;
  fontSize: number;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  verticalPosition: string;
  isDefault: boolean;
}

export type VideoTaskStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "analyzing"
  | "clipping"
  | "captioning"
  | "uploading"
  | "completed"
  | "error"
  | "cancelled";

export type VideoClipStatus = "draft" | "approved" | "rejected" | "published" | "failed";

export interface VideoClip {
  id: string;
  taskId: string;
  clipIndex: number;
  storageUrl: string;
  storagePublicId: string;
  durationSeconds: number;
  startMs: number;
  endMs: number;
  transcriptSegment: string | null;
  llmScore: number | null;
  llmRationale: string | null;
  status: VideoClipStatus;
  feedback: string | null;
  createdAt: string;
}

export interface VideoTask {
  id: string;
  userId: string;
  sourceType: "url" | "upload";
  sourceRef: string;
  status: VideoTaskStatus;
  progress: number;
  progressMessage: string | null;
  errorMessage: string | null;
  maxClips: number;
  createdAt: string;
  completedAt: string | null;
  clips?: VideoClip[];
}

// ── Requests ──────────────────────────────────────────────────────────────

export interface CreateVideoTaskDto {
  sourceType: "url" | "upload";
  sourceRef: string;
  fontId?: string;
  captionTemplateId?: string;
  maxClips?: number;
  scanRunId?: string;
}

export interface ReviewClipDto {
  action: "approve" | "reject";
  feedback?: string;
}

// ── API functions ─────────────────────────────────────────────────────────

export async function createVideoTask(dto: CreateVideoTaskDto): Promise<VideoTask> {
  const { data } = await apiClient.post("/video-tasks", dto);
  return data;
}

export async function getVideoTask(taskId: string): Promise<VideoTask> {
  const { data } = await apiClient.get(`/video-tasks/${taskId}`);
  return data;
}

export async function triggerVideoPipeline(taskId: string): Promise<{ taskId: string; status: string }> {
  const { data } = await apiClient.post(`/video-tasks/${taskId}/trigger-pipeline`);
  return data;
}

export async function reviewClip(clipId: string, dto: ReviewClipDto): Promise<VideoClip> {
  const { data } = await apiClient.patch(`/video-clips/${clipId}/review`, dto);
  return data;
}

export async function listFonts(): Promise<Font[]> {
  const { data } = await apiClient.get("/fonts");
  return data;
}

export async function createFont(formData: FormData): Promise<Font> {
  const { data } = await apiClient.post("/fonts", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function listCaptionTemplates(): Promise<CaptionTemplate[]> {
  const { data } = await apiClient.get("/caption-templates");
  return data;
}

export async function createCaptionTemplate(
  dto: Omit<CaptionTemplate, "id" | "isDefault">
): Promise<CaptionTemplate> {
  const { data } = await apiClient.post("/caption-templates", dto);
  return data;
}

export async function uploadMedia(formData: FormData): Promise<{ url: string; publicId: string }> {
  const { data } = await apiClient.post("/media/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
