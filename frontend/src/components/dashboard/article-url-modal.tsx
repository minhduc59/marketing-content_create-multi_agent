"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreatePostFromArticle } from "@/hooks/api/use-posts";
import { articleSchema, type ArticleInput } from "@/lib/api/posts";

interface ArticleUrlModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ArticleUrlModal({ open, onOpenChange }: ArticleUrlModalProps) {
  const mutation = useCreatePostFromArticle();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ArticleInput>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      url: "",
      options: { num_posts: 3 },
    },
  });

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  async function onSubmit(values: ArticleInput) {
    await mutation.mutateAsync(values);
    onOpenChange(false);
  }

  const pending = isSubmitting || mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>From Article URL</DialogTitle>
          <DialogDescription>
            Paste a public article URL. We&apos;ll crawl it and generate posts
            using the same pipeline as a trend scan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">Article URL</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://example.com/blog/great-article"
              autoFocus
              {...register("url")}
            />
            {errors.url && (
              <p className="text-xs text-destructive">{errors.url.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="num_posts">Number of posts (1–10)</Label>
            <Input
              id="num_posts"
              type="number"
              min={1}
              max={10}
              {...register("options.num_posts", { valueAsNumber: true })}
            />
            {errors.options?.num_posts && (
              <p className="text-xs text-destructive">
                {errors.options.num_posts.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
