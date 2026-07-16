import { Heart } from 'lucide-react';
import { getBrand, getGuestStockStatus, getTasteMatches } from '../utils/tobaccos.js';

export default function TobaccoCard({
  item,
  onAddChoice,
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
        className="want-button"
        disabled={item.quantity <= 0}
        type="button"
        onClick={() => onAddChoice(item)}
      >
        <Heart size={18} />
        {isChosen ? 'В моем выборе' : 'Хочу это'}
      </button>
    </article>
  );
}
