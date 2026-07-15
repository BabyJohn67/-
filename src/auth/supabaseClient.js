import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseAuthEnabled = String(import.meta.env.VITE_SUPABASE_AUTH_ENABLED || '').toLowerCase() === 'true';
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    })
  : null;

export async function getSupabaseAccessToken() {
  if (!isSupabaseAuthEnabled || !supabase) return '';
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}
