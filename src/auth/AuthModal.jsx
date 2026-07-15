import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function friendlyAuthError(error) {
  const message = String(error?.message || 'Не удалось выполнить действие.');
  if (/invalid login credentials/i.test(message)) return 'Неверный email или пароль.';
  if (/email not confirmed/i.test(message)) return 'Сначала подтвердите email по ссылке из письма.';
  if (/user already registered/i.test(message)) return 'Пользователь с таким email уже зарегистрирован.';
  return message;
}

export default function AuthModal({ isOpen, onClose }) {
  const auth = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (auth.passwordRecovery) setMode('reset');
  }, [auth.passwordRecovery]);

  if (!isOpen) return null;

  function changeMode(nextMode) {
    setMode(nextMode);
    setError('');
    setMessage('');
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function validate() {
    const email = form.email.trim().toLowerCase();
    if (mode !== 'reset' && !EMAIL_PATTERN.test(email)) return 'Введите корректный email.';
    if (mode === 'register' && (form.name.trim().length < 2 || form.name.trim().length > 100)) {
      return 'Имя должно содержать от 2 до 100 символов.';
    }
    if (mode === 'register' && form.phone.trim().length > 40) return 'Номер телефона слишком длинный.';
    if (['login', 'register', 'reset'].includes(mode) && form.password.length < 8) {
      return 'Пароль должен содержать минимум 8 символов.';
    }
    if (['register', 'reset'].includes(mode) && form.password !== form.confirmPassword) {
      return 'Пароли не совпадают.';
    }
    return '';
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!auth.configured) {
      setError('Supabase пока не подключён. Добавьте переменные окружения по инструкции AUTH_SETUP.md.');
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await auth.signIn({ email: form.email.trim().toLowerCase(), password: form.password });
        onClose();
      } else if (mode === 'register') {
        const data = await auth.signUp({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password
        });
        if (data.session) onClose();
        else setMessage('Регистрация завершена. Подтвердите email по ссылке из письма.');
      } else if (mode === 'recover') {
        await auth.sendPasswordReset(form.email.trim().toLowerCase());
        setMessage('Ссылка для восстановления отправлена на email.');
      } else {
        await auth.updatePassword(form.password);
        setMode('login');
        setError('');
        setMessage('Новый пароль сохранён. Теперь можно войти.');
      }
    } catch (submitError) {
      setError(friendlyAuthError(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  const headings = {
    login: ['Вход', 'Войти в аккаунт'],
    register: ['Регистрация', 'Создать аккаунт'],
    recover: ['Восстановление', 'Восстановить пароль'],
    reset: ['Новый пароль', 'Задать новый пароль']
  };

  return (
    <div className="auth-modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="supabase-auth-title">
        <div className="auth-modal-header">
          <div>
            <span className="eyebrow">{headings[mode][0]}</span>
            <h2 id="supabase-auth-title">{headings[mode][1]}</h2>
          </div>
          <button className="auth-close-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label>Имя<input autoComplete="name" maxLength={100} value={form.name} onChange={(event) => updateField('name', event.target.value)} /></label>
              <label>Телефон<input autoComplete="tel" maxLength={40} placeholder="+7 999 000-00-00" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} /></label>
            </>
          )}

          {mode !== 'reset' && (
            <label>Email<input autoComplete="email" inputMode="email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} /></label>
          )}

          {['login', 'register', 'reset'].includes(mode) && (
            <label>Пароль<input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} /></label>
          )}

          {['register', 'reset'].includes(mode) && (
            <label>Повторите пароль<input autoComplete="new-password" minLength={8} type="password" value={form.confirmPassword} onChange={(event) => updateField('confirmPassword', event.target.value)} /></label>
          )}

          {error && <span className="login-error" role="alert">{error}</span>}
          {message && <span className="auth-success" role="status">{message}</span>}

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? 'Подождите...' : mode === 'login' ? 'Войти' : mode === 'register' ? 'Зарегистрироваться' : mode === 'recover' ? 'Отправить ссылку' : 'Сохранить пароль'}
          </button>

          <div className="auth-mode-switches">
            {mode !== 'login' && <button type="button" onClick={() => changeMode('login')}>Уже есть аккаунт</button>}
            {mode === 'login' && <button type="button" onClick={() => changeMode('register')}>Создать аккаунт</button>}
            {mode === 'login' && <button type="button" onClick={() => changeMode('recover')}>Забыли пароль?</button>}
          </div>
        </form>
      </section>
    </div>
  );
}
