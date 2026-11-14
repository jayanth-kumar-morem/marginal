"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import { Keyboard } from "lucide-react";

export type ShortcutGroup = {
  heading: string;
  shortcuts: Array<{ keys: string[]; description: string }>;
};

export type ShortcutHelpDialogProps = {
  trigger?: React.ReactNode;
  groups: ShortcutGroup[];
};

export function ShortcutHelpDialog({ trigger, groups }: ShortcutHelpDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" aria-label="Keyboard shortcuts">
            <Keyboard className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Speed up governance workflows.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-2">
          {groups.map((g) => (
            <section key={g.heading}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.heading}
              </h4>
              <ul className="space-y-2">
                {g.shortcuts.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-foreground">{s.description}</span>
                    <span className="flex items-center gap-1">
                      {s.keys.map((k, j) => (
                        <Kbd key={j}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
