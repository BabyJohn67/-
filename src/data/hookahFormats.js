import classicHookahImage from '../assets/hookahs/classic-hookah.png';
import fruitGrapefruitImage from '../assets/hookah-formats/fruit-grapefruit.png';
import fruitPineappleImage from '../assets/hookah-formats/fruit-pineapple.png';
import fruitPomegranateImage from '../assets/hookah-formats/fruit-pomegranate.png';
import signatureAsiaImage from '../assets/hookah-formats/signature-asia.png';
import signatureIznankaImage from '../assets/hookah-formats/signature-iznanka.png';
import signatureOhotnikImage from '../assets/hookah-formats/signature-ohotnik.png';

export const hookahFormats = [
  {
    id: 'classic',
    title: 'Классический кальян',
    description: 'Классика, которая не стареет.',
    variants: [
      {
        id: 'classic-bowl',
        title: 'Классический',
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
        description: 'Освежающая мякоть с яркими нотами цитруса.',
        priceLabel: '4 000 ₽',
        image: fruitGrapefruitImage
      },
      {
        id: 'citrus-fruit',
        title: 'На гранате',
        description: 'Кисло-сладкий вкус граната с благородной терпкостью.',
        priceLabel: '4 200 ₽',
        image: fruitPomegranateImage
      },
      {
        id: 'premium-fruit',
        title: 'На ананасе',
        description: 'Эффектная подача на ананасе для яркого вечера.',
        priceLabel: '4 500 ₽',
        image: fruitPineappleImage
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
        image: signatureAsiaImage
      },
      {
        id: 'signature-show',
        title: 'Охотник',
        description: 'Брутальная авторская подача с характером.',
        priceLabel: '5 500 ₽',
        image: signatureOhotnikImage
      },
      {
        id: 'signature-premium',
        title: 'Изнанка',
        description: 'Максимально эффектная подача для особого впечатления.',
        priceLabel: '10 000 ₽',
        image: signatureIznankaImage
      }
    ]
  }
];
