export function normalizeRoomReference(value?: string | null) {
  if (!value) {
    return '';
  }

  return value.replace(/\blokaal\s*([0-9]+[a-z0-9]*)\b/gi, (_, roomNumber: string) => {
    return `b${roomNumber.toUpperCase()}`;
  });
}

export function normalizeLocationToken(value: string) {
  return normalizeRoomReference(value)
    .normalize('NFKD')
    .replace(/[^\w\s./-]/g, '')
    .replace(/[\s._/-]+/g, '')
    .toUpperCase()
    .trim();
}

export function formatDisplayLocation(value?: string | null) {
  return normalizeRoomReference(value).trim();
}
