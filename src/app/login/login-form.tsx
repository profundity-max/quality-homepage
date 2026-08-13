"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "../actions";
import styles from "./login.module.css";

const initialState: LoginState = { error: null };

export function LoginForm({ returnPath }: { returnPath: string }) {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form action={formAction} className={styles.form}>
      <input name="next" type="hidden" value={returnPath} />
      <label>
        用户名
        <input name="username" autoComplete="username" required />
      </label>
      <label className={styles.checkboxLabel}>
        <input name="persistent" type="checkbox" />
        保持登录 7 天
      </label>
      <label>
        密码
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state.error ? <p role="alert">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "正在登录…" : "登录"}
      </button>
    </form>
  );
}
