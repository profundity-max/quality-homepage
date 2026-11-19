"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";

import { loginAction, type LoginState } from "../actions";
import styles from "./login.module.css";

const initialState: LoginState = { error: null };

export function LoginForm({ returnPath }: { returnPath: string }) {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <form
      action={formAction}
      className={styles.form}
      aria-labelledby="login-form-heading"
      aria-busy={pending}
      data-statistics-quiet
    >
      <input name="next" type="hidden" value={returnPath} />
      <h2 id="login-form-heading" className={styles.formHeading}>
        登录品集
      </h2>
      <div className={styles.field}>
        <label htmlFor="login-username">用户名</label>
        <input
          id="login-username"
          name="username"
          autoComplete="username"
          aria-describedby={state.error ? "login-error" : undefined}
          aria-invalid={state.error ? true : undefined}
          required
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="login-password">密码</label>
        <div className={styles.passwordField}>
          <input
            id="login-password"
            name="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            aria-describedby={state.error ? "login-error" : undefined}
            aria-invalid={state.error ? true : undefined}
            required
          />
          <button
            className={styles.passwordToggle}
            type="button"
            aria-label={passwordVisible ? "隐藏输入内容" : "显示输入内容"}
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            {passwordVisible ? (
              <EyeOff aria-hidden="true" size={18} />
            ) : (
              <Eye aria-hidden="true" size={18} />
            )}
          </button>
        </div>
      </div>
      <label className={styles.checkboxLabel}>
        <input name="persistent" type="checkbox" />
        保持登录 7 天
      </label>
      <div className={styles.feedback}>
        {state.error ? (
          <p id="login-error" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
      <button
        className={styles.submitButton}
        type="submit"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "正在登录…" : "登录"}
      </button>
    </form>
  );
}
