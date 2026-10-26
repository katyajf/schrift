"use client";

import { useActionState, useState } from "react";
import { sendLoginEmail, verifyLoginCode, type LoginState } from "./actions";

async function loginAction(state: LoginState, formData: FormData): Promise<LoginState> {
  if (formData.get("intent") === "restart") return { step: "email" };
  return state.step === "email" ? sendLoginEmail(state, formData) : verifyLoginCode(state, formData);
}

export function LoginForm({ linkError }: { linkError?: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, { step: "email" } as LoginState);
  const [email, setEmail] = useState("");
  const error = state.error ?? (linkError && state.step === "email" ? "That sign-in link has expired. Request a new one." : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.step === "email" ? (
        <>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
              placeholder="you@example.com"
            />
          </label>
          <button className="btn-primary" disabled={pending}>
            {pending ? "Sending…" : "Send sign-in email"}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Sent to <span className="text-ink">{state.email}</span>. Open the link, or enter the code from the email here.
          </p>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted">Code</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className="field text-center text-2xl tracking-[0.3em]"
              placeholder="123456"
            />
          </label>
          <button className="btn-primary" disabled={pending}>
            {pending ? "Checking…" : "Sign in"}
          </button>
          <button name="intent" value="restart" className="btn-ghost" formNoValidate>
            Use a different email
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
