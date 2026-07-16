import { useMemo, useState } from 'react';
import { RefreshCcw, Search, ShieldCheck, UserCog } from 'lucide-react';

const ROLE_LABELS = {
  guest: 'Гость',
  master: 'Мастер',
  admin: 'Администратор'
};

function formatCreatedAt(value) {
  if (!value) return 'Дата неизвестна';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(value));
}

export default function StaffPanel({
  currentUserId,
  error,
  isLoading,
  onRefresh,
  onUpdate,
  profiles,
  updatingIds
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const filteredProfiles = useMemo(() => profiles.filter((profile) => {
    if (!normalizedQuery) return true;
    return [profile.name, profile.email, profile.phone]
      .some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
  }), [normalizedQuery, profiles]);

  const stats = useMemo(() => ({
    total: profiles.length,
    masters: profiles.filter((profile) => profile.role === 'master' && profile.is_active).length,
    admins: profiles.filter((profile) => profile.role === 'admin' && profile.is_active).length,
    blocked: profiles.filter((profile) => !profile.is_active).length
  }), [profiles]);

  return (
    <section className="staff-panel" aria-label="Сотрудники">
      <div className="master-mix-heading">
        <div>
          <span className="eyebrow">Управление доступом</span>
          <h3>Сотрудники</h3>
          <p>Назначайте мастеров и отключайте доступ без изменения паролей.</p>
        </div>
        <button className="ghost-button" disabled={isLoading} type="button" onClick={onRefresh}>
          <RefreshCcw size={17} />
          {isLoading ? 'Обновляю' : 'Обновить'}
        </button>
      </div>

      <div className="staff-stat-grid" aria-label="Статистика аккаунтов">
        <div><span>Всего</span><strong>{stats.total}</strong></div>
        <div><span>Мастеров</span><strong>{stats.masters}</strong></div>
        <div><span>Администраторов</span><strong>{stats.admins}</strong></div>
        <div><span>Заблокировано</span><strong>{stats.blocked}</strong></div>
      </div>

      <label className="staff-search-box">
        <Search size={19} />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти по имени, телефону или email"
          type="search"
          value={query}
        />
      </label>

      {error && (
        <div className="error-banner" role="status">
          <div><strong>Не удалось загрузить сотрудников</strong><span>{error}</span></div>
          <button type="button" onClick={onRefresh}>Повторить</button>
        </div>
      )}

      {isLoading && profiles.length === 0 ? (
        <div className="active-hookah-empty">Загружаю аккаунты…</div>
      ) : filteredProfiles.length === 0 ? (
        <div className="active-hookah-empty">Подходящие аккаунты не найдены.</div>
      ) : (
        <div className="staff-list">
          {filteredProfiles.map((profile) => {
            const isSelf = profile.id === currentUserId;
            const isUpdating = updatingIds.includes(profile.id);
            return (
              <article className={`staff-card ${profile.is_active ? '' : 'is-blocked'}`} key={profile.id}>
                <div className="staff-card-main">
                  <div className="staff-avatar" aria-hidden="true">
                    {profile.role === 'admin' ? <ShieldCheck size={22} /> : <UserCog size={22} />}
                  </div>
                  <div>
                    <div className="staff-name-row">
                      <h4>{profile.name || 'Без имени'}</h4>
                      {isSelf && <span className="staff-self-badge">Это вы</span>}
                      {!profile.is_active && <span className="staff-blocked-badge">Доступ отключён</span>}
                    </div>
                    <a href={`mailto:${profile.email}`}>{profile.email}</a>
                    <p>{profile.phone || 'Телефон не указан'} · создан {formatCreatedAt(profile.created_at)}</p>
                  </div>
                </div>

                <div className="staff-controls">
                  <label>
                    Роль
                    <select
                      aria-label={`Роль: ${profile.name || profile.email}`}
                      disabled={isSelf || isUpdating}
                      onChange={(event) => onUpdate(profile, { role: event.target.value })}
                      value={profile.role}
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="staff-access-toggle">
                    <input
                      checked={profile.is_active}
                      disabled={isSelf || isUpdating}
                      onChange={(event) => onUpdate(profile, { is_active: event.target.checked })}
                      type="checkbox"
                    />
                    <span>{profile.is_active ? 'Доступ включён' : 'Доступ отключён'}</span>
                  </label>
                </div>

                {isUpdating && <span className="staff-saving">Сохраняю изменения…</span>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
