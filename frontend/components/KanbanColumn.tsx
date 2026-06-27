'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Column } from '@/lib/types';
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
      {/* Colored accent bar */}
      <div className="h-1 rounded-t-xl" style={{ backgroundColor: column.color }} />

      {/* Column container */}
      <div className="bg-white rounded-b-xl rounded-tr-xl flex flex-col shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
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
              className="font-bold text-sm text-[#032147] bg-transparent border-b-2 border-[#209dd7] outline-none flex-1 min-w-0"
            />
          ) : (
            <h2
              onClick={() => { setTitleValue(column.title); setIsEditing(true); }}
              title="Click to rename"
              className="font-bold text-sm text-[#032147] cursor-pointer hover:text-[#209dd7] transition-colors flex-1 truncate"
            >
              {column.title}
            </h2>
          )}
          <span
            className="ml-2 text-xs text-[#888888] bg-gray-100 rounded-full px-2 py-0.5 font-medium flex-shrink-0"
          >
            {column.cards.length}
          </span>
        </div>

        {/* Cards droppable area */}
        <div
          ref={setNodeRef}
          className={`flex flex-col gap-2 flex-1 min-h-28 p-3 rounded-b-xl transition-colors
            ${isOver ? 'bg-blue-50' : 'bg-transparent'}`}
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
            <div className="bg-white rounded-lg p-3 border border-[#209dd7] shadow-sm">
              <input
                autoFocus
                placeholder="Card title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') cancelAdd(); }}
                className="w-full text-sm font-medium text-[#032147] outline-none placeholder:text-gray-300"
              />
              <textarea
                placeholder="Details (optional)"
                value={newDetails}
                onChange={(e) => setNewDetails(e.target.value)}
                rows={2}
                className="w-full text-xs text-[#888888] mt-2 outline-none resize-none placeholder:text-gray-200"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={commitAdd}
                  className="px-3 py-1 text-xs text-white bg-[#753991] rounded-md hover:bg-[#5e2d7a] transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={cancelAdd}
                  className="px-3 py-1 text-xs text-[#888888] hover:text-[#032147] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="text-xs text-[#888888] hover:text-[#753991] hover:bg-purple-50 rounded-lg p-2 text-left transition-colors"
            >
              + Add card
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
