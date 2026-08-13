"use client";

import { useActionState } from "react";

import { changePasswordAction, type ChangePasswordState } from "../actions";
import styles from "../login/login.module.css";

const initialState: ChangePasswordState = { error: null };

export function ChangePasswordForm({ returnPath }: { returnPath: string }) {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initialState,
  );
  return (
    <form action={formAction} className={styles.form}>
      <input name="next" type="hidden" value={returnPath} />
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
          minLength={14}
          required
        />
      </label>
      <label>
        确认新密码
        <input
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={14}
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
