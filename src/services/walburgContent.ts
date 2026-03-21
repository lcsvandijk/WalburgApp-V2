import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

import { appConfig } from '../constants/appConfig';
import { collapseWhitespace, extractParagraphs, stripHtml, truncate } from '../lib/text';
import { SchoolAgendaItem, SchoolNewsArticle, SchoolNewsItem } from '../types/content';

const ICS_ASSET = require('../../assets/icsi.ics');
const NEWS_ENDPOINT = 'https://walburgcollege.nl/wp-json/wp/v2/nieuws';

interface WalburgNewsResponseItem {
  id: number;
  link: string;
  date: string;
  title?: {
    rendered?: string;
  };
  content?: {
    rendered?: string;
  };
  _embedded?: {
    'wp:featuredmedia'?: Array<{
      source_url?: string;
      media_details?: {
        sizes?: Record<
          string,
          {
            source_url?: string;
          }
        >;
      };
    }>;
  };
}

function unfoldIcsLines(source: string) {
  return source.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function unescapeIcsValue(value: string) {
  return value.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseIcsDate(value: string, isDateOnly: boolean) {
  if (isDateOnly) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));

    return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
  }

  const normalized = value.endsWith('Z') ? value.slice(0, -1) : value;
  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(4, 6));
  const day = Number(normalized.slice(6, 8));
  const hour = Number(normalized.slice(9, 11));
  const minute = Number(normalized.slice(11, 13));
  const second = Number(normalized.slice(13, 15) || '0');

  if (value.endsWith('Z')) {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();
  }

  return new Date(year, month - 1, day, hour, minute, second, 0).toISOString();
}

function getPreferredImage(item: WalburgNewsResponseItem) {
  const featuredMedia = item._embedded?.['wp:featuredmedia']?.[0];

  return (
    featuredMedia?.media_details?.sizes?.medium_large?.source_url ??
    featuredMedia?.media_details?.sizes?.large?.source_url ??
    featuredMedia?.source_url
  );
}

function normalizeNewsItem(item: WalburgNewsResponseItem): SchoolNewsItem {
  const title = stripHtml(item.title?.rendered ?? 'Nieuws');
  const summarySource = stripHtml(item.content?.rendered ?? '');

  return {
    id: String(item.id),
    title,
    summary: truncate(summarySource || `Lees meer op ${appConfig.school.website.replace('https://', '')}.`, appConfig.ui.newsSummaryLength),
    link: item.link,
    imageUrl: getPreferredImage(item),
    publishedAt: item.date,
  };
}

async function loadBundledIcsText() {
  const asset = Asset.fromModule(ICS_ASSET);

  if (!asset.localUri) {
    await asset.downloadAsync();
  }

  const assetUri = asset.localUri ?? asset.uri;

  if (!assetUri) {
    throw new Error('Kon de lokale schoolagenda niet laden.');
  }

  return FileSystem.readAsStringAsync(assetUri);
}

export async function loadSchoolAgenda(): Promise<SchoolAgendaItem[]> {
  const source = unfoldIcsLines(await loadBundledIcsText());
  const events = source.split('BEGIN:VEVENT').slice(1);

  return events
    .map((chunk) => {
      const lines = chunk
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const event: Partial<SchoolAgendaItem> & { uid?: string } = {};

      for (const line of lines) {
        if (line === 'END:VEVENT') {
          break;
        }

        const separatorIndex = line.indexOf(':');

        if (separatorIndex < 0) {
          continue;
        }

        const rawKey = line.slice(0, separatorIndex);
        const rawValue = line.slice(separatorIndex + 1);
        const propertyName = rawKey.split(';')[0]?.toUpperCase();
        const isDateOnly = rawKey.includes('VALUE=DATE');

        if (propertyName === 'UID') {
          event.uid = unescapeIcsValue(rawValue);
        }

        if (propertyName === 'SUMMARY') {
          event.title = collapseWhitespace(unescapeIcsValue(rawValue));
        }

        if (propertyName === 'DESCRIPTION') {
          const description = collapseWhitespace(unescapeIcsValue(rawValue));
          event.description = description || undefined;
        }

        if (propertyName === 'URL') {
          event.url = rawValue.trim();
        }

        if (propertyName === 'DTSTART') {
          event.start = parseIcsDate(rawValue, isDateOnly);
          event.isAllDay = isDateOnly;
        }

        if (propertyName === 'DTEND') {
          event.end = parseIcsDate(rawValue, isDateOnly);
        }
      }

      return {
        id: event.uid ?? `${event.start}-${event.title}`,
        title: event.title ?? 'Schoolagenda',
        start: event.start ?? '',
        end: event.end ?? event.start ?? '',
        isAllDay: event.isAllDay ?? false,
        description: event.description,
        url: event.url,
      } satisfies SchoolAgendaItem;
    })
    .filter((event) => Boolean(event.start && event.end && event.title))
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
}

export async function loadSchoolNews(): Promise<SchoolNewsItem[]> {
  const response = await fetch(`${NEWS_ENDPOINT}?per_page=6&_embed=1`);

  if (!response.ok) {
    throw new Error(`Nieuws ophalen mislukte met status ${response.status}.`);
  }

  const payload = (await response.json()) as WalburgNewsResponseItem[];

  return payload.map(normalizeNewsItem);
}

export async function loadSchoolNewsArticle(id: string): Promise<SchoolNewsArticle> {
  const response = await fetch(`${NEWS_ENDPOINT}/${id}?_embed=1`);

  if (!response.ok) {
    throw new Error(`Nieuwsartikel ophalen mislukte met status ${response.status}.`);
  }

  const payload = (await response.json()) as WalburgNewsResponseItem;
  const baseItem = normalizeNewsItem(payload);

  return {
    ...baseItem,
    body: extractParagraphs(payload.content?.rendered ?? ''),
  };
}
