import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import { formatShortDate, formatShortWeekday, formatTime, getDefaultSchoolDate, isSameDay } from '../lib/date';
import { formatDisplayLocation } from '../lib/location';
import { SchoolAgendaItem } from '../types/content';
import { MagisterAppointment, MagisterGradeResult } from '../types/magister';
import type {
  AgendaWidgetProps,
  GradeWidgetProps,
  LessonAgendaWidgetProps,
  LessonGradeWidgetProps,
  LessonWidgetProps,
} from './walburgWidgetDefinitions';

type WalburgWidgetModule = typeof import('./walburgWidgetDefinitions');

type WidgetSyncPayload = {
  agendaItems: SchoolAgendaItem[];
  appointments: MagisterAppointment[];
  grades: MagisterGradeResult[];
  isDemoMode: boolean;
};

let widgetModulePromise: Promise<WalburgWidgetModule | null> | null = null;

function isRealLesson(appointment: MagisterAppointment) {
  return (
    !appointment.isCancelled &&
    !appointment.isAllDay &&
    appointment.type !== 2 &&
    appointment.type !== 6 &&
    (appointment.subject !== 'Schoolafspraak' || appointment.title !== 'Schoolafspraak')
  );
}

function getWidgetLesson(appointments: MagisterAppointment[], isDemoMode: boolean, referenceDate = new Date()) {
  const sortedAppointments = [...appointments]
    .filter(isRealLesson)
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());

  if (sortedAppointments.length === 0) {
    return null;
  }

  if (isDemoMode) {
    const demoSchoolDate = getDefaultSchoolDate(referenceDate);
    return sortedAppointments.find((appointment) => isSameDay(appointment.start, demoSchoolDate)) ?? sortedAppointments[0];
  }

  return (
    sortedAppointments.find((appointment) => new Date(appointment.end).getTime() >= referenceDate.getTime()) ??
    sortedAppointments[0]
  );
}

function getWidgetAgendaItem(agendaItems: SchoolAgendaItem[], isDemoMode: boolean, referenceDate = new Date()) {
  const baseDate = isDemoMode ? getDefaultSchoolDate(referenceDate) : referenceDate;
  const todaysItems = [...agendaItems]
    .filter((item) => isSameDay(item.start, baseDate))
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());

  if (todaysItems.length === 0) {
    return null;
  }

  if (isDemoMode) {
    return todaysItems[0];
  }

  return todaysItems.find((item) => new Date(item.end).getTime() >= referenceDate.getTime()) ?? todaysItems[0];
}

function getLatestGrade(grades: MagisterGradeResult[]) {
  return [...grades].sort((left, right) => {
    const leftTime = left.enteredAt ? new Date(left.enteredAt).getTime() : 0;
    const rightTime = right.enteredAt ? new Date(right.enteredAt).getTime() : 0;

    return rightTime - leftTime;
  })[0] ?? null;
}

function buildLessonWidgetProps(lesson: MagisterAppointment | null): LessonWidgetProps {
  if (!lesson) {
    return {
      heading: 'Eerstvolgende les',
      title: 'Geen les gevonden',
      time: 'Open de app',
      meta: 'Walburg College',
      footer: 'Synchroniseer je rooster om deze widget te vullen.',
    };
  }

  const date = new Date(lesson.start);
  const location = formatDisplayLocation(lesson.location);

  return {
    heading: 'Eerstvolgende les',
    title: lesson.subject || lesson.title,
    time: `${formatTime(lesson.start)} - ${formatTime(lesson.end)}`,
    meta: `${formatShortWeekday(date)} ${formatShortDate(date)}`,
    footer: location || lesson.title || lesson.teachers || 'Walburg College',
  };
}

function buildAgendaWidgetProps(item: SchoolAgendaItem | null): AgendaWidgetProps {
  if (!item) {
    return {
      heading: 'Schoolagenda',
      title: 'Vandaag niets gepland',
      time: 'Hele dag rustig',
      meta: 'Walburg College',
      footer: 'Nieuwe agenda-items verschijnen hier zodra ze beschikbaar zijn.',
    };
  }

  const date = new Date(item.start);

  return {
    heading: 'Schoolagenda',
    title: item.title,
    time: item.isAllDay ? 'Hele dag' : `${formatTime(item.start)} - ${formatTime(item.end)}`,
    meta: `${formatShortWeekday(date)} ${formatShortDate(date)}`,
    footer: item.description ?? 'Bekijk meer details in de app.',
  };
}

function buildGradeWidgetProps(grade: MagisterGradeResult | null): GradeWidgetProps {
  if (!grade) {
    return {
      heading: 'Laatste cijfer',
      subject: 'Nog geen cijfers',
      title: 'Open de app',
      grade: '-',
      footer: 'Zodra er een cijfer binnenkomt zie je het hier.',
    };
  }

  return {
    heading: 'Laatste cijfer',
    subject: grade.subject,
    title: grade.title,
    grade: grade.grade,
    footer: grade.enteredAt
      ? `${formatShortWeekday(new Date(grade.enteredAt))} ${formatShortDate(new Date(grade.enteredAt))}`
      : 'Recent toegevoegd',
  };
}

function buildLessonAgendaWidgetProps(
  lessonProps: LessonWidgetProps,
  agendaProps: AgendaWidgetProps,
): LessonAgendaWidgetProps {
  return {
    lessonHeading: lessonProps.heading,
    lessonTitle: lessonProps.title,
    lessonTime: lessonProps.time,
    lessonMeta: lessonProps.footer,
    agendaHeading: agendaProps.heading,
    agendaTitle: agendaProps.title,
    agendaTime: agendaProps.time,
    agendaMeta: agendaProps.footer,
  };
}

function buildLessonGradeWidgetProps(
  lessonProps: LessonWidgetProps,
  gradeProps: GradeWidgetProps,
): LessonGradeWidgetProps {
  return {
    lessonHeading: lessonProps.heading,
    lessonTitle: lessonProps.title,
    lessonTime: lessonProps.time,
    lessonMeta: lessonProps.footer,
    gradeHeading: gradeProps.heading,
    gradeSubject: gradeProps.subject,
    gradeTitle: gradeProps.title,
    gradeValue: gradeProps.grade,
  };
}

async function loadWidgetModule() {
  if (Platform.OS !== 'ios' || isRunningInExpoGo()) {
    return null;
  }

  if (!widgetModulePromise) {
    widgetModulePromise = import('./walburgWidgetDefinitions')
      .then((module) => module)
      .catch(() => null);
  }

  return widgetModulePromise;
}

export async function syncWalburgWidgets({
  agendaItems,
  appointments,
  grades,
  isDemoMode,
}: WidgetSyncPayload) {
  const widgetModule = await loadWidgetModule();

  if (!widgetModule) {
    return;
  }

  const nextLesson = getWidgetLesson(appointments, isDemoMode);
  const todayAgenda = getWidgetAgendaItem(agendaItems, isDemoMode);
  const latestGrade = getLatestGrade(grades);

  const lessonProps = buildLessonWidgetProps(nextLesson);
  const agendaProps = buildAgendaWidgetProps(todayAgenda);
  const gradeProps = buildGradeWidgetProps(latestGrade);

  widgetModule.nextLessonSmallWidget.updateSnapshot(lessonProps);
  widgetModule.todayAgendaSmallWidget.updateSnapshot(agendaProps);
  widgetModule.latestGradeSmallWidget.updateSnapshot(gradeProps);
  widgetModule.nextLessonAgendaMediumWidget.updateSnapshot(buildLessonAgendaWidgetProps(lessonProps, agendaProps));
  widgetModule.nextLessonGradeMediumWidget.updateSnapshot(
    buildLessonGradeWidgetProps(lessonProps, gradeProps),
  );
}
