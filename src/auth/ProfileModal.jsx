import { useEffect, useState } from 'react';
import { LogOut, X } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';

const ROLE_LABELS = { guest: 'Гость', master: 'Мастер', admin: 'Администратор' };

export default function ProfileModal({ isOpen, onClose }) {
  const auth = useAuth();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({ name: auth.profile?.name || '', phone: auth.profile?.phone || '' });
  }, [auth.profile]);

  if (!isOpen || !auth.user) return null;

  async function save(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (form.name.trim().length < 2 || form.name.trim().length > 100) {
      setError('Имя должно содержать от 2 до 100 символов.');
      return;
    }

    setSaving(true);
    try {
      await auth.updateProfile({ name: form.name.trim(), phone: form.phone.trim() });
      setMessage('Профиль сохранён.');
    } catch {
      setError('Не удалось сохранить профиль.');
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    try {
      await auth.signOut();
      onClose();
    } catch {
      setError('Не удалось выйти. Повторите ещё раз.');
    }
  }

  return (
    <div className="auth-modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div className="auth-modal-header">
          <div><span className="eyebrow">Аккаунт</span><h2 id="profile-title">Мой профиль</h2></div>
          <button className="auth-close-button" type="button" aria-label="Закрыть" onClick={onClose}><X size={20} /></button>
        </div>

        <form className="auth-form" onSubmit={save}>
          <div className="profile-summary">
            <span>{auth.user.email}</span>
            <strong>{ROLE_LABELS[auth.role] || 'Пользователь'}</strong>
          </div>
          <label>Имя<input autoComplete="name" maxLength={100} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>Телефон<input autoComplete="tel" maxLength={40} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
          {error && <span className="login-error" role="alert">{error}</span>}
          {message && <span className="auth-success" role="status">{message}</span>}
          <div className="auth-actions">
            <button className="primary-button" disabled={saving} type="submit">{saving ? 'Сохраняю...' : 'Сохранить'}</button>
            <button className="ghost-button" type="button" onClick={logout}><LogOut size={17} />Выйти</button>
          </div>
        </form>
      </section>
    </div>
  );
}
