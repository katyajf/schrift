import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export function isAllowedEmail(email: string | undefined | null) {
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  // With no ALLOWED_EMAIL set, fall back to Supabase's own signup setting.
  if (!allowed) return true;
  return email?.trim().toLowerCase() === allowed;
}

// Verifies the session (getClaims checks the JWT signature) and returns a
// Supabase client for the user. Use in Server Components and Server Actions.
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims || !isAllowedEmail(claims.email as string | undefined)) {
    redirect("/login");
  }
  return { supabase, userId: claims.sub };
}

// Same check for Route Handlers, which should answer 401 rather than redirect.
export async function getUserOrNull() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims || !isAllowedEmail(claims.email as string | undefined)) return null;
  return { supabase, userId: claims.sub };
}
