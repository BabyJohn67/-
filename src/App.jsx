import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  BellRing,
  CalendarClock,
  Copy,
  ExternalLink,
  Heart,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Trash2,
  X
} from 'lucide-react';
import { GRAMS_PER_UNIT } from './config.js';
import { fallbackTobaccos } from './data/fallbackTobaccos.js';
import { hookahFormats } from './data/hookahFormats.js';
import { hookahUnits } from './data/hookahUnits.js';
import {
  addTobacco,
  clearActiveMix,
  loadActiveMixes,
  loadActiveMix,
  loadConfig,
  loadMixHistory,
  loadTobaccos,
  saveActiveMix,
  saveTobaccoQuantity
} from './services/api.js';

const CHOICE_STORAGE_KEY = 'hookah-menu-choice-v1';
const FORMAT_STORAGE_KEY = 'hookahSelectedFormat';
const CONTACT_STORAGE_KEY = 'hookah-menu-contact-data-v1';
const MASTER_SESSION_KEY = 'hookah-menu-master-enabled-v1';
const TABLE_STORAGE_KEY = 'hookah-menu-table-number-v1';
const GUEST_ID_STORAGE_KEY = 'hookah-menu-guest-id-v1';
const LAST_CALL_STORAGE_KEY = 'hookah-menu-last-call-master-v1';
const MASTER_LOGIN = 'master';
const STANDARD_MIX_GRAMS = 17;
const HISTORY_PERIODS = [
  { id: '24h', label: '24 часа' },
  { id: '3d', label: '3 дня' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'all', label: 'Все время' }
];
const LEGACY_FORMAT_VARIANT_IDS = {
  'fruit-citrus': 'citrus-fruit',
  'fruit-premium': 'premium-fruit'
};

const TASTE_CATEGORIES = [
  {
    id: 'berry',
    label: 'Ягодный',
    hint: 'клубника, малина, смородина',
    keywords: ['ягод', 'berry', 'strawberry', 'raspberry', 'blueberry', 'blackberry', 'currant', 'elderberry', 'gooseberry', 'клубник', 'малин', 'смород', 'черник', 'голубик', 'ежевик', 'бузин', 'крыжов', 'сорбет']
  },
  {
    id: 'fruit',
    label: 'Фруктовый',
    hint: 'арбуз, манго, персик, дыня',
    keywords: ['fruit', 'fruittella', 'арбуз', 'дын', 'манго', 'mango', 'peach', 'персик', 'banana', 'банан', 'apple', 'яблок', 'pear', 'груш', 'pineapple', 'ананас', 'melon', 'watermelon', 'papaya', 'папай', 'guava', 'гуава', 'feijoa', 'фейхоа', 'lychee', 'личи', 'apricot', 'абрикос', 'grape', 'виноград']
  },
  {
    id: 'fresh',
    label: 'Свежий',
    hint: 'холодок, мята, огурец',
    keywords: ['ice', 'arctic', 'fresh', 'mint', 'холод', 'мят', 'cucumber', 'огур', 'fizz', 'energy', 'энерг', 'supernova']
  },
  {
    id: 'sweet',
    label: 'Сладкий',
    hint: 'конфеты, мармелад, мед',
    keywords: ['sweet', 'candy', 'конфет', 'мармелад', 'skittles', 'chupa', 'honey', 'мед', 'barberry', 'барбарис', 'jelly', 'жвач', 'drops', 'сгущ', 'слад']
  },
  {
    id: 'sour',
    label: 'Кислый',
    hint: 'цитрус, грейпфрут, кислые мармеладки',
    keywords: ['sour', 'кисл', 'citrus', 'цитрус', 'lemon', 'лимон', 'lime', 'лайм', 'grapefruit', 'грейпфрут', 'orange', 'апельсин', 'mandarin', 'мандарин', 'cranberry', 'клюкв']
  },
  {
    id: 'dessert',
    label: 'Десертный',
    hint: 'вафли, крем, печенье',
    keywords: ['dessert', 'cream', 'крем', 'ice cream', 'морож', 'waffle', 'вафл', 'cookie', 'печен', 'cheesecake', 'чизкейк', 'choco', 'шоколад', 'cacao', 'какао', 'latte', 'pudding', 'пудинг', 'yogurt', 'йогурт', 'jam', 'джем', 'caramel', 'карамел', 'rafaello', 'рафаэл', 'muesli', 'мюсли', 'brownie', 'брауни']
  },
  {
    id: 'tea',
    label: 'Чайный',
    hint: 'чай, бергамот, матча',
    keywords: ['tea', 'чай', 'earl grey', 'бергамот', 'matcha', 'матча']
  },
  {
    id: 'spicy',
    label: 'Пряный',
    hint: 'корица, специи, травы',
    keywords: ['spice', 'спец', 'cinnamon', 'корица', 'adjika', 'аджик', 'ginger', 'имбир', 'трав', 'basil', 'базилик', 'sage', 'шалф', 'salvei', 'estragon', 'эстрагон']
  },
  {
    id: 'nutty',
    label: 'Ореховый',
    hint: 'арахис, фисташка, орех',
    keywords: ['nut', 'орех', 'peanut', 'арахис', 'pistachio', 'фисташ']
  },
  {
    id: 'cocktail',
    label: 'Коктейльный',
    hint: 'мохито, кола, пина колада',
    keywords: ['cocktail', 'коктейл', 'mojito', 'мохито', 'cola', 'кола', 'pina colada', 'пина колада', 'lemonade', 'melonade', 'prosecco', 'spritz', 'smoothie', 'смузи', 'juice', 'сок', 'напиток']
  },
  {
    id: 'alcohol',
    label: 'Алкогольный',
    hint: 'ром, вино, виски',
    keywords: ['rum', 'ром', 'wine', 'вино', 'mulled', 'глинтвейн', 'prosecco', 'whisky', 'виски', 'gin', 'джин', 'malibu', 'малибу', 'spritz', 'mead']
  },
  {
    id: 'unusual',
    label: 'Необычный',
    hint: 'сыр, бекон, аджика, овощи',
    keywords: ['bacon', 'бекон', 'cheese', 'сыр', 'cheddar', 'помидор', 'tomato', 'pomodoro', 'olive', 'олив', 'salami', 'салями', 'adjika', 'аджик', 'огур', 'cucumber', 'спец', 'torf', 'торф']
  }
];

const STRENGTH_OPTIONS = [
  { id: 'any', label: 'Не важно' },
  { id: 'light', label: 'Легкий' },
  { id: 'medium', label: 'Средний' },
  { id: 'strong', label: 'Крепкий' }
];

function formatGrams(quantity) {
  return Math.round(quantity * GRAMS_PER_UNIT * 10) / 10;
}

function getInventoryGrams(item) {
  const grams = Number(item?.grams);
  return Number.isFinite(grams) ? Math.round(grams * 100) / 100 : formatGrams(Number(item?.quantity || 0));
}

function formatInventoryValue(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits }).format(Number(value || 0));
}

function calculateMixGrams(percent) {
  return Math.round((Number(percent || 0) / 100) * STANDARD_MIX_GRAMS * 100) / 100;
}

function createInventoryRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `order-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getBrand(item) {
  return item.brand || item.name.trim().split(/\s+/)[0] || 'Другое';
}

function getStockStatus(item) {
  if (item.quantity <= 0) return { label: 'Скоро появится', type: 'empty' };
  return { label: 'В наличии', type: 'available' };
}

function getMasterStockStatus(item) {
  if (item.quantity <= 0) return { label: 'Нет в наличии', type: 'empty' };
  if (item.quantity <= 1) return { label: 'Заканчивается', type: 'low' };
  return { label: 'В наличии', type: 'available' };
}

function getTasteMatches(item) {
  const text = `${item.name} ${item.taste}`.toLowerCase();
  return TASTE_CATEGORIES.filter((category) =>
    category.keywords.some((keyword) => text.includes(keyword))
  );
}

function estimateStrength(item) {
  const text = `${item.name} ${item.taste}`.toLowerCase();

  // Позже сюда лучше подключить настоящую крепость из Google Таблицы,
  // если появится отдельная колонка "Крепость". Сейчас это мягкая подсказка,
  // а не точное обещание гостю.
  if (['deus', 'bonche', 'satyr', 'tr125', 'terror', 'kraken', 'black afgano'].some((word) => text.includes(word))) {
    return 'strong';
  }

  if (['darkside', 'ds ', 'musthave', 'mh ', 'blackburn', 'bb ', 'overdose', 'od '].some((word) => text.includes(word))) {
    return 'medium';
  }

  if (['fresh', 'ice', 'холод', 'ягод', 'клубник', 'малин', 'арбуз', 'дын', 'чай', 'tea', 'sebero', 'sl ', 'adalya'].some((word) => text.includes(word))) {
    return 'light';
  }

  return 'medium';
}

function scoreTobacco(item, selectedCategoryIds, selectedStrength) {
  const categoryIds = getTasteMatches(item).map((category) => category.id);
  let score = item.inStock ? 40 : 0;
  const categoryMatches = selectedCategoryIds.filter((id) => categoryIds.includes(id)).length;
  score += categoryMatches * 22;
  if (selectedCategoryIds.length > 0 && categoryMatches === 0) score -= 15;
  if (selectedStrength !== 'any' && estimateStrength(item) === selectedStrength) score += 12;
  if (item.quantity > 1) score += Math.min(item.quantity, 6);
  return score;
}

function loadStoredChoice() {
  try {
    const raw = localStorage.getItem(CHOICE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function findFormatSelection(selectionId) {
  const normalizedSelectionId = LEGACY_FORMAT_VARIANT_IDS[selectionId] || selectionId;

  for (const format of hookahFormats) {
    const variant = format.variants.find((item) => item.id === normalizedSelectionId);
    if (variant) return { format, variant };

    if (format.id === normalizedSelectionId && format.variants[0]) {
      return { format, variant: format.variants[0] };
    }
  }

  return null;
}

function getHookahUnit(hookahId) {
  return hookahUnits.find((unit) => unit.id === String(hookahId)) || null;
}

function isFormatAllowedForHookah(formatId, hookahId) {
  const unit = getHookahUnit(hookahId);
  if (!unit || !formatId) return false;
  return unit.allowedFormatIds.includes(formatId);
}

function loadStoredFormat() {
  try {
    const storedFormat = localStorage.getItem(FORMAT_STORAGE_KEY);
    return findFormatSelection(storedFormat)?.variant.id || '';
  } catch {
    return '';
  }
}

function loadStoredMasterSession() {
  try {
    return sessionStorage.getItem(MASTER_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadStoredTableNumber() {
  try {
    const tableFromUrl = new URLSearchParams(window.location.search).get('table');
    if (tableFromUrl) return tableFromUrl.trim();
    return localStorage.getItem(TABLE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function loadStoredContactData() {
  try {
    const raw = localStorage.getItem(CONTACT_STORAGE_KEY);
    if (!raw) return { name: '', phone: '', social: '' };

    const parsed = JSON.parse(raw);
    return {
      name: parsed.name || '',
      phone: parsed.phone || '',
      social: parsed.social || ''
    };
  } catch {
    return { name: '', phone: '', social: '' };
  }
}

function loadOrCreateGuestId() {
  try {
    const storedGuestId = localStorage.getItem(GUEST_ID_STORAGE_KEY);
    if (storedGuestId) return storedGuestId;

    const guestId = `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(GUEST_ID_STORAGE_KEY, guestId);
    return guestId;
  } catch {
    return `guest-${Date.now()}`;
  }
}

function getHookahIdFromPath() {
  const match = window.location.pathname.match(/^\/hookah\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function formatMixDate(value) {
  if (!value) return 'Дата не указана';

  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function TobaccoCard({
  item,
  isMaster,
  onChange,
  onSave,
  onAddChoice,
  isChosen,
  isSaving,
  selectedCategoryIds = []
}) {
  const stock = isMaster ? getMasterStockStatus(item) : getStockStatus(item);
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

      {isMaster && (
        <div className="quantity-row">
          <strong>{item.quantity} шт</strong>
          <span>примерно {formatGrams(item.quantity)} г</span>
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

      {isMaster && (
        <div className="master-controls">
          <label>
            Количество
            <input
              type="number"
              min="0"
              step="1"
              value={item.quantity}
              onChange={(event) => onChange(item.id, Number(event.target.value || 0))}
            />
          </label>
          <label className="switch-line">
            <input
              type="checkbox"
              checked={item.inStock}
              onChange={(event) => onChange(item.id, event.target.checked ? Math.max(1, item.quantity) : 0)}
            />
            Есть в наличии
          </label>
          <button
            className="ghost-button"
            disabled={isSaving}
            type="button"
            onClick={() => onSave(item)}
          >
            {isSaving ? 'Сохраняю' : 'Сохранить в таблицу'}
          </button>
        </div>
      )}
    </article>
  );
}

export default function App() {
  const [tobaccos, setTobaccos] = useState(fallbackTobaccos);
  const [query, setQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const [selectedStrength, setSelectedStrength] = useState('any');
  const [selectedFormatId, setSelectedFormatId] = useState(() => loadStoredFormat());
  const [expandedFormatId, setExpandedFormatId] = useState('');
  const [failedFormatImages, setFailedFormatImages] = useState({});
  const [choiceItems, setChoiceItems] = useState(() => loadStoredChoice());
  const [guestComment, setGuestComment] = useState('');
  const [contactData, setContactData] = useState(() => loadStoredContactData());
  const [preparedRequest, setPreparedRequest] = useState(null);
  const [tableNumber, setTableNumber] = useState(() => loadStoredTableNumber());
  const [guestId] = useState(() => loadOrCreateGuestId());
  const [callMasterNotice, setCallMasterNotice] = useState('');
  const [lastCallMasterEvent, setLastCallMasterEvent] = useState(null);
  const [hookahPageId] = useState(() => getHookahIdFromPath());
  const [activeMix, setActiveMix] = useState(null);
  const [activeMixError, setActiveMixError] = useState('');
  const [isMixLoading, setIsMixLoading] = useState(false);
  const [mixSaveMessage, setMixSaveMessage] = useState('');
  const [mixDraft, setMixDraft] = useState({
    hookahId: '',
    formatId: '',
    comment: '',
    tobaccos: [],
    replacingMixId: ''
  });
  const [isMixSaving, setIsMixSaving] = useState(false);
  const [pendingMixRequest, setPendingMixRequest] = useState(null);
  const mixSaveLockRef = useRef(false);
  const [mixSearch, setMixSearch] = useState('');
  const [lastSavedMix, setLastSavedMix] = useState(null);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('fallback');
  const [isMaster, setIsMaster] = useState(() => loadStoredMasterSession());
  const [masterStatusFilter, setMasterStatusFilter] = useState('all');
  const [masterOnlyProblems, setMasterOnlyProblems] = useState(false);
  const [masterSearch, setMasterSearch] = useState('');
  const [masterBrandSearches, setMasterBrandSearches] = useState({});
  const [savingIds, setSavingIds] = useState([]);
  const [masterSaveMessage, setMasterSaveMessage] = useState('');
  const [newTobacco, setNewTobacco] = useState({
    name: '',
    grams: GRAMS_PER_UNIT,
    taste: ''
  });
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [masterCredentials, setMasterCredentials] = useState({
    login: '',
    password: ''
  });
  const [loginError, setLoginError] = useState('');
  const [masterPin, setMasterPin] = useState('2580');
  const [masterTab, setMasterTab] = useState('order');
  const [publicSiteUrl, setPublicSiteUrl] = useState('');
  const [copiedLinkMessage, setCopiedLinkMessage] = useState('');
  const [activeHookahMixes, setActiveHookahMixes] = useState({});
  const [isActiveHookahsLoading, setIsActiveHookahsLoading] = useState(false);
  const [activeHookahsError, setActiveHookahsError] = useState('');
  const [clearingHookahIds, setClearingHookahIds] = useState([]);
  const [pendingClearHookahId, setPendingClearHookahId] = useState('');
  const [activeMixStorage, setActiveMixStorage] = useState(null);
  const [mixHistory, setMixHistory] = useState([]);
  const [historyPeriod, setHistoryPeriod] = useState('24h');
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  async function refreshTobaccos() {
    setIsLoading(true);
    setError('');

    try {
      const data = await loadTobaccos();
      setTobaccos(data.tobaccos);
      setSource(data.source);
    } catch (loadError) {
      setTobaccos(fallbackTobaccos);
      setSource('fallback');
      setError(loadError.message || 'Не удалось загрузить список табаков');
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshActiveHookahs() {
    setIsActiveHookahsLoading(true);
    setActiveHookahsError('');

    try {
      const data = await loadActiveMixes();
      const mixes = data.mixes || {};

      setActiveHookahMixes(
        Object.fromEntries(
          hookahUnits.map((unit) => [unit.id, mixes[unit.id] || null])
        )
      );
      if (data.storage) {
        setActiveMixStorage(data.storage);
      }
    } catch (loadError) {
      setActiveHookahsError(loadError.message || 'Не удалось загрузить активные кальяны');
    } finally {
      setIsActiveHookahsLoading(false);
    }
  }

  async function refreshMixHistory(period = historyPeriod) {
    setIsHistoryLoading(true);
    setHistoryError('');

    try {
      const data = await loadMixHistory(period);
      setMixHistory(data.history || []);
      if (data.storage) {
        setActiveMixStorage(data.storage);
      }
    } catch (loadError) {
      setHistoryError(loadError.message || 'Не удалось загрузить историю кальянов');
    } finally {
      setIsHistoryLoading(false);
    }
  }

  useEffect(() => {
    refreshTobaccos();
    loadConfig().then((config) => {
      setMasterPin(config.masterPin);
      setPublicSiteUrl(config.publicSiteUrl);
      setActiveMixStorage(config.activeMixStorage);
    });
  }, []);

  useEffect(() => {
    if (!hookahPageId) return;

    async function refreshActiveMix() {
      setIsMixLoading(true);
      setActiveMixError('');

      try {
        const data = await loadActiveMix(hookahPageId);
        setActiveMix(data.mix);
      } catch (mixError) {
        setActiveMix(null);
        setActiveMixError(mixError.message || 'Не удалось загрузить микс');
      } finally {
        setIsMixLoading(false);
      }
    }

    refreshActiveMix();
  }, [hookahPageId]);

  useEffect(() => {
    localStorage.setItem(CHOICE_STORAGE_KEY, JSON.stringify(choiceItems));
  }, [choiceItems]);

  useEffect(() => {
    if (selectedFormatId) {
      localStorage.setItem(FORMAT_STORAGE_KEY, selectedFormatId);
      return;
    }

    localStorage.removeItem(FORMAT_STORAGE_KEY);
  }, [selectedFormatId]);

  useEffect(() => {
    localStorage.setItem(TABLE_STORAGE_KEY, tableNumber);
  }, [tableNumber]);

  useEffect(() => {
    // Пока контактные данные сохраняются только локально.
    // Позже здесь можно подключить отправку в Telegram, Google Sheets или заказ.
    localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(contactData));
  }, [contactData]);

  useEffect(() => {
    sessionStorage.setItem(MASTER_SESSION_KEY, String(isMaster));
  }, [isMaster]);

  useEffect(() => {
    if (!isMaster) return;
    refreshActiveHookahs();
  }, [isMaster]);

  useEffect(() => {
    if (!isMaster || masterTab !== 'history') return;
    refreshMixHistory(historyPeriod);
  }, [historyPeriod, isMaster, masterTab]);

  function updateContactData(field, value) {
    setContactData((current) => ({
      ...current,
      [field]: value
    }));
  }

  const choiceIds = useMemo(() => new Set(choiceItems.map((item) => item.id)), [choiceItems]);
  const selectedFormat = findFormatSelection(selectedFormatId);

  const selectedCategories = TASTE_CATEGORIES.filter((category) =>
    selectedCategoryIds.includes(category.id)
  );

  const recommendedTobaccos = useMemo(() => {
    if (selectedCategoryIds.length === 0 && selectedStrength === 'any') return [];

    return [...tobaccos]
      .filter((item) => item.quantity > 0)
      .map((item) => ({
        item,
        score: scoreTobacco(item, selectedCategoryIds, selectedStrength)
      }))
      .sort((a, b) => b.score - a.score || b.item.quantity - a.item.quantity)
      .slice(0, 6)
      .map(({ item }) => item);
  }, [selectedCategoryIds, selectedStrength, tobaccos]);

  const exactRecommendationCount = useMemo(() => {
    if (selectedCategoryIds.length === 0) return recommendedTobaccos.length;
    return tobaccos.filter((item) => {
      const ids = getTasteMatches(item).map((category) => category.id);
      return item.quantity > 0 && selectedCategoryIds.some((id) => ids.includes(id));
    }).length;
  }, [recommendedTobaccos.length, selectedCategoryIds, tobaccos]);

  const listedTobaccos = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();

    return tobaccos.filter((item) => {
      const brand = getBrand(item);
      const matchesQuery =
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.taste.toLowerCase().includes(normalizedQuery) ||
        brand.toLowerCase().includes(normalizedQuery);
      const matchesBrand = selectedBrand === 'all' ? true : brand === selectedBrand;
      const matchesAvailability = onlyAvailable ? item.quantity > 0 : true;
      return matchesQuery && matchesBrand && matchesAvailability;
    });
  }, [onlyAvailable, query, selectedBrand, tobaccos]);

  const brandOptions = useMemo(() => {
    const brands = Array.from(new Set(tobaccos.map(getBrand))).sort((a, b) =>
      a.localeCompare(b, 'ru')
    );

    return brands.map((brand) => ({
      name: brand,
      count: tobaccos.filter((item) => getBrand(item) === brand).length
    }));
  }, [tobaccos]);

  const groupedTobaccos = useMemo(() => {
    const groups = new Map();

    for (const item of listedTobaccos) {
      const brand = getBrand(item);
      if (!groups.has(brand)) groups.set(brand, []);
      groups.get(brand).push(item);
    }

    return Array.from(groups, ([brand, items]) => ({ brand, items })).sort((a, b) =>
      a.brand.localeCompare(b.brand, 'ru')
    );
  }, [listedTobaccos]);

  const availableCount = tobaccos.filter((item) => item.quantity > 0).length;
  const selectedStrengthLabel = STRENGTH_OPTIONS.find((option) => option.id === selectedStrength)?.label || 'Не важно';
  const masterStats = useMemo(() => {
    const totalGrams = tobaccos.reduce((sum, item) => sum + getInventoryGrams(item), 0);

    return {
      total: tobaccos.length,
      available: tobaccos.filter((item) => item.quantity > 1).length,
      low: tobaccos.filter((item) => item.quantity > 0 && item.quantity <= 1).length,
      empty: tobaccos.filter((item) => item.quantity <= 0).length,
      grams: Math.round(totalGrams * 100) / 100
    };
  }, [tobaccos]);

  const masterFilteredTobaccos = useMemo(() => {
    const normalizedSearch = masterSearch.toLowerCase().trim();

    return tobaccos.filter((item) => {
      const status = getMasterStockStatus(item).type;
      const brand = getBrand(item);
      const matchesStatus = masterStatusFilter === 'all' ? true : status === masterStatusFilter;
      const matchesProblems = masterOnlyProblems ? status === 'low' || status === 'empty' : true;
      const matchesSearch =
        item.name.toLowerCase().includes(normalizedSearch) ||
        item.taste.toLowerCase().includes(normalizedSearch) ||
        brand.toLowerCase().includes(normalizedSearch);

      return matchesStatus && matchesProblems && matchesSearch;
    });
  }, [masterOnlyProblems, masterSearch, masterStatusFilter, tobaccos]);

  const masterGroupedTobaccos = useMemo(() => {
    const groups = new Map();

    for (const item of masterFilteredTobaccos) {
      const brand = getBrand(item);
      if (!groups.has(brand)) groups.set(brand, []);
      groups.get(brand).push(item);
    }

    return Array.from(groups, ([brand, items]) => ({ brand, items })).sort((a, b) =>
      a.brand.localeCompare(b.brand, 'ru')
    );
  }, [masterFilteredTobaccos]);

  const hookahNumbers = useMemo(() => hookahUnits.map((unit) => unit.id), []);

  const mixPercentTotal = useMemo(
    () => mixDraft.tobaccos.reduce((sum, item) => sum + Number(item.percent || 0), 0),
    [mixDraft.tobaccos]
  );
  const isMixPercentComplete = Math.abs(mixPercentTotal - 100) <= 0.01;
  const mixComponentGrams = useMemo(() => {
    const values = mixDraft.tobaccos.map((item) => calculateMixGrams(item.percent));
    if (isMixPercentComplete && values.length > 0) {
      const roundedTotal = Math.round(values.reduce((sum, grams) => sum + grams, 0) * 100) / 100;
      values[values.length - 1] = Math.round(
        (values[values.length - 1] + STANDARD_MIX_GRAMS - roundedTotal) * 100
      ) / 100;
    }
    return values;
  }, [isMixPercentComplete, mixDraft.tobaccos]);
  const mixCalculatedTotalGrams = Math.round(
    mixComponentGrams.reduce((sum, grams) => sum + grams, 0) * 100
  ) / 100;

  const selectedMixIds = useMemo(
    () => new Set(mixDraft.tobaccos.map((item) => item.tobaccoId)),
    [mixDraft.tobaccos]
  );

  const mixSearchResults = useMemo(() => {
    const normalizedSearch = mixSearch.toLowerCase().trim();

    return tobaccos
      .filter((item) => {
        if (selectedMixIds.has(item.id)) return false;
        const brand = getBrand(item);
        const matchesSearch =
          !normalizedSearch ||
          item.name.toLowerCase().includes(normalizedSearch) ||
          item.taste.toLowerCase().includes(normalizedSearch) ||
          brand.toLowerCase().includes(normalizedSearch);

        return matchesSearch;
      })
      .slice(0, 8);
  }, [mixSearch, selectedMixIds, tobaccos]);

  const mixPercentState = useMemo(() => {
    if (mixDraft.tobaccos.length === 0) {
      return {
        type: 'warning',
        label: 'Добавьте табаки в микс'
      };
    }

    if (isMixPercentComplete) {
      return {
        type: 'valid',
        label: 'Пропорции заполнены корректно'
      };
    }

    return {
      type: 'warning',
      label: mixPercentTotal < 100 ? 'Сумма меньше 100%' : 'Сумма больше 100%'
    };
  }, [isMixPercentComplete, mixDraft.tobaccos.length, mixPercentTotal]);

  const isHookahSelected = hookahNumbers.includes(mixDraft.hookahId);
  const selectedMixFormat = findFormatSelection(mixDraft.formatId);
  const selectedHookahUnit = getHookahUnit(mixDraft.hookahId);
  const availableMixFormats = selectedHookahUnit
    ? hookahFormats.filter((format) => selectedHookahUnit.allowedFormatIds.includes(format.id))
    : [];
  const isMixFormatAllowed = Boolean(
    selectedMixFormat &&
    isFormatAllowedForHookah(selectedMixFormat.format.id, mixDraft.hookahId)
  );
  const canSaveMix = isHookahSelected && isMixFormatAllowed && mixDraft.tobaccos.length > 0 && isMixPercentComplete;

  function toggleTasteCategory(categoryId) {
    setSelectedCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    );
  }

  function addChoice(item) {
    if (item.quantity <= 0) return;
    setChoiceItems((current) => {
      if (current.some((choice) => choice.id === item.id)) return current;
      return [
        ...current,
        {
          id: item.id,
          name: item.name,
          brand: getBrand(item),
          taste: item.taste,
          quantity: item.quantity
        }
      ];
    });
  }

  function removeChoice(id) {
    setChoiceItems((current) => current.filter((item) => item.id !== id));
  }

  function prepareChoiceRequest() {
    const formatText = selectedFormat
      ? `${selectedFormat.format.title} — ${selectedFormat.variant.title} (${selectedFormat.variant.priceLabel})`
      : 'формат не выбран';
    const choiceText = choiceItems.length > 0
      ? choiceItems.map((item, index) => `${index + 1}. ${item.brand} ${item.name} - ${item.taste}`).join('\n')
      : 'гость пока не выбрал конкретные табаки';

    setPreparedRequest({
      type: 'choice',
      title: 'Запрос по выбранным табакам',
      text: [
        `Формат кальяна: ${formatText}`,
        'Гость выбрал конкретные табаки:',
        choiceText,
        guestComment.trim() ? `Комментарий гостя: ${guestComment.trim()}` : 'Комментарий гостя: не указан'
      ].join('\n')
    });
  }

  function getPublicOrigin() {
    if (publicSiteUrl.trim()) return publicSiteUrl.trim().replace(/\/$/, '');
    return window.location.origin.replace(/\/$/, '');
  }

  function getHookahUrl(hookahId) {
    return `${getPublicOrigin()}/hookah/${hookahId}`;
  }

  async function copyHookahLink(hookahId) {
    const link = getHookahUrl(hookahId);

    try {
      await navigator.clipboard.writeText(link);
      setCopiedLinkMessage(`Ссылка кальяна №${hookahId} скопирована`);
    } catch {
      setCopiedLinkMessage(link);
    }
  }

  function callMaster(targetNumber = tableNumber.trim()) {
    const normalizedTableNumber = String(targetNumber || '').trim();

    if (!normalizedTableNumber) {
      setCallMasterNotice('Укажите номер стола, чтобы мастер понял, куда подойти.');
      document.getElementById('call-master')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const event = {
      type: 'call_master',
      guestId,
      tableNumber: normalizedTableNumber,
      createdAt: new Date().toISOString()
    };

    setLastCallMasterEvent(event);
    setCallMasterNotice('Мастер скоро подойдет');

    try {
      localStorage.setItem(LAST_CALL_STORAGE_KEY, JSON.stringify(event));
      console.info('Mock call master event:', event);
    } catch {
      // Mock-режим: позже здесь можно отправить событие в Telegram, CRM или backend.
    }

    document.getElementById('call-master')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function loginAsMaster(event) {
    event.preventDefault();
    const normalizedLogin = masterCredentials.login.trim().toLowerCase();

    if (normalizedLogin === MASTER_LOGIN && masterCredentials.password === masterPin) {
      setIsMaster(true);
      setOnlyAvailable(false);
      setMasterTab('order');
      setIsLoginOpen(false);
      setMasterCredentials({ login: '', password: '' });
      setLoginError('');
      return;
    }

    setLoginError('Логин или пароль не подошли. Проверьте данные и попробуйте еще раз.');
  }

  function logoutMaster() {
    setIsMaster(false);
    setMasterCredentials({ login: '', password: '' });
    setLoginError('');
  }

  function updateDraftQuantity(id, quantity) {
    setTobaccos((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity,
              grams: formatGrams(quantity),
              inStock: quantity > 0
            }
          : item
      )
    );
  }

  function updateDraftGrams(id, grams) {
    const isEmpty = String(grams) === '';
    const numericGrams = Number(grams);
    if (!isEmpty && !Number.isFinite(numericGrams)) return;

    const normalizedGrams = isEmpty ? '' : Math.max(0, numericGrams);
    const quantity = isEmpty
      ? 0
      : Math.round((normalizedGrams / GRAMS_PER_UNIT) * 10000) / 10000;
    setTobaccos((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              grams: normalizedGrams,
              quantity,
              inStock: Number(normalizedGrams) > 0
            }
          : item
      )
    );
  }

  function clearZeroDraftGrams(id) {
    setTobaccos((current) =>
      current.map((item) =>
        item.id === id && getInventoryGrams(item) === 0
          ? { ...item, grams: '' }
          : item
      )
    );
  }

  function commitDraftGrams(id) {
    setTobaccos((current) =>
      current.map((item) =>
        item.id === id && item.grams === ''
          ? { ...item, grams: 0, quantity: 0, inStock: false }
          : item
      )
    );
  }

  async function saveQuantityToSheet(item) {
    setMasterSaveMessage('');
    setSavingIds((current) => [...new Set([...current, item.id])]);

    try {
      const saved = await saveTobaccoQuantity(item.id, item.quantity, masterPin, item.grams);
      setTobaccos((current) =>
        current.map((tobacco) => (tobacco.id === item.id ? { ...tobacco, ...saved } : tobacco))
      );
      setMasterSaveMessage(`Сохранено: ${saved.name}`);
    } catch (saveError) {
      setMasterSaveMessage(saveError.message || 'Не удалось сохранить изменение');
    } finally {
      setSavingIds((current) => current.filter((id) => id !== item.id));
    }
  }

  async function addNewTobacco(event) {
    event.preventDefault();
    setMasterSaveMessage('');

    try {
      const saved = await addTobacco(newTobacco, masterPin);
      setTobaccos((current) => [...current, saved]);
      setNewTobacco({ name: '', grams: GRAMS_PER_UNIT, taste: '' });
      setMasterSaveMessage(`Добавлено: ${saved.name}`);
    } catch (saveError) {
      setMasterSaveMessage(saveError.message || 'Не удалось добавить позицию');
    }
  }

  function updateMixItem(index, field, value) {
    setMixDraft((current) => ({
      ...current,
      tobaccos: current.tobaccos.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: field === 'percent' && value !== '' ? Math.max(0, Number(value)) : value
            }
          : item
      )
    }));
  }

  function updateMixPercent(index, value) {
    const rawValue = String(value);

    if (rawValue === '') {
      updateMixItem(index, 'percent', '');
      return;
    }

    const withoutLeadingZero = rawValue.replace(/^0+(?=\d)/, '');
    const numericValue = Number(withoutLeadingZero);

    if (!Number.isFinite(numericValue)) return;

    updateMixItem(index, 'percent', Math.min(100, Math.max(0, numericValue)));
  }

  function clearZeroMixPercent(index) {
    setMixDraft((current) => ({
      ...current,
      tobaccos: current.tobaccos.map((item, itemIndex) =>
        itemIndex === index && Number(item.percent || 0) === 0 ? { ...item, percent: '' } : item
      )
    }));
  }

  function commitMixPercent(index) {
    setMixDraft((current) => ({
      ...current,
      tobaccos: current.tobaccos.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (item.percent === '') return item;

        const numericValue = Math.min(100, Math.max(0, Number(item.percent || 0)));
        const roundedToFive = Math.round(numericValue / 5) * 5;

        return {
          ...item,
          percent: roundedToFive
        };
      })
    }));
  }

  function stepMixPercent(index, direction) {
    setMixDraft((current) => ({
      ...current,
      tobaccos: current.tobaccos.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const currentPercent = Number(item.percent || 0);
        const nextPercent = Math.min(100, Math.max(0, currentPercent + direction * 5));

        return {
          ...item,
          percent: nextPercent
        };
      })
    }));
  }

  function startMixForHookah(hookahId, mix = null) {
    const existingFormatId = findFormatSelection(mix?.format?.variantId || mix?.format?.id)?.variant.id || '';
    const existingFormat = findFormatSelection(existingFormatId);
    const safeFormatId = existingFormat && isFormatAllowedForHookah(existingFormat.format.id, hookahId)
      ? existingFormat.variant.id
      : '';

    setMixDraft({
      hookahId,
      formatId: safeFormatId,
      comment: mix?.comment || '',
      tobaccos: Array.isArray(mix?.tobaccos)
        ? mix.tobaccos.map((item) => ({
            tobaccoId: item.id,
            percent: Number(item.percent || 0)
          }))
        : [],
      replacingMixId: mix?.id || ''
    });
    setPendingMixRequest(null);
    setMixSaveMessage('');
    setLastSavedMix(null);
    setMasterTab('order');
  }

  function selectMixHookah(hookahId) {
    setMixDraft((current) => {
      const currentFormat = findFormatSelection(current.formatId);
      const nextFormatId = currentFormat && isFormatAllowedForHookah(currentFormat.format.id, hookahId)
        ? current.formatId
        : '';

      return {
        ...current,
        hookahId,
        formatId: nextFormatId,
        replacingMixId: activeHookahMixes[hookahId]?.id || ''
      };
    });
    setPendingMixRequest(null);
  }

  async function clearHookahMix(hookahId) {
    setActiveHookahsError('');
    setClearingHookahIds((current) => [...new Set([...current, hookahId])]);

    try {
      await clearActiveMix(hookahId, masterPin);
      setActiveHookahMixes((current) => ({
        ...current,
        [hookahId]: null
      }));
      if (lastSavedMix?.hookahId === hookahId) {
        setLastSavedMix(null);
      }
      if (mixDraft.hookahId === hookahId) {
        setMixDraft((current) => ({
          ...current,
          formatId: '',
          comment: '',
          tobaccos: [],
          replacingMixId: ''
        }));
        setPendingMixRequest(null);
      }
      if (masterTab === 'history') {
        refreshMixHistory(historyPeriod);
      }
      setCopiedLinkMessage(`Микс снят с кальяна №${hookahId}`);
      return true;
    } catch (clearError) {
      setActiveHookahsError(clearError.message || 'Не удалось снять микс');
      return false;
    } finally {
      setClearingHookahIds((current) => current.filter((id) => id !== hookahId));
    }
  }

  function addMixItem(tobacco) {
    setMixDraft((current) => ({
      ...current,
      tobaccos: current.tobaccos.some((item) => item.tobaccoId === tobacco.id)
        ? current.tobaccos
        : [...current.tobaccos, { tobaccoId: tobacco.id, percent: 0 }]
    }));
    setMixSearch('');
  }

  function removeMixItem(index) {
    setMixDraft((current) => ({
      ...current,
      tobaccos: current.tobaccos.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  function distributeMixEvenly() {
    setMixDraft((current) => {
      const count = current.tobaccos.length;
      if (count === 0) return current;

      const totalSteps = 20;
      const baseSteps = Math.floor(totalSteps / count);
      const remainder = totalSteps - baseSteps * count;

      return {
        ...current,
        tobaccos: current.tobaccos.map((item, index) => ({
          ...item,
          percent: (baseSteps + (index < remainder ? 1 : 0)) * 5
        }))
      };
    });
  }

  async function saveHookahMix(event) {
    event.preventDefault();
    if (mixSaveLockRef.current) return;
    setMixSaveMessage('');
    setLastSavedMix(null);

    if (!isHookahSelected) {
      setMixSaveMessage('Сначала выберите физический кальян для этого микса.');
      return;
    }

    if (mixDraft.tobaccos.length === 0) {
      setMixSaveMessage('Добавьте хотя бы один табак в микс.');
      return;
    }

    if (!selectedMixFormat) {
      setMixSaveMessage(
        selectedHookahUnit?.lockedFormatId
          ? 'Выберите авторский вариант подачи для этого кальяна.'
          : 'Выберите формат подачи для этого кальяна.'
      );
      return;
    }

    if (!isMixFormatAllowed) {
      setMixSaveMessage('Для выбранного кальяна этот формат подачи недоступен.');
      return;
    }

    if (!canSaveMix) {
      setMixSaveMessage(`Сумма процентов должна быть ровно 100%. Сейчас: ${mixPercentTotal}%.`);
      return;
    }

    const selectedTobaccos = mixDraft.tobaccos
      .map((item) => {
        const tobacco = tobaccos.find((current) => current.id === item.tobaccoId);
        if (!tobacco) return null;

        return {
          id: tobacco.id,
          brand: getBrand(tobacco),
          name: tobacco.name,
          taste: tobacco.taste,
          percent: Number(item.percent || 0)
        };
      })
      .filter(Boolean);

    const requestFingerprint = JSON.stringify({
      hookahId: mixDraft.hookahId,
      formatId: mixDraft.formatId,
      comment: mixDraft.comment,
      tobaccos: selectedTobaccos
    });
    const requestId = pendingMixRequest?.fingerprint === requestFingerprint
      ? pendingMixRequest.id
      : createInventoryRequestId();
    setPendingMixRequest({ id: requestId, fingerprint: requestFingerprint });
    mixSaveLockRef.current = true;
    setIsMixSaving(true);

    try {
      const saved = await saveActiveMix(
        mixDraft.hookahId,
        {
          tobaccos: selectedTobaccos,
          format: {
            id: selectedMixFormat.format.id,
            title: selectedMixFormat.format.title,
            variantId: selectedMixFormat.variant.id,
            variantTitle: selectedMixFormat.variant.title,
            priceLabel: selectedMixFormat.variant.priceLabel
          },
          comment: mixDraft.comment,
          requestId,
          expectedActiveMixId: mixDraft.replacingMixId
        },
        masterPin
      );
      setLastSavedMix(saved);
      setActiveHookahMixes((current) => ({
        ...current,
        [saved.hookahId]: saved
      }));
      setMixSaveMessage(`Заказ сохранён для кальяна №${saved.hookahId}`);
      setMixDraft((current) => ({ ...current, replacingMixId: saved.id }));
      setPendingMixRequest(null);
      await refreshTobaccos();
    } catch (saveError) {
      setMixSaveMessage(saveError.message || 'Не удалось сохранить микс');
    } finally {
      mixSaveLockRef.current = false;
      setIsMixSaving(false);
    }
  }

  function renderCards(items, className = 'tobacco-grid') {
    return (
      <div className={className}>
        {items.map((item) => (
          <TobaccoCard
            key={item.id}
            item={item}
            isMaster={isMaster}
            onChange={updateDraftQuantity}
            onSave={saveQuantityToSheet}
            onAddChoice={addChoice}
            isChosen={choiceIds.has(item.id)}
            isSaving={savingIds.includes(item.id)}
            selectedCategoryIds={selectedCategoryIds}
          />
        ))}
      </div>
    );
  }

  if (hookahPageId) {
    return (
      <main>
        <section className="hookah-mix-page">
          <a className="brand" href="/" aria-label="На главную">
            <span className="brand-mark">H</span>
            <span>
              Hookah Menu
              <small>активный микс</small>
            </span>
          </a>

          <section className="hookah-mix-card">
            <span className="eyebrow">Ваш микс</span>
            <h1>Ваш микс</h1>
            <p>Кальян №{hookahPageId}</p>

            {isMixLoading ? (
              <div className="soft-hint">Загружаю активный микс...</div>
            ) : activeMixError ? (
              <div className="error-banner" role="status">
                <div>
                  <strong>Не удалось загрузить микс</strong>
                  <span>{activeMixError}</span>
                </div>
              </div>
            ) : !activeMix ? (
              <div className="empty-active-mix">
                Для этого кальяна пока не назначен микс. Позовите мастера.
              </div>
            ) : (
              <>
                {activeMix.format && (
                  <div className="active-mix-format">
                    <span>Формат подачи</span>
                    <strong>{activeMix.format.title} - {activeMix.format.variantTitle}</strong>
                    <small>{activeMix.format.priceLabel}</small>
                  </div>
                )}

                <div className="active-mix-list">
                  {activeMix.tobaccos.map((item) => (
                    <article className="active-mix-item" key={`${item.id}-${item.percent}`}>
                      <div>
                        <span>{item.brand}</span>
                        <strong>{item.name} - {item.percent}%</strong>
                        <small>{item.taste}</small>
                      </div>
                    </article>
                  ))}
                </div>

                {activeMix.comment && (
                  <div className="active-mix-comment">
                    <span>Комментарий мастера:</span>
                    <p>{activeMix.comment}</p>
                  </div>
                )}

                <div className="active-mix-date">
                  <CalendarClock size={18} />
                  {formatMixDate(activeMix.createdAt)}
                </div>
              </>
            )}

            <div className="hookah-call-master" id="call-master">
              <button
                className="primary-button"
                type="button"
                onClick={() => callMaster(`Кальян ${hookahPageId}`)}
              >
                <BellRing size={18} />
                Позвать мастера
              </button>
              {callMasterNotice && (
                <div className="call-master-notice" role="status">
                  {callMasterNotice}
                </div>
              )}
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main>
      <header className="site-header" id="home">
        <nav className="nav">
          <a className="brand" href="#home" aria-label="Главная">
            <span className="brand-mark">H</span>
            <span>
              Hookah Menu
              <small>табачная карта</small>
            </span>
          </a>
          {!isMaster && (
            <div className="nav-links">
              <a href="#hookah-format">Подбор</a>
              <a href="#all-tobaccos">Все табаки</a>
            </div>
          )}
          <div className="nav-auth">
            {isMaster ? (
              <a className="login-button" href="#master">
                <ShieldCheck size={17} />
                Панель
              </a>
            ) : (
              <button className="login-button" type="button" onClick={() => setIsLoginOpen(true)}>
                <Lock size={17} />
                Войти
              </button>
            )}
          </div>
        </nav>

        {!isMaster && (
          <section className="hero">
            <div>
              <span className="eyebrow">QR-меню для гостей</span>
              <h1>Hookah Menu</h1>
              <p>Выберите вкус для кальяна за пару нажатий.</p>
              <div className="hero-actions">
                <a className="primary-button" href="#hookah-format">Подобрать вкус</a>
                <a className="ghost-button hero-secondary-link" href="#all-tobaccos">Смотреть все табаки</a>
                <button className="call-master-hero-button" type="button" onClick={callMaster}>
                  <BellRing size={18} />
                  Позвать мастера
                </button>
              </div>

              <div className="guest-contact-card" aria-label="Контактные данные">
                <span className="guest-contact-title">Контакты</span>
                <div className="guest-contact-list">
                  <a href="tel:+79999999999">
                    <Phone size={17} />
                    +7 999 999-99-99
                  </a>
                  <span>
                    <MapPin size={17} />
                    Адрес заведения
                  </span>
                  <a href="https://t.me/" target="_blank" rel="noreferrer">
                    <MessageCircle size={17} />
                    Telegram / Instagram
                  </a>
                </div>
              </div>
            </div>

            <aside className="status-panel" aria-label="Краткая статистика">
              <span>Сегодня доступно</span>
              <strong>{availableCount}</strong>
              <small>из {tobaccos.length} позиций</small>
            </aside>
          </section>
        )}
      </header>

      {isLoginOpen && (
        <div className="auth-modal-backdrop" role="presentation">
          <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
            <div className="auth-modal-header">
              <div>
                <span className="eyebrow">Вход / регистрация</span>
                <h2 id="auth-modal-title">Вход для персонала</h2>
              </div>
              <button
                className="auth-close-button"
                type="button"
                aria-label="Закрыть вход"
                onClick={() => {
                  setIsLoginOpen(false);
                  setLoginError('');
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form className="auth-form" onSubmit={loginAsMaster}>
              <label>
                Логин
                <input
                  autoComplete="username"
                  placeholder="master"
                  type="text"
                  value={masterCredentials.login}
                  onChange={(event) =>
                    setMasterCredentials((current) => ({ ...current, login: event.target.value }))
                  }
                />
              </label>

              <label>
                Пароль
                <input
                  autoComplete="current-password"
                  placeholder="Введите пароль"
                  type="password"
                  value={masterCredentials.password}
                  onChange={(event) =>
                    setMasterCredentials((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </label>

              {loginError && <span className="login-error">{loginError}</span>}

              <div className="auth-actions">
                <button className="primary-button" type="submit">
                  Войти
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setIsLoginOpen(false);
                    setLoginError('');
                  }}
                >
                  Закрыть
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {pendingClearHookahId && (
        <div className="auth-modal-backdrop" role="presentation">
          <section className="auth-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="clear-mix-title">
            <div className="auth-modal-header">
              <div>
                <span className="eyebrow">Активный кальян</span>
                <h2 id="clear-mix-title">Снять микс?</h2>
              </div>
              <button
                className="auth-close-button"
                type="button"
                aria-label="Закрыть подтверждение"
                onClick={() => setPendingClearHookahId('')}
              >
                <X size={20} />
              </button>
            </div>

            <p className="confirm-modal-copy">
              Вы уверены, что хотите снять микс с кальяна №{pendingClearHookahId}? После подтверждения
              QR этого кальяна будет показывать, что микс пока не назначен.
            </p>

            <div className="auth-actions">
              <button className="ghost-button" type="button" onClick={() => setPendingClearHookahId('')}>
                Отмена
              </button>
              <button
                className="primary-button danger-confirm-button"
                disabled={clearingHookahIds.includes(pendingClearHookahId)}
                type="button"
                onClick={async () => {
                  const hookahId = pendingClearHookahId;
                  const isCleared = await clearHookahMix(hookahId);
                  if (isCleared) {
                    setPendingClearHookahId('');
                  }
                }}
              >
                <Trash2 size={17} />
                {clearingHookahIds.includes(pendingClearHookahId) ? 'Снимаю' : 'Снять микс'}
              </button>
            </div>
          </section>
        </div>
      )}

      {!isMaster && (
        <>
      <section className="hookah-format-section" id="hookah-format" aria-label="Выберите формат кальяна">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Формат подачи</span>
            <h2>Выберите формат кальяна</h2>
          </div>
        </div>

        <div className="hookah-format-grid">
          {hookahFormats.map((format) => {
            const isExpanded = expandedFormatId === format.id;
            const selectedVariant = format.variants.find((variant) => variant.id === selectedFormatId);

            return (
              <article
                className={`hookah-format-card${selectedVariant ? ' is-selected' : ''}${isExpanded ? ' is-expanded' : ''}`}
                key={format.id}
              >
                <div className="hookah-format-summary">
                  <div className="hookah-format-copy">
                    <strong>{format.title}</strong>
                    <small>{format.description}</small>
                  </div>
                  <button
                    className="hookah-format-toggle"
                    type="button"
                    onClick={() => setExpandedFormatId(isExpanded ? '' : format.id)}
                  >
                    {isExpanded ? 'Скрыть' : 'Подробнее'}
                  </button>
                </div>

                <div className={`hookah-format-variants${isExpanded ? ' is-open' : ''}`}>
                  <div className="hookah-format-variant-grid">
                    {format.variants.map((variant) => {
                      const isSelected = selectedFormatId === variant.id;
                      const shouldShowImage = variant.image && !failedFormatImages[variant.id];

                      return (
                        <article className={`hookah-format-variant${isSelected ? ' is-selected' : ''}`} key={variant.id}>
                          <span
                            className={`hookah-format-media${shouldShowImage ? ' has-image' : ''}`}
                            style={shouldShowImage ? { '--format-image': `url(${variant.image})` } : undefined}
                          >
                            {shouldShowImage ? (
                              <img
                                src={variant.image}
                                alt={variant.title}
                                onError={() => setFailedFormatImages((current) => ({
                                  ...current,
                                  [variant.id]: true
                                }))}
                              />
                            ) : (
                              <span className="hookah-format-photo">Фото скоро</span>
                            )}
                          </span>
                          <span className="hookah-format-variant-copy">
                            <span className="hookah-format-title-row">
                              <strong>{variant.title}</strong>
                              <span className="hookah-format-price">{variant.priceLabel}</span>
                            </span>
                            <small>{variant.description}</small>
                          </span>
                          <button
                            className="hookah-format-action"
                            type="button"
                            onClick={() => setSelectedFormatId(variant.id)}
                          >
                            {isSelected ? 'Выбрано' : 'Выбрать'}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="guest-flow-section" id="taste-builder">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Главный сценарий</span>
            <h2>Подобрать вкус</h2>
          </div>
        </div>

        <section className="taste-builder" aria-label="Конструктор вкуса">
          <div className="taste-builder-heading">
            <div>
              <h3>Что хочется сегодня?</h3>
              <p>Можно выбрать несколько вкусовых направлений.</p>
            </div>
            {(selectedCategoryIds.length > 0 || selectedStrength !== 'any') && (
              <button
                className="clear-taste-button"
                type="button"
                onClick={() => {
                  setSelectedCategoryIds([]);
                  setSelectedStrength('any');
                }}
              >
                <X size={16} />
                Сбросить
              </button>
            )}
          </div>

          <div className="taste-category-grid">
            {TASTE_CATEGORIES.map((category) => (
              <button
                className={selectedCategoryIds.includes(category.id) ? 'is-active' : ''}
                key={category.id}
                type="button"
                onClick={() => toggleTasteCategory(category.id)}
              >
                <Sparkles size={16} />
                <span>{category.label}</span>
                <small>{category.hint}</small>
              </button>
            ))}
          </div>

          <div className="strength-picker" aria-label="Выбор крепости">
            <span>Крепость</span>
            <div>
              {STRENGTH_OPTIONS.map((option) => (
                <button
                  className={selectedStrength === option.id ? 'is-active' : ''}
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedStrength(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="taste-builder-summary">
            {selectedCategories.length === 0 && selectedStrength === 'any'
              ? 'Выберите один или несколько вкусов, и мы подберем варианты.'
              : `Выбрано: ${selectedCategories.map((category) => category.label).join(' + ') || 'любой вкус'}, крепость: ${selectedStrengthLabel}.`}
          </div>
        </section>

        <section className="guest-request-section" aria-label="Комментарий для мастера">
          <div className="guest-request-heading">
            <div>
              <span className="eyebrow">Сообщение мастеру</span>
              <h3>Добавьте пожелание</h3>
            </div>
          </div>

          <label className="guest-comment-field">
            Комментарий
            <textarea
              placeholder="Например: с холодком, без холодка, побольше ягод, поменьше сладости, хочу что-то необычное"
              value={guestComment}
              onChange={(event) => setGuestComment(event.target.value)}
            />
          </label>

          <div className="send-options">
            <button className="primary-button" type="button" onClick={prepareChoiceRequest}>
              <Send size={18} />
              Отправить мой выбор
            </button>
          </div>

          <p className="send-note">
            Пока это только подготовка сообщения на экране. Позже сюда можно подключить Telegram-бота или другой способ отправки.
          </p>

          {preparedRequest && (
            <div className="prepared-request" role="status">
              <div className="prepared-request-heading">
                <strong>{preparedRequest.title}</strong>
                <button type="button" onClick={() => setPreparedRequest(null)} aria-label="Закрыть подготовленное сообщение">
                  <X size={16} />
                </button>
              </div>
              <pre>{preparedRequest.text}</pre>
            </div>
          )}
        </section>

        <section className="recommendation-section" aria-label="Мы рекомендуем">
          <div className="recommendation-heading">
            <div>
              <span className="eyebrow">Мы рекомендуем</span>
              <h3>Лучшие варианты из наличия</h3>
            </div>
            {recommendedTobaccos.length > 0 && <span>{recommendedTobaccos.length} вариантов</span>}
          </div>

          {selectedCategoryIds.length === 0 && selectedStrength === 'any' ? (
            <div className="soft-hint">Выберите один или несколько вкусов, и мы подберем варианты.</div>
          ) : recommendedTobaccos.length === 0 ? (
            <div className="soft-hint">Точных совпадений мало, вот ближайшие варианты появятся после обновления наличия.</div>
          ) : (
            <>
              {exactRecommendationCount < 3 && (
                <div className="soft-hint">Точных совпадений мало, вот ближайшие варианты.</div>
              )}
              {renderCards(recommendedTobaccos, 'recommendation-grid')}
            </>
          )}
        </section>

        <section className="choice-section" id="my-choice" aria-label="Мой выбор">
          <div className="choice-heading">
            <div>
              <span className="eyebrow">Показать мастеру</span>
              <h3>Мой выбор</h3>
            </div>
            {choiceItems.length > 0 && (
              <button className="clear-taste-button" type="button" onClick={() => setChoiceItems([])}>
                <Trash2 size={16} />
                Очистить
              </button>
            )}
          </div>

          <div className="choice-format-summary">
            <span>Формат кальяна</span>
            <strong>
              {selectedFormat
                ? `${selectedFormat.format.title} — ${selectedFormat.variant.title}`
                : 'Пока не выбран'}
            </strong>
            {selectedFormat && <small>{selectedFormat.variant.priceLabel}</small>}
          </div>

          {choiceItems.length === 0 ? (
            <div className="choice-empty">Вы пока ничего не выбрали</div>
          ) : (
            <div className="choice-list">
              {choiceItems.map((item) => (
                <div className="choice-item" key={item.id}>
                  <div>
                    <span>{item.brand}</span>
                    <strong>{item.name}</strong>
                    <small>{item.taste}</small>
                  </div>
                  <button type="button" onClick={() => removeChoice(item.id)} aria-label={`Удалить ${item.name}`}>
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <section className="guest-details-section" aria-label="Контактные данные">
            <div className="guest-details-heading">
              <span className="eyebrow">Для связи</span>
              <h3>Контактные данные</h3>
            </div>
            <div className="guest-details-fields">
              <label className="guest-details-field">
                <span>Имя</span>
                <input
                  type="text"
                  value={contactData.name}
                  onChange={(event) => updateContactData('name', event.target.value)}
                  placeholder="Ваше имя"
                  autoComplete="name"
                />
              </label>
              <label className="guest-details-field">
                <span>Телефон</span>
                <input
                  type="tel"
                  value={contactData.phone}
                  onChange={(event) => updateContactData('phone', event.target.value)}
                  placeholder="Номер телефона"
                  autoComplete="tel"
                />
              </label>
              <label className="guest-details-field">
                <span>Соцсеть</span>
                <input
                  type="text"
                  value={contactData.social}
                  onChange={(event) => updateContactData('social', event.target.value)}
                  placeholder="Telegram или Instagram"
                  autoComplete="off"
                />
              </label>
            </div>
            <p className="guest-details-note">
              Эти данные пока сохраняются только на этом телефоне. Позже их можно будет подключить к отправке заказа.
            </p>
          </section>

          <div className="choice-send-row">
            <button className="ghost-button" type="button" onClick={prepareChoiceRequest}>
              <Send size={18} />
              Отправить мой выбор
            </button>
          </div>
        </section>

        {!isMaster && (
          <section className="call-master-section" id="call-master" aria-label="Позвать мастера">
            <div className="call-master-heading">
              <div>
                <span className="eyebrow">Нужна помощь?</span>
                <h3>Позвать мастера</h3>
              </div>
            </div>

            <div className="call-master-controls">
              <label>
                Номер стола
                <input
                  inputMode="numeric"
                  placeholder="Например: 5"
                  type="text"
                  value={tableNumber}
                  onChange={(event) => setTableNumber(event.target.value)}
                />
              </label>

              <button className="primary-button" type="button" onClick={callMaster}>
                <BellRing size={18} />
                Позвать мастера
              </button>
            </div>

            {callMasterNotice && (
              <div className="call-master-notice" role="status">
                {callMasterNotice}
              </div>
            )}

            {lastCallMasterEvent && (
              <div className="call-master-event">
                Mock-событие создано для стола {lastCallMasterEvent.tableNumber}
              </div>
            )}
          </section>
        )}
      </section>

      <section className="toolbar-section" id="all-tobaccos">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Полный список</span>
            <h2>Все табаки</h2>
          </div>
        </div>

        <div className="toolbar">
          <label className="search-box">
            <Search size={20} />
            <input
              type="search"
              placeholder="Например: арбуз, cola, darkside"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <label className="filter-toggle">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(event) => setOnlyAvailable(event.target.checked)}
            />
            <SlidersHorizontal size={18} />
            Только в наличии
          </label>
        </div>

        <div className="brand-filter" aria-label="Фильтр по брендам">
          <button
            className={selectedBrand === 'all' ? 'is-active' : ''}
            type="button"
            onClick={() => setSelectedBrand('all')}
          >
            <Tags size={16} />
            Все
            <span>{tobaccos.length}</span>
          </button>

          {brandOptions.map((brand) => (
            <button
              className={selectedBrand === brand.name ? 'is-active' : ''}
              key={brand.name}
              type="button"
              onClick={() => setSelectedBrand(brand.name)}
            >
              {brand.name}
              <span>{brand.count}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="error-banner" role="status">
            <div>
              <strong>Не удалось загрузить список табаков</strong>
              <span>Показываю тестовый список, чтобы сайт можно было посмотреть локально.</span>
            </div>
            <button type="button" onClick={refreshTobaccos}>Повторить</button>
          </div>
        )}

        <div className="source-line">
          {isLoading ? 'Загружаю данные...' : source === 'google-sheet' ? 'Данные загружены из Google Таблицы' : 'Открыт тестовый список'}
        </div>

        <div className="brand-results">
          {groupedTobaccos.map((group) => (
            <section className="brand-group" key={group.brand}>
              <div className="brand-group-heading">
                <h3>{group.brand}</h3>
                <span>{group.items.length} поз.</span>
              </div>

              {renderCards(group.items)}
            </section>
          ))}
        </div>

        {listedTobaccos.length === 0 && (
          <div className="empty-state">
            Ничего не найдено. Попробуйте изменить запрос или выключить фильтр.
          </div>
        )}
      </section>
        </>
      )}

      {isMaster && (
        <section className="master-section" id="master">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Доступ персонала</span>
              <h2>Панель мастера</h2>
            </div>
          </div>

          <div className="master-panel">
            <div className="master-panel-header">
              <div>
                <ShieldCheck size={24} />
                <div>
                  <h3>Панель мастера</h3>
                  <p>Можно менять количество и добавлять позиции. Сохранение идет через сервер в Google Таблицу.</p>
                </div>
              </div>
              <button className="ghost-button" type="button" onClick={logoutMaster}>
                <LogOut size={18} />
                Выйти из режима мастера
              </button>
            </div>

            <div className="master-enabled-note">
              <ShieldCheck size={18} />
              Режим мастера включен
            </div>

            <div className="save-note">
              <Settings2 size={18} />
              Данные Google сохраняются только через backend. Если ключи Google не настроены, сайт покажет ошибку сохранения и продолжит работать на просмотр.
            </div>

            {activeMixStorage && (
              <div className={`storage-note ${activeMixStorage.isPersistent ? 'is-persistent' : 'is-warning'}`}>
                <Settings2 size={18} />
                <div>
                  <strong>Активные миксы: {activeMixStorage.label}</strong>
                  <span>
                    {activeMixStorage.isPersistent
                      ? 'Миксы кальянов сохраняются в Google Таблицу и переживают перезапуск Render.'
                      : activeMixStorage.warning}
                  </span>
                </div>
              </div>
            )}

            {masterSaveMessage && (
              <div className="master-save-message" role="status">
                {masterSaveMessage}
              </div>
            )}

            <div className="master-tabs" role="tablist" aria-label="Разделы панели мастера">
              {[
                ['order', 'Создать заказ'],
                ['active', 'Активные кальяны'],
                ['history', 'История заказов'],
                ['stock', 'Остатки'],
                ['qr', 'QR кальянов']
              ].map(([value, label]) => (
                <button
                  className={masterTab === value ? 'is-active' : ''}
                  key={value}
                  type="button"
                  onClick={() => setMasterTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {masterTab === 'active' && (
              <section className="active-hookahs-panel" aria-label="Активные кальяны">
                <div className="master-mix-heading">
                  <div>
                    <span className="eyebrow">Состояние кальянов</span>
                    <h3>Активные кальяны</h3>
                  </div>
                  <button
                    className="ghost-button"
                    disabled={isActiveHookahsLoading}
                    type="button"
                    onClick={refreshActiveHookahs}
                  >
                    <RefreshCcw size={17} />
                    {isActiveHookahsLoading ? 'Обновляю' : 'Обновить'}
                  </button>
                </div>

                {activeHookahsError && (
                  <div className="error-banner" role="status">
                    <div>
                      <strong>Не удалось загрузить активные кальяны</strong>
                      <span>{activeHookahsError}</span>
                    </div>
                    <button type="button" onClick={refreshActiveHookahs}>Повторить</button>
                  </div>
                )}

                <div className="active-hookah-grid">
                  {hookahNumbers.map((hookahId) => {
                    const mix = activeHookahMixes[hookahId] || null;
                    const unit = getHookahUnit(hookahId);

                    return (
                      <article className={`active-hookah-card ${mix ? 'has-mix' : 'is-empty'}`} key={hookahId}>
                        <div className="active-hookah-card-header">
                          <div>
                            <span className="active-hookah-status">
                              {mix ? 'Микс назначен' : 'Микса нет'}
                            </span>
                            <h4>Кальян №{hookahId}</h4>
                            {unit?.typeLabel && (
                              <small className="hookah-unit-kind">{unit.typeLabel}</small>
                            )}
                          </div>
                          {mix?.createdAt && (
                            <span className="active-hookah-date">
                              <CalendarClock size={15} />
                              {formatMixDate(mix.createdAt)}
                            </span>
                          )}
                        </div>

                        {mix ? (
                          <>
                            {mix.format && (
                              <div className="active-hookah-format">
                                <span>Формат</span>
                                <strong>{mix.format.title} - {mix.format.variantTitle}</strong>
                                <small>{mix.format.priceLabel}</small>
                              </div>
                            )}

                            <div className="active-hookah-mix-list">
                              {mix.tobaccos.map((item) => (
                                <div className="active-hookah-mix-item" key={`${hookahId}-${item.id}-${item.percent}`}>
                                  <strong>{item.brand} {item.name}</strong>
                                  <span>{item.percent}%</span>
                                  <small>{item.taste}</small>
                                </div>
                              ))}
                            </div>

                            {mix.comment && (
                              <div className="active-hookah-comment">
                                <span>Комментарий</span>
                                <p>{mix.comment}</p>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="active-hookah-empty">
                            Для этого кальяна пока не назначен активный микс.
                          </div>
                        )}

                        <div className="active-hookah-actions">
                          <a className="ghost-button" href={`/hookah/${hookahId}`} target="_blank" rel="noreferrer">
                            <ExternalLink size={17} />
                            Открыть
                          </a>
                          <button className="ghost-button" type="button" onClick={() => copyHookahLink(hookahId)}>
                            <Copy size={17} />
                            Скопировать ссылку
                          </button>
                          {mix ? (
                            <button
                              className="primary-button danger-confirm-button"
                              disabled={clearingHookahIds.includes(hookahId)}
                              type="button"
                              onClick={() => setPendingClearHookahId(hookahId)}
                            >
                              <Trash2 size={17} />
                              {clearingHookahIds.includes(hookahId) ? 'Снимаю' : 'Снять микс'}
                            </button>
                          ) : (
                            <button
                              className="primary-button"
                              type="button"
                              onClick={() => startMixForHookah(hookahId)}
                            >
                              Создать микс
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {masterTab === 'history' && (
              <section className="active-hookahs-panel mix-history-panel" aria-label="История заказов">
                <div className="master-mix-heading">
                  <div>
                    <span className="eyebrow">Снятые кальяны</span>
                    <h3>История заказов</h3>
                  </div>
                  <button
                    className="ghost-button"
                    disabled={isHistoryLoading}
                    type="button"
                    onClick={() => refreshMixHistory(historyPeriod)}
                  >
                    <RefreshCcw size={17} />
                    {isHistoryLoading ? 'Обновляю' : 'Обновить'}
                  </button>
                </div>

                <div className="history-filter-row" aria-label="Фильтр истории по времени">
                  {HISTORY_PERIODS.map((period) => (
                    <button
                      className={historyPeriod === period.id ? 'is-active' : ''}
                      key={period.id}
                      type="button"
                      onClick={() => setHistoryPeriod(period.id)}
                    >
                      {period.label}
                    </button>
                  ))}
                </div>

                {historyError && (
                  <div className="error-banner" role="status">
                    <div>
                      <strong>Не удалось загрузить историю кальянов</strong>
                      <span>{historyError}</span>
                    </div>
                    <button type="button" onClick={() => refreshMixHistory(historyPeriod)}>Повторить</button>
                  </div>
                )}

                {mixHistory.length === 0 ? (
                  <div className="active-hookah-empty">
                    За выбранный период снятых кальянов пока нет.
                  </div>
                ) : (
                  <div className="mix-history-list">
                    {mixHistory.map((mix) => (
                      <article className="active-hookah-card has-mix" key={`${mix.id}-${mix.closedAt || mix.updatedAt}`}>
                        <div className="active-hookah-card-header">
                          <div>
                            <span className="active-hookah-status">{mix.status || 'Снят'}</span>
                            <h4>Кальян №{mix.hookahId}</h4>
                          </div>
                          <span className="active-hookah-date">
                            <CalendarClock size={15} />
                            {formatMixDate(mix.closedAt || mix.updatedAt || mix.createdAt)}
                          </span>
                        </div>

                        {mix.format && (
                          <div className="active-hookah-format">
                            <span>Формат</span>
                            <strong>{mix.format.title} - {mix.format.variantTitle}</strong>
                            <small>{mix.format.priceLabel}</small>
                          </div>
                        )}

                        <div className="active-hookah-mix-list">
                          {(mix.tobaccos || []).map((item) => (
                            <div className="active-hookah-mix-item" key={`${mix.id}-${item.id}-${item.percent}`}>
                              <strong>{item.brand} {item.name}</strong>
                              <span>{item.percent}%</span>
                              <small>{item.taste}</small>
                            </div>
                          ))}
                        </div>

                        {mix.comment && (
                          <div className="active-hookah-comment">
                            <span>Комментарий</span>
                            <p>{mix.comment}</p>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {masterTab === 'order' && (
              <form className="master-mix-form" onSubmit={saveHookahMix}>
                <div className="master-mix-heading">
                  <div>
                    <span className="eyebrow">Активный микс</span>
                    <h3>Создать заказ</h3>
                  </div>
                  <span>Сумма: {mixPercentTotal}%</span>
                </div>

                <div className="hookah-number-picker" aria-label="Выберите кальян">
                  <div className="hookah-number-heading">
                    <div>
                      <span className="eyebrow">Обязательный шаг</span>
                      <h4>Выберите кальян</h4>
                    </div>
                    <p>
                      Микс сохранится именно для выбранного физического кальяна и будет показан гостю по его QR-коду.
                    </p>
                  </div>
                  <div>
                    {hookahNumbers.map((hookahId) => {
                      const unit = getHookahUnit(hookahId);

                      return (
                        <button
                          className={mixDraft.hookahId === hookahId ? 'is-active' : ''}
                          key={hookahId}
                          type="button"
                          onClick={() => selectMixHookah(hookahId)}
                        >
                          <strong>Кальян №{hookahId}</strong>
                          <small>{unit?.typeLabel || 'Обычный'}</small>
                        </button>
                      );
                    })}
                  </div>
                  {!isHookahSelected && (
                    <strong className="hookah-required-note">
                      Без выбора кальяна заказ сохранить нельзя.
                    </strong>
                  )}
                </div>

                <div className="master-format-picker" aria-label="Выберите формат подачи">
                  <div className="hookah-number-heading">
                    <div>
                      <span className="eyebrow">Формат подачи</span>
                      <h4>
                        {selectedHookahUnit?.lockedFormatId
                          ? 'Выберите авторский вариант'
                          : 'Выберите формат и вариант подачи'}
                      </h4>
                    </div>
                    <p>
                      {selectedHookahUnit?.lockedFormatId
                        ? 'Для кальянов №7-10 формат закреплён как авторский, мастер выбирает только вариант.'
                        : 'Для кальянов №1-6 доступны классическая подача и подача на фрукте.'}
                    </p>
                  </div>

                  {isHookahSelected ? (
                    <div className="master-format-groups">
                      {availableMixFormats.map((format) => (
                        <section className="master-format-group" key={format.id}>
                          <h5>{format.title}</h5>
                          <div>
                            {format.variants.map((variant) => (
                              <button
                                className={mixDraft.formatId === variant.id ? 'is-active' : ''}
                                key={variant.id}
                                type="button"
                                onClick={() => setMixDraft((current) => ({ ...current, formatId: variant.id }))}
                              >
                                <strong>{variant.title}</strong>
                                <small>{variant.priceLabel}</small>
                              </button>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="active-hookah-empty">
                      Сначала выберите номер кальяна, потом появятся доступные варианты подачи.
                    </div>
                  )}

                  {!selectedMixFormat && (
                    <strong className="hookah-required-note">
                      {selectedHookahUnit?.lockedFormatId
                        ? 'Выберите один авторский вариант.'
                        : 'Без формата подачи заказ сохранить нельзя.'}
                    </strong>
                  )}
                </div>

                <div className="mix-builder-grid">
                  <section className="mix-picker-panel" aria-label="Выбор табаков для микса">
                    <label className="master-search-box mix-search-box">
                      <Search size={20} />
                      <input
                        type="search"
                        placeholder="Найти табак, вкус или бренд"
                        value={mixSearch}
                        onChange={(event) => setMixSearch(event.target.value)}
                      />
                    </label>

                    <div className="mix-search-results">
                      {mixSearchResults.map((tobacco) => (
                        <button
                          className="mix-search-result"
                          key={tobacco.id}
                          type="button"
                          onClick={() => addMixItem(tobacco)}
                        >
                          <Plus size={16} />
                          <span>
                            <strong>{getBrand(tobacco)} {tobacco.name}</strong>
                            <small>{tobacco.taste}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="selected-mix-panel" aria-label="Табаки в миксе">
                    <div className="selected-mix-heading">
                      <div>
                        <span className="eyebrow">Табаки в миксе</span>
                        <h4>Выбранные позиции</h4>
                      </div>
                      <button
                        className="ghost-button"
                        disabled={mixDraft.tobaccos.length === 0}
                        type="button"
                        onClick={distributeMixEvenly}
                      >
                        Распределить поровну
                      </button>
                    </div>

                    <div className="selected-mix-list">
                      {mixDraft.tobaccos.length === 0 ? (
                        <div className="empty-state">Добавьте табаки из списка слева.</div>
                      ) : (
                        mixDraft.tobaccos.map((item, index) => {
                          const tobacco = tobaccos.find((current) => current.id === item.tobaccoId);

                          return (
                            <article className="selected-mix-row" key={item.tobaccoId}>
                              <div>
                                <strong>{tobacco ? `${getBrand(tobacco)} ${tobacco.name}` : 'Табак не найден'}</strong>
                                <small>{tobacco?.taste || 'Проверьте список табаков'}</small>
                                <small className="mix-component-usage">
                                  {item.percent || 0}% — {formatInventoryValue(mixComponentGrams[index])} г
                                </small>
                              </div>
                              <label>
                                %
                                <input
                                  inputMode="numeric"
                                  min="0"
                                  max="100"
                                  step="5"
                                  type="number"
                                  value={item.percent}
                                  onFocus={() => clearZeroMixPercent(index)}
                                  onChange={(event) => updateMixPercent(index, event.target.value)}
                                  onBlur={() => commitMixPercent(index)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'ArrowUp') {
                                      event.preventDefault();
                                      stepMixPercent(index, 1);
                                    }

                                    if (event.key === 'ArrowDown') {
                                      event.preventDefault();
                                      stepMixPercent(index, -1);
                                    }
                                  }}
                                />
                              </label>
                              <button
                                className="ghost-button"
                                type="button"
                                aria-label="Удалить из микса"
                                onClick={() => removeMixItem(index)}
                              >
                                <X size={16} />
                              </button>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </section>
                </div>

                <div className={`mix-total-card is-${mixPercentState.type}`}>
                  <div>
                    <strong>Сумма: {mixPercentTotal}%</strong>
                    <small>
                      Общий вес: {formatInventoryValue(mixCalculatedTotalGrams)} г
                      {!isMixPercentComplete && ` из ${STANDARD_MIX_GRAMS} г`}
                    </small>
                  </div>
                  <span>{mixPercentState.label}</span>
                </div>

                <label className="master-mix-comment">
                  Комментарий мастера
                  <textarea
                    placeholder="Например: сладкий ягодный микс без холодка"
                    value={mixDraft.comment}
                    onChange={(event) => setMixDraft((current) => ({ ...current, comment: event.target.value }))}
                  />
                </label>

                <div className="master-mix-actions">
                  <button
                    className="primary-button"
                    disabled={!canSaveMix || isMixSaving}
                    title={canSaveMix ? 'Сохранить заказ' : 'Нажмите, чтобы увидеть что нужно исправить'}
                    type="submit"
                  >
                    {isMixSaving ? 'Создаём заказ…' : 'Сохранить заказ'}
                  </button>
                </div>

                {mixSaveMessage && (
                  <div className="master-save-message" role="status">
                    {mixSaveMessage}
                  </div>
                )}

                {lastSavedMix && (
                  <div className="order-success-actions">
                    <a className="ghost-button" href={`/hookah/${lastSavedMix.hookahId}`} target="_blank" rel="noreferrer">
                      <ExternalLink size={17} />
                      Открыть страницу гостя
                    </a>
                    <button className="ghost-button" type="button" onClick={() => copyHookahLink(lastSavedMix.hookahId)}>
                      <Copy size={17} />
                      Скопировать ссылку
                    </button>
                  </div>
                )}
              </form>
            )}

            {masterTab === 'qr' && (
              <section className="qr-panel" aria-label="QR кальянов">
                <div className="master-mix-heading">
                  <div>
                    <span className="eyebrow">Постоянные QR</span>
                    <h3>QR кальянов</h3>
                  </div>
                </div>

                <div className="qr-hookah-grid">
                  {hookahNumbers.map((hookahId) => {
                    const unit = getHookahUnit(hookahId);

                    return (
                    <article className="qr-hookah-card" key={hookahId}>
                      <span className="hookah-unit-kind">{unit?.typeLabel || 'Обычный'}</span>
                      <h4>Кальян №{hookahId}</h4>
                      <div className="qr-code-box">
                        <QRCodeSVG
                          value={getHookahUrl(hookahId)}
                          size={190}
                          bgColor="#fffaf0"
                          fgColor="#15120d"
                          level="M"
                        />
                      </div>
                      <span className="qr-link">{getHookahUrl(hookahId)}</span>
                      <div className="qr-card-actions">
                        <a className="ghost-button" href={`/hookah/${hookahId}`} target="_blank" rel="noreferrer">
                          <ExternalLink size={17} />
                          Открыть
                        </a>
                        <button className="ghost-button" type="button" onClick={() => copyHookahLink(hookahId)}>
                          <Copy size={17} />
                          Скопировать ссылку
                        </button>
                      </div>
                    </article>
                    );
                  })}
                </div>
              </section>
            )}

            {copiedLinkMessage && (
              <div className="master-save-message" role="status">
                {copiedLinkMessage}
              </div>
            )}

            {masterTab === 'stock' && (
              <>
                <form className="master-add-form" onSubmit={addNewTobacco}>
                  <div>
                    <span className="eyebrow">Новая позиция</span>
                    <h3>Добавить табак</h3>
                  </div>

                  <label>
                    Наименование
                    <input
                      type="text"
                      placeholder="Например: Darkside Mango Lassi"
                      value={newTobacco.name}
                      onChange={(event) => setNewTobacco((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>

                  <label>
                    Остаток, г
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newTobacco.grams}
                      onFocus={() => setNewTobacco((current) => (
                        Number(current.grams) === 0 ? { ...current, grams: '' } : current
                      ))}
                      onChange={(event) => {
                        const value = event.target.value;
                        setNewTobacco((current) => ({
                          ...current,
                          grams: value === '' ? '' : Math.max(0, Number(value))
                        }));
                      }}
                      onBlur={() => setNewTobacco((current) => (
                        current.grams === '' ? { ...current, grams: 0 } : current
                      ))}
                    />
                  </label>

                  <label>
                    Перевод / вкус
                    <input
                      type="text"
                      placeholder="Например: манго, йогурт, специи"
                      value={newTobacco.taste}
                      onChange={(event) => setNewTobacco((current) => ({ ...current, taste: event.target.value }))}
                    />
                  </label>

                  <button className="primary-button" type="submit">
                    Добавить в таблицу
                  </button>
                </form>

                <div className="master-stat-grid" aria-label="Статистика табаков">
                  <div className="master-stat-card">
                    <span>Всего позиций</span>
                    <strong>{masterStats.total}</strong>
                  </div>
                  <div className="master-stat-card">
                    <span>В наличии</span>
                    <strong>{masterStats.available}</strong>
                  </div>
                  <div className="master-stat-card">
                    <span>Заканчивается</span>
                    <strong>{masterStats.low}</strong>
                  </div>
                  <div className="master-stat-card">
                    <span>Нет в наличии</span>
                    <strong>{masterStats.empty}</strong>
                  </div>
                  <div className="master-stat-card is-wide">
                    <span>Общий примерный вес</span>
                    <strong>примерно {masterStats.grams} г</strong>
                  </div>
                </div>

                <div className="master-tools">
                  <div className="master-filter-buttons" aria-label="Быстрые фильтры мастера">
                    {[
                      ['all', 'Все'],
                      ['available', 'В наличии'],
                      ['low', 'Заканчивается'],
                      ['empty', 'Нет в наличии']
                    ].map(([value, label]) => (
                      <button
                        className={masterStatusFilter === value ? 'is-active' : ''}
                        key={value}
                        type="button"
                        onClick={() => setMasterStatusFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <label className="master-problem-toggle">
                    <input
                      type="checkbox"
                      checked={masterOnlyProblems}
                      onChange={(event) => setMasterOnlyProblems(event.target.checked)}
                    />
                    Только проблемные
                  </label>
                </div>

                <label className="master-search-box">
                  <Search size={20} />
                  <input
                    type="search"
                    placeholder="Найти табак, вкус или бренд"
                    value={masterSearch}
                    onChange={(event) => setMasterSearch(event.target.value)}
                  />
                </label>

                <div className="master-inventory-list">
                  {masterGroupedTobaccos.map((group) => {
                    const brandSearch = masterBrandSearches[group.brand] || '';
                    const normalizedBrandSearch = brandSearch.toLowerCase().trim();
                    const brandItems = normalizedBrandSearch
                      ? group.items.filter((item) => item.name.toLowerCase().includes(normalizedBrandSearch))
                      : group.items;

                    return (
                      <section className="master-brand-group" key={group.brand}>
                        <div className="master-brand-heading">
                          <h3>{group.brand}</h3>
                          <span>
                            {normalizedBrandSearch ? `${brandItems.length} из ${group.items.length}` : group.items.length} поз.
                          </span>
                        </div>

                        <label className="master-brand-search">
                          <Search size={18} />
                          <input
                            type="search"
                            placeholder={`Найти табак ${group.brand}`}
                            value={brandSearch}
                            onChange={(event) => setMasterBrandSearches((current) => ({
                              ...current,
                              [group.brand]: event.target.value
                            }))}
                          />
                        </label>

                        <div className="master-row-list">
                          {brandItems.map((item) => {
                            const status = getMasterStockStatus(item);
                            return (
                              <article className={`master-inventory-row stock-${status.type}`} key={item.id}>
                              <div className="master-row-main">
                                <span className="master-row-status">{status.label}</span>
                                <strong>{item.name}</strong>
                                <small>{item.taste}</small>
                              </div>

                              <div className="master-row-controls">
                                <span className="inventory-amount-summary">
                                  <strong>{formatInventoryValue(getInventoryGrams(item))} г</strong>
                                  <small>{formatInventoryValue(item.quantity, 4)} ед.</small>
                                </span>
                                <label>
                                  Остаток, г
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.grams === '' ? '' : getInventoryGrams(item)}
                                    onFocus={() => clearZeroDraftGrams(item.id)}
                                    onChange={(event) => updateDraftGrams(item.id, event.target.value)}
                                    onBlur={() => commitDraftGrams(item.id)}
                                  />
                                </label>
                                <button
                                  className="ghost-button"
                                  disabled={savingIds.includes(item.id)}
                                  type="button"
                                  onClick={() => saveQuantityToSheet(item)}
                                >
                                  {savingIds.includes(item.id) ? 'Сохраняю' : 'Сохранить'}
                                </button>
                              </div>
                              </article>
                            );
                          })}

                          {brandItems.length === 0 && (
                            <div className="empty-state master-brand-empty">
                              В этом бренде ничего не найдено.
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>

                {masterFilteredTobaccos.length === 0 && (
                  <div className="empty-state">
                    По фильтрам мастера ничего не найдено.
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
