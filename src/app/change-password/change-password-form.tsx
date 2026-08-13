"use client";

import { useActionState } from "react";

import { changePasswordAction, type ChangePasswordState } from "../actions";
import styles from "../login/login.module.css";

const initialState: ChangePasswordState = { error: null };

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initialState,
  );
  return (
    <form action={formAction} className={styles.form}>
      <label>
        当前密码
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        新密码
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </label>
      <label>
        确认新密码
        <input
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
        />
      </label>
      {state.error ? <p role="alert">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "正在更新…" : "更新密码"}
      </button>
    </form>
  );
}
