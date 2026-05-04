"use client";
import { useState, useCallback } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { COLUMN_ORDER, COLUMN_CONFIG, stageToDragStatus, type BoardCard, type PipelineStage } from "@/lib/pipeline/stages";
import { PipelineColumn } from "./column";
import { PipelineCard } from "./card";
import { DetailSheet } from "./detail-sheet";
import { useUpdatePostStatus } from "@/hooks/api/use-posts";

interface Props {
  columns: Map<PipelineStage, BoardCard[]>;
}

export function PipelineBoard({ columns }: Props) {
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const updateStatus = useUpdatePostStatus();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Build a flat map id→card for lookup during drag
  const cardMap = new Map<string, BoardCard>();
  COLUMN_ORDER.forEach((stage) => {
    const cards = columns.get(stage) ?? [];
    cards.forEach((card) => cardMap.set(card.id, card));
  });

  function handleDragStart({ active }: DragStartEvent) {
    setActiveCard(cardMap.get(active.id as string) ?? null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveCard(null);
    if (!over) return;

    const card = cardMap.get(active.id as string);
    if (!card || card.type === "scan") return;

    const targetStage = over.id as PipelineStage;
    if (targetStage === card.stage) return;
    if (targetStage === "posted" || card.stage === "posted") {
      toast.error("Cannot drag into or out of Posted");
      return;
    }

    const newStatus = stageToDragStatus(targetStage);
    if (!newStatus) {
      toast.error("Manual drag to this stage isn't supported — use the pipeline actions");
      return;
    }

    if (!card.post) return;
    updateStatus.mutate({ id: card.post.id, status: newStatus });
  }

  const handleCardClick = useCallback((card: BoardCard) => setSelectedCard(card), []);

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMN_ORDER.map((stage) => (
            <PipelineColumn
              key={stage}
              config={COLUMN_CONFIG[stage]}
              cards={columns.get(stage) ?? []}
              isPendingReview={stage === "pending_review"}
              onCardClick={handleCardClick}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? (
            <PipelineCard card={activeCard} onClick={() => {}} isDragOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      <DetailSheet
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
      />
    </>
  );
}
