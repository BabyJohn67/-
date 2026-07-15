import { createClient } from '@supabase/supabase-js';

const ALLOWED_ROLES = new Set(['guest', 'master', 'admin']);

let publicClient;
let adminClient;

export function isSupabaseAuthEnabled() {
  return String(process.env.SUPABASE_AUTH_ENABLED || '').toLowerCase() === 'true';
}

export function isSupabaseAuthConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function getPublicClient() {
  if (!isSupabaseAuthConfigured()) {
    throw new Error('Supabase Auth не настроен на сервере.');
  }

  if (!publicClient) {
    publicClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }

  return publicClient;
}

export function getSupabaseAdminClient() {
  if (!isSupabaseAuthConfigured()) {
    throw new Error('Supabase Auth не настроен на сервере.');
  }

  if (!adminClient) {
    adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }

  return adminClient;
}

export function parseBearerToken(headerValue) {
  const match = String(headerValue || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export function hasRequiredRole(profile, allowedRoles) {
  return Boolean(
    profile?.is_active &&
    ALLOWED_ROLES.has(profile.role) &&
    allowedRoles.includes(profile.role)
  );
}

export async function requireAuth(request, response, next) {
  if (!isSupabaseAuthEnabled() || !isSupabaseAuthConfigured()) {
    response.status(503).json({ message: 'Авторизация Supabase пока не настроена.' });
    return;
  }

  const token = parseBearerToken(request.get('authorization'));
  if (!token) {
    response.status(401).json({ message: 'Войдите в аккаунт, чтобы продолжить.' });
    return;
  }

  try {
    const { data: userData, error: userError } = await getPublicClient().auth.getUser(token);
    if (userError || !userData.user) {
      response.status(401).json({ message: 'Сессия истекла. Войдите снова.' });
      return;
    }

    const { data: profile, error: profileError } = await getSupabaseAdminClient()
      .from('profiles')
      .select('id,email,name,phone,role,is_active,created_at,updated_at')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      response.status(403).json({ message: 'Профиль пользователя не найден.' });
      return;
    }

    if (!profile.is_active) {
      response.status(403).json({ message: 'Этот аккаунт отключён администратором.' });
      return;
    }

    request.auth = { token, user: userData.user, profile };
    next();
  } catch {
    response.status(503).json({ message: 'Не удалось проверить аккаунт. Повторите позже.' });
  }
}

export function requireRole(...allowedRoles) {
  return [
    requireAuth,
    (request, response, next) => {
      if (!hasRequiredRole(request.auth?.profile, allowedRoles)) {
        response.status(403).json({ message: 'Недостаточно прав для этого действия.' });
        return;
      }
      next();
    }
  ];
}

export const requireMaster = requireRole('master', 'admin');
export const requireAdmin = requireRole('admin');

export async function updateOwnProfile(userId, values) {
  const { data, error } = await getSupabaseAdminClient()
    .from('profiles')
    .update(values)
    .eq('id', userId)
    .select('id,email,name,phone,role,is_active,created_at,updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function listProfiles() {
  const { data, error } = await getSupabaseAdminClient()
    .from('profiles')
    .select('id,email,name,phone,role,is_active,created_at,updated_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function updateProfileAsAdmin(profileId, values) {
  const { data, error } = await getSupabaseAdminClient()
    .from('profiles')
    .update(values)
    .eq('id', profileId)
    .select('id,email,name,phone,role,is_active,created_at,updated_at')
    .single();

  if (error) throw error;
  return data;
}
