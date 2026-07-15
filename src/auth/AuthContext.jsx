import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseAuthEnabled, isSupabaseConfigured, supabase } from './supabaseClient.js';

const AuthContext = createContext(null);

function publicAppUrl() {
  return String(import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isSupabaseAuthEnabled && isSupabaseConfigured);
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  async function refreshProfile(user = session?.user) {
    if (!supabase || !user) {
      setProfile(null);
      return null;
    }

    setProfileLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,name,phone,role,is_active,created_at,updated_at')
      .eq('id', user.id)
      .maybeSingle();
    setProfileLoading(false);

    if (error) throw error;
    setProfile(data || null);
    return data || null;
  }

  useEffect(() => {
    if (!isSupabaseAuthEnabled || !supabase) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session || null);
      setLoading(false);
      if (data.session?.user) {
        refreshProfile(data.session.user).catch(() => setProfile(null));
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession || null);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      queueMicrotask(() => {
        if (!active) return;
        if (nextSession?.user) refreshProfile(nextSession.user).catch(() => setProfile(null));
        else setProfile(null);
      });
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn({ email, password }) {
    if (!supabase) throw new Error('Supabase ещё не настроен.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp({ name, phone, email, password }) {
    if (!supabase) throw new Error('Supabase ещё не настроен.');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone },
        emailRedirectTo: publicAppUrl()
      }
    });
    if (error) throw error;
    return data;
  }

  async function sendPasswordReset(email) {
    if (!supabase) throw new Error('Supabase ещё не настроен.');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${publicAppUrl()}/?auth=recovery`
    });
    if (error) throw error;
  }

  async function updatePassword(password) {
    if (!supabase) throw new Error('Supabase ещё не настроен.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setPasswordRecovery(false);
  }

  async function updateProfile({ name, phone }) {
    if (!supabase || !session?.user) throw new Error('Сначала войдите в аккаунт.');
    const { data, error } = await supabase
      .from('profiles')
      .update({ name, phone })
      .eq('id', session.user.id)
      .select('id,email,name,phone,role,is_active,created_at,updated_at')
      .single();
    if (error) throw error;
    setProfile(data);
    return data;
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setProfile(null);
  }

  const value = useMemo(() => ({
    enabled: isSupabaseAuthEnabled,
    configured: isSupabaseConfigured,
    loading: loading || profileLoading,
    profileLoading,
    session,
    user: session?.user || null,
    profile,
    role: profile?.role || 'guest',
    isActive: profile?.is_active !== false,
    isStaff: Boolean(profile?.is_active && ['master', 'admin'].includes(profile?.role)),
    isAdmin: Boolean(profile?.is_active && profile?.role === 'admin'),
    passwordRecovery,
    refreshProfile,
    sendPasswordReset,
    setPasswordRecovery,
    signIn,
    signOut,
    signUp,
    updatePassword,
    updateProfile
  }), [loading, passwordRecovery, profile, profileLoading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth должен использоваться внутри AuthProvider.');
  return context;
}
