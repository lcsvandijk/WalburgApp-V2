import { MagisterAppointment } from '../types/magister';

const dayFormatter = new Intl.DateTimeFormat('nl-NL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const timeFormatter = new Intl.DateTimeFormat('nl-NL', {
  hour: '2-digit',
  minute: '2-digit',
});

const shortWeekdayFormatter = new Intl.DateTimeFormat('nl-NL', {
  weekday: 'short',
});

const shortDateFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
});

function capitalize(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getGreeting(date = new Date()) {
  const hour = date.getHours();

  if (hour < 12) {
    return 'Goedemorgen';
  }

  if (hour < 18) {
    return 'Goedemiddag';
  }

  return 'Goedenavond';
}

export function formatDayLabel(isoDate: string) {
  return capitalize(dayFormatter.format(new Date(isoDate)));
}

export function formatTime(isoDate: string) {
  return timeFormatter.format(new Date(isoDate));
}

export function formatApiDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function getScheduleRange(referenceDate = new Date()) {
  const from = startOfDay(referenceDate);
  const to = endOfDay(addDays(referenceDate, 6));

  return {
    from: formatApiDate(from),
    to: formatApiDate(to),
  };
}

export function isUpcomingAppointment(appointment: MagisterAppointment, referenceDate = new Date()) {
  return new Date(appointment.end).getTime() >= referenceDate.getTime();
}

export function isToday(isoDate: string, referenceDate = new Date()) {
  const date = new Date(isoDate);

  return (
    date.getFullYear() === referenceDate.getFullYear() &&
    date.getMonth() === referenceDate.getMonth() &&
    date.getDate() === referenceDate.getDate()
  );
}

export function isSameDay(left: Date | string, right: Date | string) {
  const leftDate = typeof left === 'string' ? new Date(left) : left;
  const rightDate = typeof right === 'string' ? new Date(right) : right;

  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}

export function formatShortWeekday(date: Date) {
  return capitalize(shortWeekdayFormatter.format(date).replace('.', ''));
}

export function formatShortDate(date: Date) {
  return shortDateFormatter.format(date);
}

export function formatDateRange(start: Date, end: Date) {
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

export function getWeekStart(referenceDate = new Date()) {
  const base = startOfDay(referenceDate);
  const day = base.getDay();
  const difference = day === 0 ? -6 : 1 - day;

  return addDays(base, difference);
}

export function getDefaultSchoolDate(referenceDate = new Date()) {
  const base = startOfDay(referenceDate);
  const day = base.getDay();

  if (day === 6) {
    return addDays(base, 2);
  }

  if (day === 0) {
    return addDays(base, 1);
  }

  return base;
}

export function getSchoolWeekDates(referenceDate = new Date()) {
  const weekStart = getWeekStart(referenceDate);

  return Array.from({ length: 5 }, (_, index) => addDays(weekStart, index));
}

export function getWeekNumber(date: Date) {
  const normalized = startOfDay(date);
  normalized.setDate(normalized.getDate() + 3 - ((normalized.getDay() + 6) % 7));

  const firstThursday = new Date(normalized.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));

  return 1 + Math.round((normalized.getTime() - firstThursday.getTime()) / 604_800_000);
}
