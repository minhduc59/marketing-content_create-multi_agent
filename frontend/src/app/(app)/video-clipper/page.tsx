"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Scissors, Link, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  createVideoTask,
  triggerVideoPipeline,
  uploadMedia,
  listFonts,
  listCaptionTemplates,
  type Font,
  type CaptionTemplate,
} from "@/lib/api/video";

export default function VideoClipperPage() {
  const router = useRouter();

  const [sourceType, setSourceType] = useState<"url" | "upload">("url");
  const [urlInput, setUrlInput] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [maxClips, setMaxClips] = useState(5);
  const [fontId, setFontId] = useState("");
  const [captionTemplateId, setCaptionTemplateId] = useState("");
  const [fonts, setFonts] = useState<Font[]>([]);
  const [templates, setTemplates] = useState<CaptionTemplate[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    listFonts()
      .then(setFonts)
      .catch(() => {});
    listCaptionTemplates()
      .then(setTemplates)
      .catch(() => {});
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    fileRef.current = file;
    setFileName(file?.name ?? null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceType === "url" && !urlInput.trim()) return;
    if (sourceType === "upload" && !fileRef.current) return;

    setIsSubmitting(true);
    try {
      let sourceRef = urlInput.trim();

      if (sourceType === "upload" && fileRef.current) {
        const formData = new FormData();
        formData.append("file", fileRef.current);
        const uploaded = await uploadMedia(formData);
        sourceRef = uploaded.url;
      }

      const task = await createVideoTask({
        sourceType,
        sourceRef,
        fontId: fontId || undefined,
        captionTemplateId: captionTemplateId || undefined,
        maxClips,
      });

      await triggerVideoPipeline(task.id);
      router.push(`/video-clipper/${task.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create video task"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Scissors className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Video Clipper</h1>
          <p className="text-sm text-muted-foreground">
            Turn long-form video into viral short clips for TikTok.
          </p>
        </div>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">New Task</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Source type tabs */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSourceType("url");
                  setFileName(null);
                  fileRef.current = null;
                }}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  sourceType === "url"
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <Link className="h-4 w-4" />
                YouTube URL
              </button>
              <button
                type="button"
                onClick={() => setSourceType("upload")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  sourceType === "upload"
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <Upload className="h-4 w-4" />
                Upload Video
              </button>
            </div>

            {/* Source input */}
            {sourceType === "url" ? (
              <div className="space-y-1">
                <Label htmlFor="url">YouTube URL</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            ) : (
              <div
                className="cursor-pointer rounded-lg border-2 border-dashed p-8 text-center hover:border-foreground/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  accept="video/*"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  disabled={isSubmitting}
                  className="hidden"
                />
                <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                {fileName ? (
                  <p className="text-sm font-medium">{fileName}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">Click to upload video</p>
                    <p className="text-xs text-muted-foreground">MP4, MOV, WebM up to 500 MB</p>
                  </>
                )}
              </div>
            )}

            {/* Max clips */}
            <div className="space-y-2">
              <Label htmlFor="maxClips">Max Clips: {maxClips}</Label>
              <input
                id="maxClips"
                type="range"
                min={1}
                max={10}
                step={1}
                value={maxClips}
                onChange={(e) => setMaxClips(Number(e.target.value))}
                disabled={isSubmitting}
                className="w-full accent-foreground"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1</span>
                <span>10</span>
              </div>
            </div>

            {/* Font picker */}
            {fonts.length > 0 && (
              <div className="space-y-1">
                <Label>Font (optional)</Label>
                <Select value={fontId} onValueChange={setFontId} disabled={isSubmitting}>
                  <SelectTrigger>
                    <SelectValue placeholder="Default font" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Default font</SelectItem>
                    {fonts.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Caption template picker */}
            {templates.length > 0 && (
              <div className="space-y-1">
                <Label>Caption Template (optional)</Label>
                <Select
                  value={captionTemplateId}
                  onValueChange={setCaptionTemplateId}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Default template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Default template</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={
                isSubmitting ||
                (sourceType === "url" && !urlInput.trim()) ||
                (sourceType === "upload" && !fileRef.current)
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting…
                </>
              ) : (
                "Process Video"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
