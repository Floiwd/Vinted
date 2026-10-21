"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publicKey) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY (ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).");
  }

  browserClient ??= createClient(url, publicKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });

  return browserClient;
}