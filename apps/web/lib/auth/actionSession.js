// apps/web/lib/auth/actionSession.js
// The first line of every server action: who is calling?
//
// A server action is a public POST endpoint — anyone can invoke it with any
// arguments, signed in or not. getUser() validates the cookie's JWT against the
// auth server (never getSession(), which trusts the cookie as-is). RLS and the
// RPC role guards remain the real authorization; this makes "not signed in" a
// clean, early refusal instead of a database error.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import "server-only";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * @returns {Promise<{ supabase: import("@supabase/supabase-js").SupabaseClient, user: object } | null>}
 */
export async function signedInClient() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}
