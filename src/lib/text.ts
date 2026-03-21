export function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    '&amp;': '&',
    '&apos;': "'",
    '&#039;': "'",
    '&quot;': '"',
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
    '&hellip;': '...',
    '&#8211;': '-',
    '&#8212;': '-',
    '&#8216;': "'",
    '&#8217;': "'",
    '&#8220;': '"',
    '&#8221;': '"',
    '&#038;': '&',
  };

  const withNamedEntities = Object.entries(namedEntities).reduce(
    (result, [entity, replacement]) => result.replaceAll(entity, replacement),
    value,
  );

  return withNamedEntities.replace(/&#(\d+);/g, (match, numeric) => {
    const codePoint = Number(numeric);

    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
  });
}

export function stripHtml(value: string) {
  return collapseWhitespace(
    decodeHtmlEntities(
      value
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/p>/gi, ' ')
        .replace(/<[^>]+>/g, ' '),
    ),
  );
}

export function extractParagraphs(value: string) {
  const matches = value.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) ?? [];
  const paragraphs = matches.map((paragraph) => stripHtml(paragraph)).filter(Boolean);

  return paragraphs.length > 0 ? paragraphs : [stripHtml(value)].filter(Boolean);
}

export function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

export function normalizeComparableText(value?: string | null) {
  return collapseWhitespace(stripHtml(value ?? '')).toLowerCase();
}
