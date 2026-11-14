'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { FileText, Loader2, Upload, X } from 'lucide-react';

/**
 * Reusable dropzone-style file picker used across onboarding (DPA upload),
 * evidence artifact submission, and document upload UIs.
 *
 * Controlled: parent owns the picked file + upload outcome. The component
 * only handles selection + drag/drop UX. Hand it an `onSelect` and an
 * optional `uploaded` summary for the post-upload chip.
 *
 *   <FileUpload
 *     title="DPA upload"
 *     description="Drag & drop, or choose, a signed Data Processing Agreement."
 *     accept=".pdf,.docx,.md,.txt"
 *     maxSizeBytes={25 * 1024 * 1024}
 *     busy={uploading}
 *     uploaded={uploaded}
 *     onSelect={onDpaUpload}
 *     primaryLabel="Upload DPA"
 *   />
 */

export type UploadedSummary = {
  name: string;
  sizeBytes?: number;
  status?: 'completed' | 'processing' | 'failed';
  /** Optional click handler for "remove" — when omitted, the X is hidden. */
  onClear?: () => void;
};

export type FileUploadProps = {
  title?: string;
  description?: string;
  accept?: string;
  maxSizeBytes?: number;
  busy?: boolean;
  uploaded?: UploadedSummary | null;
  onSelect: (file: File) => void | Promise<void>;
  primaryLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  className?: string;
  /** Stable id so multiple FileUploads on one page don't collide. */
  inputId?: string;
};

export function FileUpload({
  title,
  description,
  accept,
  maxSizeBytes,
  busy = false,
  uploaded,
  onSelect,
  primaryLabel,
  cancelLabel,
  onCancel,
  className,
  inputId,
}: FileUploadProps) {
  const id = React.useId();
  const finalId = inputId ?? `file-upload-${id}`;
  const [pending, setPending] = React.useState<File | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const accepted = React.useMemo(
    () =>
      accept
        ? accept
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : null,
    [accept],
  );

  const validate = React.useCallback(
    (file: File): string | null => {
      if (maxSizeBytes && file.size > maxSizeBytes) {
        return `File too large (max ${formatBytes(maxSizeBytes)}).`;
      }
      if (accepted && accepted.length > 0) {
        const ok = accepted.some((ext) => {
          if (ext.startsWith('.')) return file.name.toLowerCase().endsWith(ext.toLowerCase());
          return file.type === ext;
        });
        if (!ok) return `Unsupported file type. Allowed: ${accepted.join(', ')}.`;
      }
      return null;
    },
    [accepted, maxSizeBytes],
  );

  const accept2 = accepted?.join(',');

  const handleFile = React.useCallback(
    async (file: File) => {
      const err = validate(file);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      setPending(file);
      if (!primaryLabel) {
        await onSelect(file);
      }
    },
    [onSelect, primaryLabel, validate],
  );

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0];
    if (f) void handleFile(f);
    e.currentTarget.value = '';
  };

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const onPrimary = async () => {
    if (!pending) return;
    await onSelect(pending);
    setPending(null);
  };

  return (
    <div className={cn('w-full', className)}>
      {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}

      <Label
        htmlFor={finalId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'mt-3 flex cursor-pointer items-center justify-center gap-3 rounded-md border border-dashed px-6 py-8 transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/40',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
        <div className="text-sm text-foreground">
          <span className="font-medium text-primary">
            {pending ? 'Choose a different file' : 'Drag & drop or choose a file'}
          </span>
          {accept && (
            <p className="text-[11px] text-muted-foreground">Accepted: {accept}</p>
          )}
          {maxSizeBytes && (
            <p className="text-[11px] text-muted-foreground">
              Max size: {formatBytes(maxSizeBytes)}
            </p>
          )}
        </div>
        <input
          id={finalId}
          name={finalId}
          type="file"
          className="sr-only"
          accept={accept2}
          onChange={onChange}
          disabled={busy}
          data-testid={finalId}
        />
      </Label>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {(pending || uploaded) && (
        <div className="relative mt-4 rounded-md border bg-muted/40 p-3">
          {(pending && !busy) || uploaded?.onClear ? (
            <div className="absolute right-1 top-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-sm p-2 text-muted-foreground hover:text-foreground"
                aria-label="Remove"
                onClick={() => {
                  if (pending) setPending(null);
                  uploaded?.onClear?.();
                }}
              >
                <X className="size-4 shrink-0" />
              </Button>
            </div>
          ) : null}
          <div className="flex items-center space-x-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-background shadow-sm ring-1 ring-inset ring-input">
              {busy ? (
                <Loader2 className="size-5 animate-spin text-foreground" />
              ) : (
                <FileText className="size-5 text-foreground" />
              )}
            </span>
            <div className="w-full">
              <p className="truncate text-xs font-medium text-foreground">
                {pending?.name ?? uploaded?.name}
              </p>
              <p className="mt-0.5 flex justify-between text-[11px] text-muted-foreground">
                <span>
                  {formatBytes(pending?.size ?? uploaded?.sizeBytes ?? 0) || '—'}
                </span>
                <span>
                  {busy
                    ? 'Uploading…'
                    : uploaded
                      ? (uploaded.status ?? 'completed')
                      : 'Ready'}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {primaryLabel && (
        <div className="mt-4 flex items-center justify-end gap-2">
          {cancelLabel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setPending(null);
                setError(null);
                onCancel?.();
              }}
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={busy || !pending}
            onClick={onPrimary}
          >
            {busy ? 'Uploading…' : primaryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

export default FileUpload;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
