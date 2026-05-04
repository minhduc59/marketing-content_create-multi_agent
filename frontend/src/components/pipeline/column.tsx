"use client";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import type { ColumnConfig, BoardCard } from "@/lib/pipeline/stages";
import { PipelineCard } from "./card";

interface Props {
  config: ColumnConfig;
  cards: BoardCard[];
  isPendingReview?: boolean;
  onCardClick: (card: BoardCard) => void;
}

export function PipelineColumn({ config, cards, isPendingReview, onCardClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: config.id });

  return (
    <div className="flex w-72 shrink-0 flex-col">
      {/* Colored top bar + header */}
      <div className={cn("h-1 w-full rounded-t-md", config.topBarClass)} />
      <div className="flex items-center justify-between rounded-b-none border border-t-0 border-border bg-muted/40 px-3 py-2">
        <span className="text-sm font-semibold">{config.label}</span>
        <div className="flex items-center gap-1.5">
          {isPendingReview && cards.length > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {cards.length}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{cards.length}</span>
        </div>
      </div>

      {/* Card list */}
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex-1 min-h-[200px] space-y-2 rounded-b-md border border-t-0 border-border p-2 transition-colors",
            isOver && "bg-muted/60 border-dashed",
            cards.length === 0 && "border-dashed"
          )}
        >
          {cards.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-md">
              <p className="text-xs text-muted-foreground">Drop here</p>
            </div>
          ) : (
            cards.map((card) => (
              <PipelineCard
                key={card.id}
                card={card}
                onClick={() => onCardClick(card)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
