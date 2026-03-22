import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { formatDayLabel, formatTime } from '../lib/date';
import { formatDisplayLocation } from '../lib/location';
import { MagisterAppointment, MagisterGradeResult, MagisterMessageSummary } from '../types/magister';

const LESSON_REMINDER_CHANNEL_ID = 'lesson-reminders';
const APP_STATUS_CHANNEL_ID = 'app-status';
const LESSON_NOTIFICATION_SOURCE = 'lesson-reminder';
const APP_NOTIFICATION_SOURCE = 'app-update';

let notificationsInitialized = false;

function getAppointmentKey(appointment: MagisterAppointment) {
  return `${appointment.id}|${appointment.start}`;
}

function isNotifiableLesson(appointment: MagisterAppointment) {
  return (
    !appointment.isCancelled &&
    !appointment.isAllDay &&
    appointment.type !== 2 &&
    appointment.type !== 6 &&
    (appointment.subject !== 'Schoolafspraak' || appointment.title !== 'Schoolafspraak')
  );
}

function getLessonNotificationIdentifier(appointment: MagisterAppointment) {
  return `lesson:${appointment.id}:${new Date(appointment.start).getTime()}`;
}

function hasAppointmentChanged(previous: MagisterAppointment, next: MagisterAppointment) {
  return (
    previous.start !== next.start ||
    previous.end !== next.end ||
    previous.location !== next.location ||
    previous.teachers !== next.teachers ||
    previous.title !== next.title ||
    previous.subject !== next.subject ||
    previous.description !== next.description ||
    previous.isCancelled !== next.isCancelled ||
    previous.status !== next.status
  );
}

export async function initializeNotificationsAsync() {
  if (notificationsInitialized || Platform.OS === 'web') {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(LESSON_REMINDER_CHANNEL_ID, {
      name: 'Lesherinneringen',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#264D97',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync(APP_STATUS_CHANNEL_ID, {
      name: 'Appmeldingen',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200],
      lightColor: '#49C0E6',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  notificationsInitialized = true;
}

export async function ensureNotificationPermissionsAsync() {
  if (Platform.OS === 'web') {
    return false;
  }

  await initializeNotificationsAsync();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

export async function scheduleLessonReminderNotifications(
  appointments: MagisterAppointment[],
  enabled: boolean,
) {
  if (Platform.OS === 'web') {
    return;
  }

  await initializeNotificationsAsync();

  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  const lessonNotificationIds = scheduledNotifications
    .filter((request) => request.content.data?.source === LESSON_NOTIFICATION_SOURCE)
    .map((request) => request.identifier);

  await Promise.all(
    lessonNotificationIds.map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier)),
  );

  if (!enabled) {
    return;
  }

  const hasPermission = await ensureNotificationPermissionsAsync();

  if (!hasPermission) {
    return;
  }

  const now = Date.now();
  const nextWeekTime = now + 7 * 24 * 60 * 60 * 1000;
  const notifiableAppointments = appointments
    .filter(isNotifiableLesson)
    .filter((appointment) => {
      const reminderTimestamp = new Date(appointment.start).getTime() - 5 * 60 * 1000;
      return reminderTimestamp > now && reminderTimestamp <= nextWeekTime;
    })
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());

  await Promise.all(
    notifiableAppointments.map((appointment) =>
      Notifications.scheduleNotificationAsync({
        identifier: getLessonNotificationIdentifier(appointment),
        content: {
          title: 'Over 5 minuten begint je les',
          body: `${appointment.subject || appointment.title} • ${formatDisplayLocation(appointment.location) || 'Locatie volgt'}`,
          data: {
            appointmentId: appointment.id,
            source: LESSON_NOTIFICATION_SOURCE,
          },
          sound: 'default',
          subtitle: `${formatDayLabel(appointment.start)} • ${formatTime(appointment.start)}`,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          channelId: Platform.OS === 'android' ? LESSON_REMINDER_CHANNEL_ID : undefined,
          date: new Date(new Date(appointment.start).getTime() - 5 * 60 * 1000),
        },
      }),
    ),
  );
}

export async function notifyAboutNewGrades(
  previousGrades: MagisterGradeResult[],
  nextGrades: MagisterGradeResult[],
  enabled: boolean,
) {
  if (!enabled || Platform.OS === 'web' || previousGrades.length === 0) {
    return;
  }

  const previousGradeIds = new Set(previousGrades.map((grade) => grade.id));
  const newGrades = nextGrades.filter((grade) => !previousGradeIds.has(grade.id));

  if (newGrades.length === 0) {
    return;
  }

  const hasPermission = await ensureNotificationPermissionsAsync();

  if (!hasPermission) {
    return;
  }

  const latestGrade = newGrades[0];
  const extraCount = newGrades.length - 1;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Nieuw cijfer binnen',
      body:
        extraCount > 0
          ? `${latestGrade.subject} ${latestGrade.grade} en nog ${extraCount} nieuw${extraCount === 1 ? '' : 'e'} cijfer${extraCount === 1 ? '' : 's'}`
          : `${latestGrade.subject} • ${latestGrade.title} • ${latestGrade.grade}`,
      data: {
        gradeId: latestGrade.id,
        source: APP_NOTIFICATION_SOURCE,
      },
      sound: 'default',
      subtitle: 'Cijfers',
    },
    trigger: null,
  });
}

export async function notifyAboutScheduleUpdates(
  previousAppointments: MagisterAppointment[],
  nextAppointments: MagisterAppointment[],
  enabled: boolean,
) {
  if (!enabled || Platform.OS === 'web' || previousAppointments.length === 0) {
    return;
  }

  const previousByKey = new Map(previousAppointments.map((appointment) => [getAppointmentKey(appointment), appointment]));
  const changedAppointments = nextAppointments.filter((appointment) => {
    const previous = previousByKey.get(getAppointmentKey(appointment));

    if (!previous) {
      return true;
    }

    return hasAppointmentChanged(previous, appointment);
  });

  if (changedAppointments.length === 0) {
    return;
  }

  const hasPermission = await ensureNotificationPermissionsAsync();

  if (!hasPermission) {
    return;
  }

  const firstChange = changedAppointments[0];
  const extraCount = changedAppointments.length - 1;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Rooster bijgewerkt',
      body:
        extraCount > 0
          ? `${firstChange.subject || firstChange.title} aangepast en nog ${extraCount} wijziging${extraCount === 1 ? '' : 'en'}`
          : `${firstChange.subject || firstChange.title} • ${formatTime(firstChange.start)} • ${formatDisplayLocation(firstChange.location) || 'Locatie volgt'}`,
      data: {
        appointmentId: firstChange.id,
        appointmentStart: firstChange.start,
        source: APP_NOTIFICATION_SOURCE,
      },
      sound: 'default',
      subtitle: 'Rooster',
    },
    trigger: null,
  });
}

export async function notifyAboutNewMessages(
  previousMessages: MagisterMessageSummary[],
  nextMessages: MagisterMessageSummary[],
  enabled: boolean,
  priorityOnly = false,
) {
  if (!enabled || Platform.OS === 'web') {
    return;
  }

  const previousUnreadIds = new Set(previousMessages.filter((message) => !message.isRead).map((message) => message.id));
  const newUnreadMessages = nextMessages.filter(
    (message) =>
      !message.isRead &&
      !previousUnreadIds.has(message.id) &&
      (!priorityOnly || message.hasPriority),
  );

  if (newUnreadMessages.length === 0) {
    return;
  }

  const hasPermission = await ensureNotificationPermissionsAsync();

  if (!hasPermission) {
    return;
  }

  const latestMessage = newUnreadMessages[0];
  const extraCount = newUnreadMessages.length - 1;
  const senderName = latestMessage.sender?.name ?? 'Onbekende afzender';

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Nieuw bericht ontvangen',
      body:
        extraCount > 0
          ? `${latestMessage.subject} en nog ${extraCount} nieuw${extraCount === 1 ? '' : 'e'} bericht${extraCount === 1 ? '' : 'en'}`
          : `${senderName} | ${latestMessage.subject}`,
      data: {
        messageId: latestMessage.id,
        source: APP_NOTIFICATION_SOURCE,
      },
      sound: 'default',
      subtitle: 'Inbox',
    },
    trigger: null,
  });
}

export async function sendInstantAppNotification(input: {
  title: string;
  body: string;
  subtitle?: string;
  data?: Record<string, string>;
}) {
  if (Platform.OS === 'web') {
    return false;
  }

  const hasPermission = await ensureNotificationPermissionsAsync();

  if (!hasPermission) {
    return false;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      subtitle: input.subtitle,
      data: {
        source: APP_NOTIFICATION_SOURCE,
        ...(input.data ?? {}),
      },
      sound: 'default',
    },
    trigger: null,
  });

  return true;
}
