'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Column } from '@/lib/types';
import { columnAccent } from '@/lib/theme';
import KanbanCard from './KanbanCard';

interface Props {
  column: Column;
  onRename: (id: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
}

export default function KanbanColumn({ column, onRename, onAddCard, onDeleteCard }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [titleValue, setTitleValue] = useState(column.title);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDetails, setNewDetails] = useState('');

  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const accent = columnAccent(column.id, column.color);

  function commitRename() {
    const trimmed = titleValue.trim();
    if (trimmed) onRename(column.id, trimmed);
    else setTitleValue(column.title);
    setIsEditing(false);
  }

  function commitAdd() {
    if (newTitle.trim()) {
      onAddCard(column.id, newTitle.trim(), newDetails.trim());
      setNewTitle('');
      setNewDetails('');
      setIsAdding(false);
    }
  }

  function cancelAdd() {
    setIsAdding(false);
    setNewTitle('');
    setNewDetails('');
  }

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Glow accent bar */}
      <div
        className="h-1 rounded-t-2xl"
        style={{ backgroundColor: accent.color, boxShadow: `0 0 14px ${accent.glow}` }}
      />

      {/* Column container */}
      <div
        className="glass-strong rounded-b-2xl rounded-tr-2xl flex flex-col transition-shadow"
        style={isOver ? { boxShadow: `0 0 0 1.5px ${accent.color}, 0 12px 40px ${accent.glow}` } : undefined}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          {isEditing ? (
            <input
              autoFocus
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setTitleValue(column.title); setIsEditing(false); }
              }}
              className="font-semibold text-sm text-white bg-transparent border-b-2 outline-none flex-1 min-w-0"
              style={{ borderColor: accent.color }}
            />
          ) : (
            <h2
              onClick={() => { setTitleValue(column.title); setIsEditing(true); }}
              title="Click to rename"
              className="font-semibold text-sm cursor-pointer transition-colors flex-1 truncate flex items-center gap-2"
              style={{ color: accent.color }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: accent.color, boxShadow: `0 0 8px ${accent.glow}` }}
              />
              <span className="text-[var(--text-primary)]">{column.title}</span>
            </h2>
          )}
          <span className="ml-2 text-xs text-[var(--text-muted)] bg-white/10 rounded-full px-2 py-0.5 font-medium flex-shrink-0">
            {column.cards.length}
          </span>
        </div>

        {/* Cards droppable area */}
        <div
          ref={setNodeRef}
          className={`flex flex-col gap-2 flex-1 min-h-28 p-3 rounded-b-2xl transition-colors
            ${isOver ? 'bg-white/[0.06]' : 'bg-transparent'}`}
        >
          <SortableContext
            items={column.cards.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {column.cards.map((card) => (
              <KanbanCard
                key={card.id}
                card={card}
                onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              />
            ))}
          </SortableContext>

          {/* Add card form / button */}
          {isAdding ? (
            <div className="glass rounded-xl p-3" style={{ boxShadow: `0 0 0 1px ${accent.color}` }}>
              <input
                autoFocus
                placeholder="Card title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') cancelAdd(); }}
                className="w-full text-sm font-medium text-white bg-transparent outline-none placeholder:text-white/30"
              />
              <textarea
                placeholder="Details (optional)"
                value={newDetails}
                onChange={(e) => setNewDetails(e.target.value)}
                rows={2}
                className="w-full text-xs text-[var(--text-muted)] bg-transparent mt-2 outline-none resize-none placeholder:text-white/20"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={commitAdd}
                  className="px-3 py-1 text-xs text-white rounded-md bg-gradient-to-r from-fuchsia-500/80 to-violet-500/80 hover:from-fuchsia-500 hover:to-violet-500 transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={cancelAdd}
                  className="px-3 py-1 text-xs text-[var(--text-muted)] hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="text-xs text-[var(--text-muted)] hover:text-white hover:bg-white/10 rounded-lg p-2 text-left transition-colors"
            >
              + Add card
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
