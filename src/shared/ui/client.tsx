"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import type { FormState } from "@/shared/actions-types";
import { useFormStatus } from "react-dom";



export function SubmitButton({ children, className = "btn btn-primary", pendingText = "Guardando…", disabled }: { children: React.ReactNode; className?: string; pendingText?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Formulario con server action que devuelve { error } u { ok }. */
export function ActionForm({
  action,
  children,
  className = "grid gap-4",
  resetOnOk = false,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  resetOnOk?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && <p role="alert" className="notice notice-danger">{state.error}</p>}
      {state?.ok && <p role="status" className="notice notice-ok">{state.ok}</p>}
    </form>
  );
}

export function CopyButton({ text, label = "Copiar enlace", className = "btn btn-ghost btn-sm" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          window.prompt("Copiá el enlace:", text);
        }
      }}
    >
      {done ? "Copiado" : label}
    </button>
  );
}

/** Selector de imagen con vista previa y validación previa (el servidor vuelve a validar). */
export function ImageInput({ name, current, label, hint = "JPG, PNG o WebP, hasta 5 MB.", maxMb = 5, accept = "image/jpeg,image/png,image/webp" }: { name: string; current?: string | null; label: string; hint?: string; maxMb?: number; accept?: string }) {
  const [preview, setPreview] = useState<string | null>(current ?? null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="field">
      <label htmlFor={`f-${name}`}>{label}</label>
      <div className="flex flex-wrap items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Vista previa" className="h-20 w-20 rounded-lg border border-line object-cover" />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-line text-xs text-muted">Sin imagen</div>
        )}
        <input
          id={`f-${name}`}
          name={name}
          type="file"
          accept={accept}
          className="max-w-full text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setErr(null);
            if (!f) return;
            if (!accept.split(",").includes(f.type)) {
              setErr("Formato no admitido.");
              e.target.value = "";
              return;
            }
            if (f.size > maxMb * 1024 * 1024) {
              setErr(`El archivo supera ${maxMb} MB.`);
              e.target.value = "";
              return;
            }
            if (f.type.startsWith("image/")) setPreview(URL.createObjectURL(f));
          }}
        />
      </div>
      <small>{err ? <span className="text-danger">{err}</span> : hint}</small>
    </div>
  );
}

/** Acción destructiva con confirmación en la página (sin diálogos del navegador). */
export function ConfirmAction({ label, confirmLabel, children, className = "btn btn-ghost btn-sm" }: { label: string; confirmLabel?: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <div className="card grid gap-3 p-3">
      {confirmLabel && <p className="text-sm font-semibold">{confirmLabel}</p>}
      {children}
      <button type="button" className="btn btn-ghost btn-sm justify-self-start" onClick={() => setOpen(false)}>
        Volver
      </button>
    </div>
  );
}
