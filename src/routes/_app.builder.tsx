import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BuilderBlock } from "@/components/builder/BuilderBlock";
import { BlockPalette } from "@/components/builder/BlockPalette";
import { ExecutionModal } from "@/components/execution/ExecutionModal";
import { useBuilderStore } from "@/lib/stores";
import { BLOCK_META } from "@/lib/blocks-meta";
import type { BlockType } from "@/lib/types";

export const Route = createFileRoute("/_app/builder")({
  component: BuilderPage,
});

function BuilderPage() {
  const { name, description, blocks, setName, setDescription, addBlock, removeBlock, moveBlock } = useBuilderStore();
  const [open, setOpen] = useState(false);

  const onAdd = (type: BlockType) => {
    const meta = BLOCK_META[type];
    addBlock({ id: `${type}-${Date.now()}`, type, title: meta.label, subtitle: meta.description });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
        <div className="min-w-0 flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="border-0 bg-transparent px-0 font-display !text-3xl shadow-none focus-visible:ring-0" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 border-0 bg-transparent px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full"><Save className="h-4 w-4" />Save</Button>
          <Button onClick={() => setOpen(true)} className="rounded-full"><Play className="h-4 w-4" />Test run</Button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <BlockPalette onAdd={onAdd} />
        <div className="min-h-[500px] rounded-2xl border bg-card/40 p-6 dot-grid">
          <div className="mx-auto flex max-w-md flex-col items-center gap-3">
            <AnimatePresence>
              {blocks.map((bl, i) => (
                <div key={bl.id} className="w-full">
                  <BuilderBlock
                    block={bl}
                    first={i === 0}
                    last={i === blocks.length - 1}
                    onRemove={() => removeBlock(bl.id)}
                    onMoveUp={() => moveBlock(bl.id, -1)}
                    onMoveDown={() => moveBlock(bl.id, 1)}
                  />
                  {i < blocks.length - 1 && <div className="mx-auto my-1 h-6 w-px bg-border" />}
                </div>
              ))}
            </AnimatePresence>
            {blocks.length === 0 && (
              <div className="py-16 text-center text-sm text-muted-foreground">
                Add a block from the palette to get started.
              </div>
            )}
          </div>
        </div>
      </div>
      <ExecutionModal open={open} onOpenChange={setOpen} />
    </div>
  );
}