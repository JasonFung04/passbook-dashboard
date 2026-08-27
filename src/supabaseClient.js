import { createClient } from "@supabase/supabase-js";

// The Supabase publishable (anon) key is safe for browser use — access to
// user data is enforced by Postgres Row Level Security, not by keeping this
// key secret. An env var override lets a Vercel deployment point at a
// different project without a code change; the literal values are the
// project already in use so local dev and existing deployments keep working
// unconfigured.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://kojswhijtpirxaigcwuo.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_T3wnT2GdTs0_oxbxhKClmg_hJg3X6mn";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
