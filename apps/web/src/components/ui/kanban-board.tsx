"use client";

import React, {
  Dispatch,
  SetStateAction,
  useState,
  DragEvent,
  FormEvent,
} from "react";
import { Plus, Trash2, Flame } from "lucide-react";
import { motion } from "framer-motion";

export type KanbanColumnId = string;

export type KanbanCard = {
  id: string;
  title: string;
  column: KanbanColumnId;
};

export type KanbanColumnSpec = {
  id: KanbanColumnId;
  title: string;
  headingClassName?: string;
};

export type KanbanProps = {
  columns: KanbanColumnSpec[];
  cards: KanbanCard[];
  onChange: (cards: KanbanCard[]) => void;
  burnBarrel?: boolean;
  className?: string;
};

export function Kanban({ columns, cards, onChange, burnBarrel = false, className }: KanbanProps) {
  return (
    <div className={"flex h-full w-full gap-3 overflow-auto " + (className ?? "")}>
      {columns.map((col) => (
        <Column
          key={col.id}
          column={col}
          cards={cards}
          setCards={(updater) => {
            const next = typeof updater === "function" ? (updater as (prev: KanbanCard[]) => KanbanCard[])(cards) : updater;
            onChange(next);
          }}
        />
      ))}
      {burnBarrel && (
        <BurnBarrel
          setCards={(updater) => {
            const next = typeof updater === "function" ? (updater as (prev: KanbanCard[]) => KanbanCard[])(cards) : updater;
            onChange(next);
          }}
        />
      )}
    </div>
  );
}

function Column({
  column,
  cards,
  setCards,
}: {
  column: KanbanColumnSpec;
  cards: KanbanCard[];
  setCards: Dispatch<SetStateAction<KanbanCard[]>>;
}) {
  const [active, setActive] = useState(false);

  const handleDragStart = (e: DragEvent, card: KanbanCard) => {
    e.dataTransfer.setData("cardId", card.id);
  };

  const handleDragEnd = (e: DragEvent) => {
    const cardId = e.dataTransfer.getData("cardId");
    setActive(false);
    clearHighlights();
    const indicators = getIndicators();
    const { element } = getNearestIndicator(e, indicators);
    const before = element.dataset.before || "-1";
    if (before !== cardId) {
      setCards((prev) => {
        let copy = [...prev];
        let cardToTransfer = copy.find((c) => c.id === cardId);
        if (!cardToTransfer) return prev;
        cardToTransfer = { ...cardToTransfer, column: column.id };
        copy = copy.filter((c) => c.id !== cardId);
        if (before === "-1") copy.push(cardToTransfer);
        else {
          const idx = copy.findIndex((el) => el.id === before);
          if (idx < 0) return prev;
          copy.splice(idx, 0, cardToTransfer);
        }
        return copy;
      });
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    highlightIndicator(e);
    setActive(true);
  };

  const clearHighlights = (els?: HTMLElement[]) => {
    const indicators = els ?? getIndicators();
    indicators.forEach((i) => (i.style.opacity = "0"));
  };

  const highlightIndicator = (e: DragEvent) => {
    const indicators = getIndicators();
    clearHighlights(indicators);
    const el = getNearestIndicator(e, indicators);
    el.element.style.opacity = "1";
  };

  const getNearestIndicator = (e: DragEvent, indicators: HTMLElement[]) => {
    const DISTANCE_OFFSET = 50;
    return indicators.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = e.clientY - (box.top + DISTANCE_OFFSET);
        if (offset < 0 && offset > closest.offset) return { offset, element: child };
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY, element: indicators[indicators.length - 1]! },
    );
  };

  const getIndicators = () =>
    Array.from(document.querySelectorAll<HTMLElement>(`[data-column="${column.id}"]`));

  const handleDragLeave = () => {
    clearHighlights();
    setActive(false);
  };

  const filtered = cards.filter((c) => c.column === column.id);

  return (
    <div className="w-64 shrink-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className={"font-medium text-sm " + (column.headingClassName ?? "text-muted-foreground")}>{column.title}</h3>
        <span className="rounded text-xs text-muted-foreground">{filtered.length}</span>
      </div>
      <div
        onDrop={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={"h-full w-full rounded-md transition-colors " + (active ? "bg-muted/50" : "bg-transparent")}
      >
        {filtered.map((c) => (
          <Card key={c.id} card={c} onDragStart={handleDragStart} />
        ))}
        <DropIndicator beforeId={null} column={column.id} />
        <AddCard column={column.id} setCards={setCards} />
      </div>
    </div>
  );
}

function Card({
  card,
  onDragStart,
}: {
  card: KanbanCard;
  onDragStart: (e: DragEvent, c: KanbanCard) => void;
}) {
  return (
    <>
      <DropIndicator beforeId={card.id} column={card.column} />
      <motion.div
        layout
        layoutId={card.id}
        className="cursor-grab rounded border bg-card p-3 text-card-foreground shadow-sm active:cursor-grabbing"
      >
        <div draggable onDragStart={(e) => onDragStart(e as unknown as DragEvent, card)}>
          <p className="text-sm">{card.title}</p>
        </div>
      </motion.div>
    </>
  );
}

function DropIndicator({ beforeId, column }: { beforeId: string | null; column: string }) {
  return (
    <div
      data-before={beforeId ?? "-1"}
      data-column={column}
      className="my-0.5 h-0.5 w-full bg-primary opacity-0"
    />
  );
}

function BurnBarrel({ setCards }: { setCards: Dispatch<SetStateAction<KanbanCard[]>> }) {
  const [active, setActive] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        const cardId = e.dataTransfer.getData("cardId");
        setCards((pv) => pv.filter((c) => c.id !== cardId));
        setActive(false);
      }}
      className={
        "mt-10 grid h-40 w-64 shrink-0 place-content-center rounded border text-2xl " +
        (active ? "border-destructive bg-destructive/20 text-destructive" : "border-muted-foreground/30 bg-muted/30 text-muted-foreground")
      }
    >
      {active ? <Flame className="animate-bounce" size={24} /> : <Trash2 size={24} />}
    </div>
  );
}

function AddCard({
  column,
  setCards,
}: {
  column: KanbanColumnId;
  setCards: Dispatch<SetStateAction<KanbanCard[]>>;
}) {
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!text.trim().length) return;
    setCards((pv) => [...pv, { id: Math.random().toString(36).slice(2), column, title: text.trim() }]);
    setText("");
    setAdding(false);
  };

  return adding ? (
    <motion.form layout onSubmit={handleSubmit}>
      <textarea
        onChange={(e) => setText(e.target.value)}
        autoFocus
        placeholder="Add task..."
        className="w-full rounded border bg-background p-2 text-sm focus:outline-none"
      />
      <div className="mt-1.5 flex items-center justify-end gap-1.5">
        <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground" type="button">
          Close
        </button>
        <button type="submit" className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90">
          <span>Add</span>
          <Plus size={14} />
        </button>
      </div>
    </motion.form>
  ) : (
    <motion.button
      layout
      onClick={() => setAdding(true)}
      className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <span>Add card</span>
      <Plus size={14} />
    </motion.button>
  );
}
