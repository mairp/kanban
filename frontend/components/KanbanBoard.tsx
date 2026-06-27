'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Column, Card } from '@/lib/types';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function KanbanBoard() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const ownMutation = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/board`);
      const data = await res.json();
      setColumns(data.columns);
    } catch (err) {
      console.error('Failed to fetch board:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  useEffect(() => {
    const es = new EventSource(`${API_URL}/api/board/events`);
    es.onmessage = () => {
      if (ownMutation.current) {
        ownMutation.current = false;
        return;
      }
      fetchBoard();
    };
    return () => es.close();
  }, [fetchBoard]);

  function findCard(id: string): Card | undefined {
    for (const col of columns) {
      const card = col.cards.find((c) => c.id === id);
      if (card) return card;
    }
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveCard(findCard(active.id as string) ?? null);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    setColumns((prev) => {
      const srcIdx = prev.findIndex((col) => col.cards.some((c) => c.id === activeId));
      if (srcIdx === -1) return prev;

      let dstIdx = prev.findIndex((col) => col.id === overId);
      if (dstIdx === -1) dstIdx = prev.findIndex((col) => col.cards.some((c) => c.id === overId));
      if (dstIdx === -1 || srcIdx === dstIdx) return prev;

      const next = prev.map((col) => ({ ...col, cards: [...col.cards] }));
      const srcCards = next[srcIdx].cards;
      const activePos = srcCards.findIndex((c) => c.id === activeId);
      const [card] = srcCards.splice(activePos, 1);

      const dstCards = next[dstIdx].cards;
      const overPos = dstCards.findIndex((c) => c.id === overId);
      if (overPos >= 0) {
        dstCards.splice(overPos, 0, card);
      } else {
        dstCards.push(card);
      }

      return next;
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveCard(null);
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    let finalColumns = columns;

    setColumns((prev) => {
      const next = prev.map((col) => ({ ...col, cards: [...col.cards] }));

      const srcColIdx = next.findIndex((col) => col.cards.some((c) => c.id === activeId));
      if (srcColIdx === -1) return prev;

      let dstColIdx = next.findIndex((col) => col.id === overId);
      if (dstColIdx === -1) dstColIdx = next.findIndex((col) => col.cards.some((c) => c.id === overId));
      if (dstColIdx === -1) return prev;

      if (srcColIdx === dstColIdx) {
        const cards = next[srcColIdx].cards;
        const from = cards.findIndex((c) => c.id === activeId);
        const to = cards.findIndex((c) => c.id === overId);
        if (to >= 0 && from !== to) {
          next[srcColIdx].cards = arrayMove(cards, from, to);
        }
      }

      finalColumns = next;
      return next;
    });

    const dstCol = finalColumns.find((col) => col.cards.some((c) => c.id === activeId))
      ?? finalColumns.find((col) => col.id === overId);

    if (!dstCol) return;

    const toPosition = dstCol.cards.findIndex((c) => c.id === activeId);

    ownMutation.current = true;
    fetch(`${API_URL}/api/board/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: activeId, toColumnId: dstCol.id, toPosition }),
    }).catch(() => {
      ownMutation.current = false;
      fetchBoard();
    });
  }

  async function handleRename(columnId: string, title: string) {
    setColumns((prev) =>
      prev.map((col) => (col.id === columnId ? { ...col, title } : col))
    );
    ownMutation.current = true;
    await fetch(`${API_URL}/api/board/columns/${columnId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  }

  async function handleAddCard(columnId: string, title: string, details: string) {
    ownMutation.current = true;
    const res = await fetch(`${API_URL}/api/board/columns/${columnId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, details }),
    });
    if (res.ok) {
      const card: Card = await res.json();
      setColumns((prev) =>
        prev.map((col) =>
          col.id === columnId ? { ...col, cards: [...col.cards, card] } : col
        )
      );
    }
  }

  async function handleDeleteCard(columnId: string, cardId: string) {
    setColumns((prev) =>
      prev.map((col) =>
        col.id === columnId
          ? { ...col, cards: col.cards.filter((c) => c.id !== cardId) }
          : col
      )
    );
    ownMutation.current = true;
    await fetch(`${API_URL}/api/board/columns/${columnId}/cards/${cardId}`, {
      method: 'DELETE',
    });
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-[#888888] text-sm">Loading board…</div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-5 p-6 overflow-x-auto flex-1 items-start min-h-0">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            onRename={handleRename}
            onAddCard={handleAddCard}
            onDeleteCard={handleDeleteCard}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <KanbanCard card={activeCard} onDelete={() => {}} isOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
