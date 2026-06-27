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
      className={`glass rounded-xl p-3 group relative
        cursor-grab active:cursor-grabbing select-none
        ${isOverlay ? 'rotate-2 scale-105 shadow-[0_16px_40px_rgba(0,0,0,0.45)]' : 'hover:bg-white/[0.14] hover:-translate-y-0.5'}
        transition-all duration-150`}
      {...(isOverlay ? {} : { ...attributes, ...listeners })}
    >
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-white/40 hover:text-rose-300 transition-all text-xs rounded-full hover:bg-rose-400/20"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(card.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Delete card"
      >
        ✕
      </button>
      <p className="font-medium text-sm text-[var(--text-primary)] pr-5 leading-snug">{card.title}</p>
      {card.details && (
        <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">{card.details}</p>
      )}
    </div>
  );
}
