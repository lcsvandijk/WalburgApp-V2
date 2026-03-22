import { appConfig } from '../constants/appConfig';
import { MagisterAppointment } from '../types/magister';
import { isSameDay } from './date';
import { normalizeComparableText, stripHtml } from './text';

function parseLessonHourNumbers(appointment: MagisterAppointment) {
  if (appointment.lessonHour != null) {
    const start = appointment.lessonHour;
    const end = appointment.lessonHourEnd ?? appointment.lessonHour;

    if (end >= start) {
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
  }

  if (!appointment.lessonHours) {
    return [];
  }

  return appointment.lessonHours
    .split(/[\/-]/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
}

function formatLessonHourNumbers(hours: number[]) {
  return hours.length > 0 ? hours.join('/') : null;
}

function isAssessmentAppointment(appointment: MagisterAppointment) {
  const title = normalizeComparableText(appointment.title);
  const subject = normalizeComparableText(appointment.subject);

  return (
    appointment.infoType === 2 ||
    /\b(pw|so|mo)\b/.test(title) ||
    /\b(pw|so|mo)\b/.test(subject) ||
    /\b(proefwerk|toets)\b/.test(title)
  );
}

function mergeDescription(left?: string, right?: string) {
  const leftText = stripHtml(left ?? '');
  const rightText = stripHtml(right ?? '');

  if (!leftText) {
    return rightText || undefined;
  }

  if (!rightText || leftText === rightText) {
    return leftText;
  }

  return leftText.length >= rightText.length ? leftText : rightText;
}

function isAdjacent(left: MagisterAppointment, right: MagisterAppointment) {
  return Math.abs(new Date(right.start).getTime() - new Date(left.end).getTime()) <= appConfig.schedule.mergeGapMs;
}

function hasConsecutiveLessonHours(left: MagisterAppointment, right: MagisterAppointment) {
  const leftHours = parseLessonHourNumbers(left);
  const rightHours = parseLessonHourNumbers(right);

  if (leftHours.length === 0 || rightHours.length === 0) {
    return true;
  }

  return rightHours[0] === leftHours[leftHours.length - 1] + 1;
}

function comparableKey(appointment: MagisterAppointment) {
  const comparableTitle = isAssessmentAppointment(appointment) ? appointment.title : appointment.subject;

  return [
    comparableTitle,
    appointment.subject,
    appointment.location,
    appointment.teachers,
    appointment.type != null ? String(appointment.type) : 'unknown',
    isAssessmentAppointment(appointment) ? 'assessment' : 'lesson',
    appointment.isCancelled ? 'cancelled' : 'active',
    appointment.isAllDay ? 'all-day' : 'timed',
  ]
    .map((value) => normalizeComparableText(value))
    .join('|');
}

function canCombineAppointments(left: MagisterAppointment, right: MagisterAppointment) {
  if (!isSameDay(left.start, right.start) || left.isAllDay || right.isAllDay) {
    return false;
  }

  if (comparableKey(left) !== comparableKey(right) || !isAdjacent(left, right) || !hasConsecutiveLessonHours(left, right)) {
    return false;
  }

  const leftDescription = normalizeComparableText(left.description);
  const rightDescription = normalizeComparableText(right.description);

  return !leftDescription || !rightDescription || leftDescription === rightDescription;
}

function mergeAppointments(left: MagisterAppointment, right: MagisterAppointment): MagisterAppointment {
  const mergedHours = Array.from(new Set([...parseLessonHourNumbers(left), ...parseLessonHourNumbers(right)])).sort(
    (first, second) => first - second,
  );
  const mergedInfoType =
    left.infoType === 2 || right.infoType === 2
      ? 2
      : left.infoType === 1 || right.infoType === 1
        ? 1
        : left.infoType ?? right.infoType ?? null;

  return {
    ...left,
    id: `${left.id}__${right.id}`,
    end: right.end,
    lessonHour: mergedHours[0] ?? left.lessonHour ?? right.lessonHour ?? null,
    lessonHourEnd:
      mergedHours[mergedHours.length - 1] ?? right.lessonHourEnd ?? left.lessonHourEnd ?? left.lessonHour ?? null,
    lessonHours: formatLessonHourNumbers(mergedHours) ?? left.lessonHours ?? right.lessonHours ?? null,
    description: mergeDescription(left.description, right.description),
    infoType: mergedInfoType,
    hasAttachments: Boolean(left.hasAttachments || right.hasAttachments),
    status: left.status ?? right.status ?? null,
    type: left.type ?? right.type ?? null,
    subtype: left.subtype ?? right.subtype ?? null,
  };
}

export function formatLessonHoursLabel(value?: string | null) {
  return value ? `Uur ${value.replace(/-/g, '/')}` : null;
}

export function combineAppointmentsForDisplay(appointments: MagisterAppointment[]) {
  const sortedAppointments = [...appointments].sort(
    (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime(),
  );

  return sortedAppointments.reduce<MagisterAppointment[]>((combined, appointment) => {
    const previous = combined[combined.length - 1];

    if (previous && canCombineAppointments(previous, appointment)) {
      combined[combined.length - 1] = mergeAppointments(previous, appointment);
      return combined;
    }

    combined.push({
      ...appointment,
      description: appointment.description ? stripHtml(appointment.description) : undefined,
      lessonHours: appointment.lessonHours ? appointment.lessonHours.replace(/-/g, '/') : appointment.lessonHours,
    });

    return combined;
  }, []);
}
