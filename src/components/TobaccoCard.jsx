import { Heart } from 'lucide-react';
import { getBrand, getGuestStockStatus, getTasteMatches } from '../utils/tobaccos.js';

export default function TobaccoCard({
  item,
  onToggleChoice,
  isChosen,
  selectedCategoryIds = []
}) {
  const stock = getGuestStockStatus(item);
  const matchedCategories = getTasteMatches(item).filter((category) =>
    selectedCategoryIds.includes(category.id)
  );

  return (
    <article className={`tobacco-card stock-${stock.type}`}>
      <div className="card-topline">
        <span className="stock-dot" aria-hidden="true" />
        <span>{stock.label}</span>
        <span className="brand-pill">{getBrand(item)}</span>
      </div>

      <h3>{item.name}</h3>
      <p>{item.taste}</p>

      {matchedCategories.length > 0 && (
        <div className="taste-match-list">
          {matchedCategories.map((category) => (
            <span key={category.id}>{category.label}</span>
          ))}
        </div>
      )}

      <button
        className={`want-button${isChosen ? ' is-chosen' : ''}`}
        aria-pressed={isChosen}
        aria-label={isChosen ? 'Удалить табак из выбора' : 'Добавить табак в выбор'}
        disabled={item.quantity <= 0}
        title={isChosen ? 'Удалить табак из выбора' : 'Добавить табак в выбор'}
        type="button"
        onClick={() => onToggleChoice(item)}
      >
        <Heart aria-hidden="true" fill={isChosen ? 'currentColor' : 'none'} size={18} />
        {isChosen ? 'В моем выборе' : 'Хочу это'}
      </button>
    </article>
  );
}
