import { createClient } from '@supabase/supabase-js';

const ALLOWED_ROLES = new Set(['guest', 'master', 'admin']);

let publicClient;
let adminClient;

function readLegacyJwtRole(key) {
  if (!String(key || '').startsWith('eyJ')) return '';

  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role || '';
  } catch {
    return '';
  }
}

function isSafeApiKeyValue(key) {
  return /^[\x21-\x7E]+$/.test(String(key || ''));
}

function isPublicSupabaseKey(key) {
  return isSafeApiKeyValue(key) && (
    String(key || '').startsWith('sb_publishable_') || readLegacyJwtRole(key) === 'anon'
  );
}

function isServiceSupabaseKey(key) {
  return isSafeApiKeyValue(key) && (
    String(key || '').startsWith('sb_secret_') || readLegacyJwtRole(key) === 'service_role'
  );
}

export function getSupabaseAuthConfigurationError(environment = process.env) {
  const url = String(environment.SUPABASE_URL || '').trim();
  const anonKey = String(environment.SUPABASE_ANON_KEY || '').trim();
  const serviceKey = String(environment.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !anonKey || !serviceKey) return 'Не заполнены серверные переменные Supabase.';
  if (!isPublicSupabaseKey(anonKey)) return 'SUPABASE_ANON_KEY должен содержать публичный ключ.';
  if (!isServiceSupabaseKey(serviceKey)) return 'SUPABASE_SERVICE_ROLE_KEY должен содержать секретный серверный ключ.';
  if (anonKey === serviceKey) return 'Публичный и серверный ключи Supabase не должны совпадать.';
  return '';
}

export function isSupabaseAuthConfigured(environment = process.env) {
  return !getSupabaseAuthConfigurationError(environment);
}

function assertSupabaseAuthConfigured() {
  const configurationError = getSupabaseAuthConfigurationError();
  if (configurationError) throw new Error(`Supabase Auth не настроен: ${configurationError}`);
}

function getPublicClient() {
  assertSupabaseAuthConfigured();

  if (!publicClient) {
    publicClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }

  return publicClient;
}

export function getSupabaseAdminClient() {
  assertSupabaseAuthConfigured();

  if (!adminClient) {
    adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }

  return adminClient;
}

export function getSupabaseUserClient(token) {
  assertSupabaseAuthConfigured();

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
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

export function validateAdminProfileChange(actorId, targetProfile, profiles, changes) {
  if (!targetProfile) return 'Пользователь не найден.';

  const removesAdminAccess = targetProfile.role === 'admin' && targetProfile.is_active && (
    (changes.role && changes.role !== 'admin') || changes.is_active === false
  );

  if (targetProfile.id === actorId && removesAdminAccess) {
    return 'Нельзя отключить или понизить собственный аккаунт администратора.';
  }

  const activeAdminCount = profiles.filter((profile) => (
    profile.role === 'admin' && profile.is_active
  )).length;
  if (removesAdminAccess && activeAdminCount <= 1) {
    return 'В системе должен остаться хотя бы один активный администратор.';
  }

  return '';
}

export function buildDefaultProfile(user) {
  return {
    id: user.id,
    email: String(user.email || '').trim().slice(0, 254),
    name: String(user.user_metadata?.name || '').trim().slice(0, 100),
    phone: String(user.user_metadata?.phone || '').trim().slice(0, 40),
    role: 'guest',
    is_active: true
  };
}

async function ensureUserProfile(user) {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from('profiles')
    .upsert(buildDefaultProfile(user), { onConflict: 'id', ignoreDuplicates: true })
    .select('id,email,name,phone,role,is_active,created_at,updated_at')
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: existing, error: loadError } = await client
    .from('profiles')
    .select('id,email,name,phone,role,is_active,created_at,updated_at')
    .eq('id', user.id)
    .single();

  if (loadError) throw loadError;
  return existing;
}

export async function requireAuth(request, response, next) {
  if (!isSupabaseAuthConfigured()) {
    response.status(503).json({ message: 'Авторизация Supabase пока не настроена.' });
    return;
  }

  const token = parseBearerToken(request.get('authorization'));
  if (!token) {
    response.status(401).json({ message: 'Войдите в аккаунт, чтобы продолжить.' });
    return;
  }

  try {
    const userClient = getSupabaseUserClient(token);
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) {
      response.status(401).json({ message: 'Сессия истекла. Войдите снова.' });
      return;
    }

    const { data: storedProfile, error: profileError } = await userClient
      .from('profiles')
      .select('id,email,name,phone,role,is_active,created_at,updated_at')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    const profile = storedProfile || await ensureUserProfile(userData.user);

    if (!profile.is_active) {
      response.status(403).json({ message: 'Этот аккаунт отключён администратором.' });
      return;
    }

    request.auth = { token, user: userData.user, profile };
    next();
  } catch (error) {
    console.error('[auth] Не удалось проверить аккаунт:', error.message);
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

export async function listProfiles(token = '') {
  const client = token ? getSupabaseUserClient(token) : getSupabaseAdminClient();
  const { data, error } = await client
    .from('profiles')
    .select('id,email,name,phone,role,is_active,created_at,updated_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function updateProfileAsAdmin(token, profileId, values) {
  const { data, error } = await getSupabaseUserClient(token).rpc('admin_update_profile', {
    target_profile_id: profileId,
    next_role: values.role ?? null,
    next_is_active: typeof values.is_active === 'boolean' ? values.is_active : null
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
