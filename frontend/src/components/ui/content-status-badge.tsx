import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ContentStatus } from "@/lib/api/types";

const statusConfig: Record<ContentStatus, { label: string; className: string }> = {
  [ContentStatus.DRAFT]: {
    label: "Draft",
    className: "border-slate-200 bg-slate-50 text-slate-600",
  },
  [ContentStatus.APPROVED]: {
    label: "Approved",
    className: "border-green-200 bg-green-50 text-green-700",
  },
  [ContentStatus.NEEDS_REVISION]: {
    label: "Needs Revision",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  [ContentStatus.FLAGGED_FOR_REVIEW]: {
    label: "Flagged",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  [ContentStatus.PUBLISHED]: {
    label: "Published",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
};

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={cn("font-medium", config.className)}>
      {config.label}
    </Badge>
  );
}
