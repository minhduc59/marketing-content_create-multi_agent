"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { PipelineStatusBadge } from "./pipeline-status-badge";

export function Header() {
  const { toggleSidebar } = useUIStore();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b bg-background px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={toggleSidebar}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      <PipelineStatusBadge />
    </header>
  );
}
