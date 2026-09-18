"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  name,
  value,
  disabled,
  label,
}: {
  children: ReactNode;
  name?: string;
  value?: string;
  disabled?: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-label={label}
    >
      {children}
    </button>
  );
}
