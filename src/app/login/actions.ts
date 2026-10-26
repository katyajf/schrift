"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/auth";

export type LoginState =
  | { step: "email"; error?: string }
  | { step: "code"; email: string; error?: string };

const emailSchema = z.email();
const codeSchema = z.string().regex(/^\d{6,10}$/);

export async function sendLoginEmail(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { step: "email", error: "Enter a valid email address." };
  const email = parsed.data;

  if (!isAllowedEmail(email)) {
    return { step: "email", error: "This email can't sign in to this app." };
  }

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) return { step: "email", error: error.message };

  return { step: "code", email };
}

// The 6-digit code from the same email. Needed when the app runs from the home
// screen on iOS: links in Mail open in Safari, which has a separate cookie jar.
export async function verifyLoginCode(state: LoginState, formData: FormData): Promise<LoginState> {
  if (state.step !== "code") return state;
  const parsed = codeSchema.safeParse(String(formData.get("code") ?? "").replace(/\s/g, ""));
  if (!parsed.success) return { ...state, error: "Enter the code from the email." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: state.email,
    token: parsed.data,
    type: "email",
  });
  if (error) return { ...state, error: "That code didn't work. Check it or request a new one." };

  redirect("/");
}
