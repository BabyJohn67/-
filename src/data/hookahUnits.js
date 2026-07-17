export const hookahUnits = [
  {
    id: '1',
    title: 'Кальян №1',
    typeLabel: 'Обычный',
    allowedFormatIds: ['classic', 'fruit'],
    lockedFormatId: null
  },
  {
    id: '2',
    title: 'Кальян №2',
    typeLabel: 'Обычный',
    allowedFormatIds: ['classic', 'fruit'],
    lockedFormatId: null
  },
  {
    id: '3',
    title: 'Кальян №3',
    typeLabel: 'Обычный',
    allowedFormatIds: ['classic', 'fruit'],
    lockedFormatId: null
  },
  {
    id: '4',
    title: 'Кальян №4',
    typeLabel: 'Обычный',
    allowedFormatIds: ['classic', 'fruit'],
    lockedFormatId: null
  },
  {
    id: '5',
    title: 'Кальян №5',
    typeLabel: 'Обычный',
    allowedFormatIds: ['classic', 'fruit'],
    lockedFormatId: null
  },
  {
    id: '6',
    title: 'Кальян №6',
    typeLabel: 'Обычный',
    allowedFormatIds: ['classic', 'fruit'],
    lockedFormatId: null
  },
  {
    id: '7',
    title: 'Кальян №7',
    typeLabel: 'Авторский',
    allowedFormatIds: ['signature'],
    lockedFormatId: 'signature'
  },
  {
    id: '8',
    title: 'Кальян №8',
    typeLabel: 'Авторский',
    allowedFormatIds: ['signature'],
    lockedFormatId: 'signature'
  },
  {
    id: '9',
    title: 'Кальян №9',
    typeLabel: 'Авторский',
    allowedFormatIds: ['signature'],
    lockedFormatId: 'signature'
  },
  {
    id: '10',
    title: 'Кальян №10',
    typeLabel: 'Авторский',
    allowedFormatIds: ['signature'],
    lockedFormatId: 'signature'
  }
];

export function isKnownHookahId(hookahId) {
  return hookahUnits.some((unit) => unit.id === String(hookahId));
}
