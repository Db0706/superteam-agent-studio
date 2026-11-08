/** Public Supabase settings. Safe for the browser: the anon key only grants what RLS allows. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** False in builds without Supabase (e.g. preview deploys): platform features show setup notices instead of failing. */
export const isSupabaseConfigured = () => SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
