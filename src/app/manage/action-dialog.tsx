"use client";

import { useId, useRef, type ReactNode } from "react";
import { X, EllipsisVertical } from "lucide-react";
import styles from "./manage.module.css";

/** Native modal supplies focus containment, Escape and focus restoration. */
export function ActionDialog({
  label,
  title,
  children,
  primary = false,
  compact = false,
}: {
  label: string;
  title: string;
  children: ReactNode;
  primary?: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button
        type="button"
        aria-label={label}
        className={primary ? styles.primary : styles.textButton}
        onClick={() => ref.current?.showModal()}
      >
        {compact ? <EllipsisVertical size={18} aria-hidden="true" /> : label}
      </button>
      <dialog
        ref={ref}
        className={styles.dialog}
        aria-labelledby={titleId}
        onSubmit={() => ref.current?.close()}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const rect = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < rect.left ||
              e.clientX > rect.right ||
              e.clientY < rect.top ||
              e.clientY > rect.bottom
            )
              ref.current?.close();
          }
        }}
      >
        <header className={styles.dialogHeader}>
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            aria-label="关闭对话框"
            onClick={() => ref.current?.close()}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {children}
      </dialog>
    </>
  );
}
