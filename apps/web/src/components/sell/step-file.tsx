'use client';

/**
 * Step 1: the file (E13.2, SDD §3.23 "drop a file").
 *
 * This is the only step that touches the seller's own document, and it is worth being explicit
 * about what happens to it: the bytes are read by this page, canonicalised here, committed to here
 * and sealed here. Nothing is uploaded until step 5, and what is uploaded then is ciphertext
 * (SDD §3.2, "all plaintext handling stays in the browser").
 */
import { FileUpload } from '@/components/ui/file-upload-1';
import { Problem } from '@/components/sell/fields';

/** A memo is small. The gateway's own cap is 16 MiB; this is the size a knowledge good really is. */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

export function StepFile({
  name,
  problem,
  onFile,
}: {
  name: string | null;
  problem: string | null;
  onFile: (file: File) => void;
}) {
  return (
    <div className="space-y-4">
      <FileUpload
        title="The good"
        description="A Markdown or plain-text document. It is read in this tab and never uploaded as it is."
        accept=".md,.txt"
        maxSizeBytes={MAX_DOCUMENT_BYTES}
        uploaded={name === null ? null : { name, status: 'completed' }}
        onSelect={onFile}
      />
      {problem === null ? null : <Problem>{problem}</Problem>}
      <p className="text-xs text-muted-foreground">
        Nothing leaves the browser here. The next step turns the file into the exact bytes the
        commitment is taken over, and shows you that commitment before anything is signed.
      </p>
    </div>
  );
}
