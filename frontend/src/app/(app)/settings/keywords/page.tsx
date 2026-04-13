"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useSettingsStore } from "@/stores/settings-store";

const industries = [
  "technology",
  "finance",
  "healthcare",
  "education",
  "marketing",
  "design",
  "startup",
];

export default function KeywordsPage() {
  const { keywords, industry, addKeyword, removeKeyword, setIndustry } =
    useSettingsStore();
  const [newKeyword, setNewKeyword] = useState("");

  function handleAdd() {
    if (newKeyword.trim()) {
      addKeyword(newKeyword);
      setNewKeyword("");
      toast.success("Keyword added");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Industry</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {industries.map((ind) => (
                <SelectItem key={ind} value={ind}>
                  {ind.charAt(0).toUpperCase() + ind.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keywords</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {keywords.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No keywords set. Add keywords to filter scan results.
              </p>
            ) : (
              keywords.map((kw) => (
                <Badge key={kw} variant="secondary" className="gap-1 pr-1">
                  {kw}
                  <button
                    onClick={() => {
                      removeKeyword(kw);
                      toast.success("Keyword removed");
                    }}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="keyword" className="sr-only">
                New keyword
              </Label>
              <Input
                id="keyword"
                placeholder="Add a keyword..."
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <Button onClick={handleAdd} disabled={!newKeyword.trim()}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
