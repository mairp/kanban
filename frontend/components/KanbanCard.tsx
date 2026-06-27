'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/lib/types';

interface Props {
  card: Card;
  onDelete: (id: string) => void;
  isOverlay?: boolean;
}

export default function KanbanCard({ card, onDelete, isOverlay }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.3 : 1,
  };

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={isOverlay ? undefined : style}
      className={`bg-white rounded-lg p-3 shadow-sm border border-gray-100 group relative
        cursor-grab active:cursor-grabbing select-none
        ${isOverlay ? 'shadow-xl rotate-2 scale-105' : 'hover:shadow-md'}
        transition-shadow`}
      {...(isOverlay ? {} : { ...attributes, ...listeners })}
    >
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 transition-opacity text-xs rounded-full hover:bg-red-50"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(card.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Delete card"
      >
        ✕
      </button>
      <p className="font-medium text-sm text-[#032147] pr-5 leading-snug">{card.title}</p>
      {card.details && (
        <p className="text-xs text-[#888888] mt-1.5 leading-relaxed">{card.details}</p>
      )}
    </div>
  );
}
