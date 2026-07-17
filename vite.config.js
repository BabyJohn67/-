import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function readLegacyJwtRole(key) {
  if (!String(key || '').startsWith('eyJ')) return '';

  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role || '';
  } catch {
    return '';
  }
}

export function isSafeBrowserSupabaseKey(key) {
  return !key || key.startsWith('sb_publishable_') || readLegacyJwtRole(key) === 'anon';
}

export default defineConfig(({ mode }) => {
  const environment = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  if (!isSafeBrowserSupabaseKey(environment.VITE_SUPABASE_ANON_KEY)) {
    throw new Error('VITE_SUPABASE_ANON_KEY должен содержать только публичный ключ Supabase.');
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://127.0.0.1:4173'
      }
    }
  };
});
