import { SchoolAgendaItem } from '../types/content';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toGoogleDateTime(isoDate: string) {
  const date = new Date(isoDate);

  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(
    date.getUTCHours(),
  )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function toGoogleAllDayDate(isoDate: string) {
  const date = new Date(isoDate);

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export function buildCalendarAddUrl(item: SchoolAgendaItem) {
  const start = item.isAllDay ? toGoogleAllDayDate(item.start) : toGoogleDateTime(item.start);
  const end = item.isAllDay ? toGoogleAllDayDate(item.end) : toGoogleDateTime(item.end);
  const url = new URL('https://calendar.google.com/calendar/render');

  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', item.title);
  url.searchParams.set('details', item.url ? `Meer info: ${item.url}` : 'Schoolagenda-item van Walburg College');
  url.searchParams.set('dates', `${start}/${end}`);

  return url.toString();
}
