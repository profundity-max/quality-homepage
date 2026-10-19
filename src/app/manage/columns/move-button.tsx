"use client";

import { useFormStatus } from "react-dom";
import styles from "../manage.module.css";

export function MoveButton({
  label,
  direction,
}: {
  label: string;
  direction: "up" | "down";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-label={label}
      aria-busy={pending}
      disabled={pending}
      className={styles.textButton}
      type="submit"
    >
      {pending ? "调整中…" : direction === "up" ? "↑" : "↓"}
    </button>
  );
}
