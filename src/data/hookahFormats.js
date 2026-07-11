import classicHookahImage from '../assets/hookahs/classic-hookah.png';

export const hookahFormats = [
  {
    id: 'classic',
    title: 'Обычный кальян',
    description: 'Универсальная подача на чаше для любого вкуса.',
    variants: [
      {
        id: 'classic-bowl',
        title: 'Авторский',
        description: 'Сбалансированная забивка от мастера на классической чаше.',
        priceLabel: '3 500 ₽',
        image: classicHookahImage
      }
    ]
  },
  {
    id: 'fruit',
    title: 'Кальяны на фрукте',
    description: 'Сочная подача на фрукте с более ярким вкусом.',
    variants: [
      {
        id: 'fruit-mix',
        title: 'На грейпфруте',
        description: 'Свежая цитрусовая подача на грейпфруте.',
        priceLabel: '4 000 ₽',
        image: null
      },
      {
        id: 'citrus-fruit',
        title: 'На гранате',
        description: 'Насыщенная подача на гранате с выразительным вкусом.',
        priceLabel: '4 200 ₽',
        image: null
      },
      {
        id: 'premium-fruit',
        title: 'На ананасе',
        description: 'Эффектная подача на ананасе для яркого вечера.',
        priceLabel: '4 500 ₽',
        image: null
      }
    ]
  },
  {
    id: 'signature',
    title: 'Особые авторские кальяны',
    description: 'Премиальные авторские подачи с необычной идеей и оформлением.',
    variants: [
      {
        id: 'signature-light',
        title: 'Азия',
        description: 'Особая авторская подача в восточном стиле.',
        priceLabel: '6 000 ₽',
        image: null
      },
      {
        id: 'signature-show',
        title: 'Охотник',
        description: 'Брутальная авторская подача с характером.',
        priceLabel: '5 500 ₽',
        image: null
      },
      {
        id: 'signature-premium',
        title: 'Изнанка',
        description: 'Максимально эффектная подача для особого впечатления.',
        priceLabel: '10 000 ₽',
        image: null
      }
    ]
  }
];
