import { RefreshCcw } from 'lucide-react';

export const GUEST_ORDER_STATUS_LABELS = {
  new: 'Новый',
  accepted: 'Принят',
  preparing: 'Готовится',
  ready: 'Готов',
  completed: 'Завершён',
  cancelled: 'Отменён'
};

export default function MyOrdersSection({
  activeOrders,
  completedOrders,
  formatDate,
  isLoading,
  onRefresh,
  onViewChange,
  view
}) {
  const orders = view === 'active' ? activeOrders : completedOrders;
  const hasAnyOrders = activeOrders.length + completedOrders.length > 0;

  return (
    <section className="my-orders-section" aria-label="Мои заказы">
      <div className="choice-heading">
        <div><span className="eyebrow">Статус</span><h3>Мои заказы</h3></div>
        <button className="ghost-button" disabled={isLoading} type="button" onClick={onRefresh}>
          <RefreshCcw size={17} />
          Обновить
        </button>
      </div>

      <div className="my-orders-tabs" role="tablist" aria-label="Тип заказов">
        <button
          className={view === 'active' ? 'is-active' : ''}
          role="tab"
          aria-selected={view === 'active'}
          type="button"
          onClick={() => onViewChange('active')}
        >
          Действующие <span>{activeOrders.length}</span>
        </button>
        <button
          className={view === 'completed' ? 'is-active' : ''}
          role="tab"
          aria-selected={view === 'completed'}
          type="button"
          onClick={() => onViewChange('completed')}
        >
          Завершённые <span>{completedOrders.length}</span>
        </button>
      </div>

      {isLoading ? (
        <div className="soft-hint">Загружаем ваши заказы…</div>
      ) : !hasAnyOrders ? (
        <div className="soft-hint">Вы ещё не отправляли заказов.</div>
      ) : orders.length === 0 ? (
        <div className="soft-hint">
          {view === 'active' ? 'Действующих заказов сейчас нет.' : 'Завершённых заказов пока нет.'}
        </div>
      ) : (
        <div className="my-orders-list">
          {orders.map((order) => (
            <article className={`my-order-card status-${order.status}`} key={order.id}>
              <div><span>Заказ №{order.order_number}</span><strong>{GUEST_ORDER_STATUS_LABELS[order.status] || order.status}</strong></div>
              <p>Стол №{order.table_number} · {order.variant_name}</p>
              {Array.isArray(order.items) && order.items.length > 0 ? (
                <div className="my-order-items">
                  {order.items.map((item, index) => (
                    <span key={`${order.id}-${item.id || index}`}>
                      {item.brand} {item.name} <strong>{item.percent}%</strong>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="soft-hint">Табаки не выбраны — подобрать с мастером</div>
              )}
              {order.comment && <p className="my-order-comment">{order.comment}</p>}
              <small>{formatDate(order.created_at)}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
