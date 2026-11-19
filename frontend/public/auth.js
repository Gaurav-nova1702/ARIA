// Shared Supabase setup used by every page.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

/* ============ CONFIG: paste from Supabase > Project Settings > API ============ */
export const SUPABASE_URL = "https://bunndpksxemtcbhfkzbv.supabase.co";          // e.g. https://abcdxyz.supabase.co
export const SUPABASE_ANON_KEY = "sb_publishable_MdY9HvRf9u5k-9JZ6gQooA_ZARyzu1A"; // the public "anon" key (safe in the browser)
/* ============================================================================== */

export const AFTER_LOGIN_URL = "/";
export const ENTRY_URL = "/login/";
// Optional: URL of your AI backend. POST {messages,tone,name} -> {reply}. Leave "" for the built-in demo replies.
export const ARIA_API_URL = "";

export const configured = !SUPABASE_URL.startsWith("YOUR_") && !SUPABASE_ANON_KEY.startsWith("YOUR_");
export const sb = createClient(
  configured ? SUPABASE_URL : "https://placeholder.supabase.co",
  configured ? SUPABASE_ANON_KEY : "placeholder",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

export const nameOf = (u) => (u && u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || "";
export async function sessionUser() { const { data } = await sb.auth.getSession(); return (data && data.session && data.session.user) || null; }
