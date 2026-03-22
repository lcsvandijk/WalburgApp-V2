import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';

import {
  getDemoAppointments,
  getDemoGrades,
  getDemoSession,
  getDemoSubjectAverages,
} from '../data/demoContent';
import { getScheduleRange } from '../lib/date';
import { loadDemoSchoolAgenda } from '../services/demoContent';
import {
  ensureNotificationPermissionsAsync,
  initializeNotificationsAsync,
  notifyAboutNewGrades,
  notifyAboutNewMessages,
  notifyAboutScheduleUpdates,
  scheduleLessonReminderNotifications,
} from '../services/notifications';
import { extractAttendanceStudentId, loginWithMagisterOAuth, refreshMagisterAccessToken } from '../services/magisterAuth';
import {
  calculateSubjectAveragesFromGrades,
  fetchAccountFromTokens,
  fetchInboxMessagesFromTokens,
  fetchLatestGradesFromTokens,
  updateAppointmentCompletionFromTokens,
  fetchScheduleFromTokens,
  fetchScheduleChangesFromTokens,
  normalizeAppointments,
  toProfile,
} from '../services/magister';
import {
  clearStoredMagisterCache,
  clearStoredSession,
  loadPreferences,
  loadStoredMagisterCache,
  loadStoredSession,
  savePreferences,
  saveStoredMagisterCache,
  saveStoredSession,
} from '../services/storage';
import { loadSchoolAgenda } from '../services/walburgContent';
import { AppPreferences } from '../types/content';
import {
  MagisterAppointment,
  MagisterGradeResult,
  MagisterMessageSummary,
  MagisterSubjectAverage,
  StoredMagisterCache,
  StoredSession,
} from '../types/magister';
import { syncWalburgWidgets } from '../widgets/syncWalburgWidgets';

type ManualTokenValues = {
  accessToken: string;
  xsrfToken?: string;
  personId?: number;
};

interface WalburgAppContextValue {
  appointments: MagisterAppointment[];
  grades: MagisterGradeResult[];
  inboxPreview: MagisterMessageSummary[];
  subjectAverages: MagisterSubjectAverage[];
  preferences: AppPreferences;
  isDemoMode: boolean;
  isBusy: boolean;
  isHydrating: boolean;
  unreadInboxCount: number;
  session: StoredSession | null;
  errorMessage: string | null;
  clearError: () => void;
  loginWithMagister: (usernameHint?: string) => Promise<void>;
  connectWithManualTokens: (values: ManualTokenValues) => Promise<void>;
  logout: () => Promise<void>;
  refreshAppData: () => Promise<void>;
  refreshInbox: () => Promise<void>;
  refreshSchedule: () => Promise<void>;
  ensureScheduleRangeLoaded: (from: string, to: string) => Promise<void>;
  updatePreferences: (
    value: Partial<AppPreferences> | ((current: AppPreferences) => AppPreferences),
  ) => Promise<void>;
  toggleAgendaReminder: (eventId: string) => Promise<void>;
  markMessageReadLocally: (messageId: number) => void;
  setAppointmentCompletion: (appointmentId: string, completed: boolean) => Promise<MagisterAppointment | null>;
}

const WalburgAppContext = createContext<WalburgAppContextValue | null>(null);
const MAGISTER_REFRESH_WINDOW_MS = 120_000;
const MAIL_POLL_INTERVAL_MS = 30_000;

type CacheMeta = {
  personId: number;
  cachedAt: string;
  scheduleFrom?: string;
  scheduleTo?: string;
};

function mergeAppointments(current: MagisterAppointment[], incoming: MagisterAppointment[]) {
  const next = new Map<string, MagisterAppointment>();

  [...current, ...incoming].forEach((appointment) => {
    next.set(`${appointment.id}|${appointment.start}`, appointment);
  });

  return Array.from(next.values()).sort(
    (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime(),
  );
}

function countUnreadMessages(messages: MagisterMessageSummary[]) {
  return messages.filter((message) => !message.isRead).length;
}

function haveMessagesChanged(previousMessages: MagisterMessageSummary[], nextMessages: MagisterMessageSummary[]) {
  if (previousMessages.length !== nextMessages.length) {
    return true;
  }

  return previousMessages.some((message, index) => {
    const nextMessage = nextMessages[index];

    return (
      !nextMessage ||
      message.id !== nextMessage.id ||
      message.isRead !== nextMessage.isRead ||
      message.sentAt !== nextMessage.sentAt
    );
  });
}

export function WalburgAppProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [appointments, setAppointments] = useState<MagisterAppointment[]>([]);
  const [grades, setGrades] = useState<MagisterGradeResult[]>([]);
  const [inboxPreview, setInboxPreview] = useState<MagisterMessageSummary[]>([]);
  const [subjectAverages, setSubjectAverages] = useState<MagisterSubjectAverage[]>([]);
  const [preferences, setPreferences] = useState<AppPreferences>({
    mailNotificationsEnabled: true,
    priorityMailOnlyNotifications: false,
    agendaAutoAddEnabled: false,
    agendaReminders: false,
    demoModeEnabled: false,
    gradeNotifications: true,
    lessonRemindersEnabled: false,
    onboardingCompleted: false,
    roundAveragesToWholeNumbers: false,
    savedReminderEventIds: [],
    scheduleChangeNotifications: true,
  });
  const [isHydrating, setIsHydrating] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cacheMeta, setCacheMeta] = useState<CacheMeta | null>(null);
  const shouldBootstrapSyncRef = useRef(false);
  const appointmentsRef = useRef<MagisterAppointment[]>([]);
  const gradesRef = useRef<MagisterGradeResult[]>([]);
  const inboxPreviewRef = useRef<MagisterMessageSummary[]>([]);
  const subjectAveragesRef = useRef<MagisterSubjectAverage[]>([]);

  useEffect(() => {
    appointmentsRef.current = appointments;
  }, [appointments]);

  useEffect(() => {
    gradesRef.current = grades;
  }, [grades]);

  useEffect(() => {
    inboxPreviewRef.current = inboxPreview;
  }, [inboxPreview]);

  useEffect(() => {
    subjectAveragesRef.current = subjectAverages;
  }, [subjectAverages]);

  const persistMagisterCache = useCallback(async (payload: StoredMagisterCache) => {
    setCacheMeta({
      personId: payload.personId,
      cachedAt: payload.cachedAt,
      scheduleFrom: payload.scheduleFrom,
      scheduleTo: payload.scheduleTo,
    });
    await saveStoredMagisterCache(payload);
  }, []);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      try {
        const [storedSession, storedPreferences, storedCache] = await Promise.all([
          loadStoredSession(),
          loadPreferences(),
          loadStoredMagisterCache(),
        ]);

        if (!active) {
          return;
        }

        const hydratedSession =
          storedSession && !storedSession.attendanceStudentId && storedSession.accessToken
            ? {
                ...storedSession,
                attendanceStudentId: extractAttendanceStudentId({
                  accessToken: storedSession.accessToken,
                  idToken: storedSession.idToken,
                }),
              }
            : storedSession;

        setSession(hydratedSession);
        setPreferences(storedPreferences);
        if (
          hydratedSession &&
          storedCache &&
          storedCache.personId === (hydratedSession.personId ?? hydratedSession.id)
        ) {
          setAppointments(storedCache.appointments);
          setGrades(storedCache.grades);
          setInboxPreview(storedCache.inboxPreview ?? []);
          setSubjectAverages(storedCache.subjectAverages);
          setCacheMeta({
            personId: storedCache.personId,
            cachedAt: storedCache.cachedAt,
            scheduleFrom: storedCache.scheduleFrom,
            scheduleTo: storedCache.scheduleTo,
          });
        }

        const hasFreshCache =
          hydratedSession &&
          storedCache &&
          storedCache.personId === (hydratedSession.personId ?? hydratedSession.id) &&
          Date.now() - new Date(storedCache.cachedAt).getTime() < MAGISTER_REFRESH_WINDOW_MS;

        shouldBootstrapSyncRef.current = Boolean(
          hydratedSession?.hasApiAccess &&
          hydratedSession.accessToken &&
          !hasFreshCache,
        );

        if (hydratedSession && hydratedSession !== storedSession) {
          await saveStoredSession(hydratedSession);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Opslaan van de sessie mislukte.');
        }
      } finally {
        if (active) {
          setIsHydrating(false);
        }
      }
    }

    hydrate();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session?.hasApiAccess || !session.accessToken || isHydrating || !shouldBootstrapSyncRef.current) {
      return;
    }

    shouldBootstrapSyncRef.current = false;

    refreshAppData().catch(() => {
      return;
    });
  }, [isHydrating, session?.accessToken, session?.hasApiAccess]);

  const isDemoMode = preferences.demoModeEnabled;
  const demoSession = getDemoSession();
  const effectiveSession = isDemoMode ? demoSession : session;
  const effectiveAppointments = isDemoMode ? getDemoAppointments() : appointments;
  const effectiveGrades = isDemoMode ? getDemoGrades() : grades;
  const effectiveInboxPreview = isDemoMode ? [] : inboxPreview;
  const effectiveSubjectAverages = isDemoMode ? getDemoSubjectAverages() : subjectAverages;

  useEffect(() => {
    initializeNotificationsAsync().catch(() => {
      return;
    });
  }, []);

  useEffect(() => {
    if (isHydrating) {
      return;
    }

    if (
      !preferences.gradeNotifications &&
      !preferences.mailNotificationsEnabled &&
      !preferences.scheduleChangeNotifications &&
      !preferences.lessonRemindersEnabled
    ) {
      return;
    }

    ensureNotificationPermissionsAsync().catch(() => {
      return;
    });
  }, [
    isHydrating,
    preferences.gradeNotifications,
    preferences.lessonRemindersEnabled,
    preferences.mailNotificationsEnabled,
    preferences.scheduleChangeNotifications,
  ]);

  useEffect(() => {
    if (isHydrating) {
      return;
    }

    let active = true;

    async function syncWidgets() {
      try {
        const agendaItems = await (isDemoMode ? loadDemoSchoolAgenda() : loadSchoolAgenda());

        if (!active) {
          return;
        }

        await syncWalburgWidgets({
          agendaItems,
          appointments: effectiveAppointments,
          grades: effectiveGrades,
          isDemoMode,
        });
      } catch {
        // Widgets blijven optioneel: de app zelf hoeft hier niet op te stranden.
      }
    }

    syncWidgets().catch(() => {
      return;
    });

    return () => {
      active = false;
    };
  }, [effectiveAppointments, effectiveGrades, isDemoMode, isHydrating]);

  useEffect(() => {
    if (isHydrating) {
      return;
    }

    scheduleLessonReminderNotifications(
      effectiveAppointments,
      preferences.lessonRemindersEnabled && !isDemoMode,
    ).catch(() => {
      return;
    });
  }, [effectiveAppointments, isDemoMode, isHydrating, preferences.lessonRemindersEnabled]);

  const ensureFreshSession = useCallback(async (activeSession: StoredSession) => {
    if (
      activeSession.authMode !== 'oauth' ||
      !activeSession.refreshToken ||
      !activeSession.tokenExpiresAt ||
      Date.now() < activeSession.tokenExpiresAt - 60_000
    ) {
      return activeSession;
    }

    const refreshedTokenSet = await refreshMagisterAccessToken(activeSession.refreshToken);
    const nextSession: StoredSession = {
      ...activeSession,
      ...refreshedTokenSet,
      attendanceStudentId: extractAttendanceStudentId(refreshedTokenSet) ?? activeSession.attendanceStudentId,
      idToken: refreshedTokenSet.idToken ?? activeSession.idToken,
    };

    setSession(nextSession);
    await saveStoredSession(nextSession);

    return nextSession;
  }, []);

  const loadScheduleForSession = useCallback(async (activeSession: StoredSession, from: string, to: string, merge = false) => {
    const refreshedSession = await ensureFreshSession(activeSession);
    const personId = refreshedSession.personId ?? refreshedSession.id;
    const [schedule, scheduleChanges] = await Promise.all([
      fetchScheduleFromTokens(
        refreshedSession,
        personId,
        from,
        to,
      ),
      fetchScheduleChangesFromTokens(
        refreshedSession,
        personId,
        from,
        to,
      ).catch(() => null),
    ]);
    const normalizedSchedule = normalizeAppointments(schedule, scheduleChanges);

    setAppointments((current) => (merge ? mergeAppointments(current, normalizedSchedule) : normalizedSchedule));

    return {
      refreshedSession,
      appointments: normalizedSchedule,
    };
  }, [ensureFreshSession]);

  const loadGradesForSession = useCallback(async (activeSession: StoredSession) => {
    const refreshedSession = await ensureFreshSession(activeSession);
    const personId = refreshedSession.personId ?? refreshedSession.id;
    const latestGrades = await fetchLatestGradesFromTokens(refreshedSession, personId).catch(() => []);
    const averages = calculateSubjectAveragesFromGrades(latestGrades);

    setGrades(latestGrades);
    setSubjectAverages(averages);

    return {
      refreshedSession,
      grades: latestGrades,
      subjectAverages: averages,
    };
  }, [ensureFreshSession]);

  const loadInboxForSession = useCallback(async (activeSession: StoredSession) => {
    const refreshedSession = await ensureFreshSession(activeSession);
    const messages = await fetchInboxMessagesFromTokens(refreshedSession, { top: 50, skip: 0 }).catch(() => []);

    setInboxPreview(messages);

    return {
      inboxPreview: messages,
      refreshedSession,
    };
  }, [ensureFreshSession]);

  const persistRefreshedSession = useCallback(async (activeSession: StoredSession) => {
    const nextSession = {
      ...activeSession,
      lastSyncedAt: new Date().toISOString(),
    };

    setSession(nextSession);
    await saveStoredSession(nextSession);

    return nextSession;
  }, []);

  useEffect(() => {
    if (
      isHydrating ||
      preferences.demoModeEnabled ||
      !preferences.mailNotificationsEnabled ||
      !session?.accessToken
    ) {
      return;
    }

    let active = true;
    let isPolling = false;

    const pollInbox = async () => {
      if (!active || isPolling) {
        return;
      }

      isPolling = true;
      const previousMessages = inboxPreviewRef.current;

      try {
        const inboxResult = await loadInboxForSession(session);
        const nextMessages = inboxResult.inboxPreview;

        if (!active || !haveMessagesChanged(previousMessages, nextMessages)) {
          return;
        }

        await notifyAboutNewMessages(
          previousMessages,
          nextMessages,
          preferences.mailNotificationsEnabled,
          preferences.priorityMailOnlyNotifications,
        ).catch(() => {
          return;
        });

        const refreshedSession = await persistRefreshedSession(inboxResult.refreshedSession);
        await persistMagisterCache({
          personId: refreshedSession.personId ?? refreshedSession.id,
          cachedAt: new Date().toISOString(),
          scheduleFrom: cacheMeta?.scheduleFrom,
          scheduleTo: cacheMeta?.scheduleTo,
          appointments: appointmentsRef.current,
          grades: gradesRef.current,
          inboxPreview: nextMessages,
          subjectAverages: subjectAveragesRef.current,
        });
      } catch {
        return;
      } finally {
        isPolling = false;
      }
    };

    const intervalId = setInterval(() => {
      pollInbox().catch(() => {
        return;
      });
    }, MAIL_POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [
    cacheMeta?.scheduleFrom,
    cacheMeta?.scheduleTo,
    isHydrating,
    loadInboxForSession,
    persistMagisterCache,
    persistRefreshedSession,
    preferences.demoModeEnabled,
    preferences.mailNotificationsEnabled,
    preferences.priorityMailOnlyNotifications,
    session,
  ]);

  const refreshRange = useCallback(async (
    from: string,
    to: string,
    options?: { includeGrades?: boolean; includeInbox?: boolean; merge?: boolean; allowNotifications?: boolean; force?: boolean },
  ) => {
    if (!session?.accessToken) {
      setErrorMessage('Deze sessie kan niet automatisch verversen. Log opnieuw in of gebruik een nieuw token.');
      return;
    }

    const includeGrades = options?.includeGrades ?? false;
    const includeInbox = options?.includeInbox ?? false;
    const merge = options?.merge ?? false;
    const allowNotifications = options?.allowNotifications ?? false;
    const force = options?.force ?? false;
    const requestedPersonId = session.personId ?? session.id;
    const cacheIsFresh =
      cacheMeta?.personId === requestedPersonId &&
      Date.now() - new Date(cacheMeta.cachedAt).getTime() < MAGISTER_REFRESH_WINDOW_MS;
    const requestedRangeCovered =
      Boolean(cacheMeta?.scheduleFrom && cacheMeta?.scheduleTo) &&
      from >= (cacheMeta?.scheduleFrom ?? '') &&
      to <= (cacheMeta?.scheduleTo ?? '');

    if (!force && cacheIsFresh && requestedRangeCovered) {
      return;
    }

    const scheduleResult = await loadScheduleForSession(session, from, to, merge);
    let refreshedSession = scheduleResult.refreshedSession;
    let nextAppointments = merge
      ? mergeAppointments(appointmentsRef.current, scheduleResult.appointments)
      : scheduleResult.appointments;
    let nextGrades = gradesRef.current;
    let nextInboxPreview = inboxPreviewRef.current;
    let nextSubjectAverages = subjectAveragesRef.current;

    if (includeGrades) {
      const gradesResult = await loadGradesForSession(refreshedSession);
      refreshedSession = gradesResult.refreshedSession;
      nextGrades = gradesResult.grades;
      nextSubjectAverages = gradesResult.subjectAverages;
    }

    if (includeInbox) {
      const inboxResult = await loadInboxForSession(refreshedSession);
      refreshedSession = inboxResult.refreshedSession;
      nextInboxPreview = inboxResult.inboxPreview;
    }

    if (allowNotifications) {
      await Promise.all([
        notifyAboutScheduleUpdates(
          appointmentsRef.current,
          nextAppointments,
          preferences.scheduleChangeNotifications,
        ).catch(() => {
          return;
        }),
        includeGrades
          ? notifyAboutNewGrades(gradesRef.current, nextGrades, preferences.gradeNotifications).catch(() => {
              return;
            })
          : Promise.resolve(),
        includeInbox
          ? notifyAboutNewMessages(
              inboxPreviewRef.current,
              nextInboxPreview,
              preferences.mailNotificationsEnabled,
              preferences.priorityMailOnlyNotifications,
            ).catch(() => {
              return;
            })
          : Promise.resolve(),
      ]);
    }

    await persistRefreshedSession(refreshedSession);
    await persistMagisterCache({
      personId: refreshedSession.personId ?? refreshedSession.id,
      cachedAt: new Date().toISOString(),
      scheduleFrom:
        merge && cacheMeta?.scheduleFrom && cacheMeta.scheduleFrom < from ? cacheMeta.scheduleFrom : from,
      scheduleTo:
        merge && cacheMeta?.scheduleTo && cacheMeta.scheduleTo > to ? cacheMeta.scheduleTo : to,
      appointments: nextAppointments,
      grades: nextGrades,
      inboxPreview: nextInboxPreview,
      subjectAverages: nextSubjectAverages,
    });
  }, [
    cacheMeta,
    loadGradesForSession,
    loadInboxForSession,
    loadScheduleForSession,
    persistMagisterCache,
    persistRefreshedSession,
    preferences.gradeNotifications,
    preferences.mailNotificationsEnabled,
    preferences.priorityMailOnlyNotifications,
    preferences.scheduleChangeNotifications,
    session,
  ]);

  const loginWithMagister = useCallback(async (usernameHint?: string) => {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      const tokenSet = await loginWithMagisterOAuth(usernameHint);
      const account = await fetchAccountFromTokens(tokenSet);
      const profile = toProfile(account);
      const range = getScheduleRange();
      const [schedule, scheduleChanges, latestGrades, inboxMessages] = await Promise.all([
        fetchScheduleFromTokens(tokenSet, profile.id, range.from, range.to),
        fetchScheduleChangesFromTokens(tokenSet, profile.id, range.from, range.to).catch(() => null),
        fetchLatestGradesFromTokens(tokenSet, profile.id).catch(() => []),
        fetchInboxMessagesFromTokens(tokenSet, { top: 50, skip: 0 }).catch(() => []),
      ]);
      const averages = calculateSubjectAveragesFromGrades(latestGrades);
      const normalizedSchedule = normalizeAppointments(schedule, scheduleChanges);

      const nextSession: StoredSession = {
        ...profile,
        ...tokenSet,
        attendanceStudentId: extractAttendanceStudentId(tokenSet),
        authMode: 'oauth',
        hasApiAccess: true,
        lastSyncedAt: new Date().toISOString(),
      };

      setAppointments(normalizedSchedule);
      setGrades(latestGrades);
      setInboxPreview(inboxMessages);
      setSubjectAverages(averages);
      setSession(nextSession);
      await saveStoredSession(nextSession);
      await persistMagisterCache({
        personId: nextSession.personId ?? nextSession.id,
        cachedAt: new Date().toISOString(),
        scheduleFrom: range.from,
        scheduleTo: range.to,
        appointments: normalizedSchedule,
        grades: latestGrades,
        inboxPreview: inboxMessages,
        subjectAverages: averages,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Magister login mislukte.');
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const connectWithManualTokens = useCallback(async (values: ManualTokenValues) => {
    const sanitizedAccessToken = values.accessToken.trim();
    const sanitizedXsrfToken = values.xsrfToken?.trim() || sanitizedAccessToken;

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const account = await fetchAccountFromTokens({
        accessToken: sanitizedAccessToken,
        xsrfToken: sanitizedXsrfToken,
      });

      const profile = toProfile(account);
      const range = getScheduleRange();
      const resolvedPersonId = values.personId ?? profile.id;
      const manualTokenSet = {
        accessToken: sanitizedAccessToken,
        xsrfToken: sanitizedXsrfToken,
      };
      const [schedule, scheduleChanges, latestGrades, inboxMessages] = await Promise.all([
        fetchScheduleFromTokens(manualTokenSet, resolvedPersonId, range.from, range.to),
        fetchScheduleChangesFromTokens(manualTokenSet, resolvedPersonId, range.from, range.to).catch(() => null),
        fetchLatestGradesFromTokens(manualTokenSet, resolvedPersonId).catch(() => []),
        fetchInboxMessagesFromTokens(manualTokenSet, { top: 50, skip: 0 }).catch(() => []),
      ]);
      const averages = calculateSubjectAveragesFromGrades(latestGrades);
      const normalizedSchedule = normalizeAppointments(schedule, scheduleChanges);

      const nextSession: StoredSession = {
        ...profile,
        id: resolvedPersonId,
        personId: resolvedPersonId,
        accessToken: sanitizedAccessToken,
        xsrfToken: sanitizedXsrfToken,
        attendanceStudentId: extractAttendanceStudentId({ accessToken: sanitizedAccessToken }),
        authMode: 'manual',
        hasApiAccess: true,
        lastSyncedAt: new Date().toISOString(),
      };

      setAppointments(normalizedSchedule);
      setGrades(latestGrades);
      setInboxPreview(inboxMessages);
      setSubjectAverages(averages);
      setSession(nextSession);
      await saveStoredSession(nextSession);
      await persistMagisterCache({
        personId: nextSession.personId ?? nextSession.id,
        cachedAt: new Date().toISOString(),
        scheduleFrom: range.from,
        scheduleTo: range.to,
        appointments: normalizedSchedule,
        grades: latestGrades,
        inboxPreview: inboxMessages,
        subjectAverages: averages,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Koppelen met Magister mislukte.');
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const refreshAppData = useCallback(async () => {
    if (preferences.demoModeEnabled) {
      return;
    }

    const range = getScheduleRange();

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await refreshRange(range.from, range.to, {
        allowNotifications: true,
        force: true,
        includeGrades: true,
        includeInbox: true,
        merge: false,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Synchroniseren mislukte.');
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [preferences.demoModeEnabled, refreshRange]);

  const refreshSchedule = useCallback(async () => {
    if (preferences.demoModeEnabled) {
      return;
    }

    const range = getScheduleRange();

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await refreshRange(range.from, range.to, {
        allowNotifications: true,
        force: true,
        includeGrades: false,
        includeInbox: true,
        merge: false,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Rooster vernieuwen mislukte.');
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [preferences.demoModeEnabled, refreshRange]);

  const refreshInbox = useCallback(async () => {
    if (preferences.demoModeEnabled || !session?.accessToken) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const previousMessages = inboxPreviewRef.current;
      const inboxResult = await loadInboxForSession(session);
      await notifyAboutNewMessages(
        previousMessages,
        inboxResult.inboxPreview,
        preferences.mailNotificationsEnabled,
        preferences.priorityMailOnlyNotifications,
      ).catch(() => {
        return;
      });
      const refreshedSession = await persistRefreshedSession(inboxResult.refreshedSession);

      await persistMagisterCache({
        personId: refreshedSession.personId ?? refreshedSession.id,
        cachedAt: new Date().toISOString(),
        scheduleFrom: cacheMeta?.scheduleFrom,
        scheduleTo: cacheMeta?.scheduleTo,
        appointments: appointmentsRef.current,
        grades: gradesRef.current,
        inboxPreview: inboxResult.inboxPreview,
        subjectAverages: subjectAveragesRef.current,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Inbox vernieuwen mislukte.');
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [
    cacheMeta?.scheduleFrom,
    cacheMeta?.scheduleTo,
    loadInboxForSession,
    persistMagisterCache,
    persistRefreshedSession,
    preferences.demoModeEnabled,
    preferences.mailNotificationsEnabled,
    preferences.priorityMailOnlyNotifications,
    session,
  ]);

  const ensureScheduleRangeLoaded = useCallback(async (from: string, to: string) => {
    if (preferences.demoModeEnabled) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await refreshRange(from, to, { includeGrades: false, merge: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Roosterweek laden mislukte.');
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [preferences.demoModeEnabled, refreshRange]);

  const updatePreferences = useCallback(async (
    value: Partial<AppPreferences> | ((current: AppPreferences) => AppPreferences),
  ) => {
    const nextPreferences =
      typeof value === 'function'
        ? value(preferences)
        : {
            ...preferences,
            ...value,
          };

    setPreferences(nextPreferences);
    await savePreferences(nextPreferences);
  }, [preferences]);

  const toggleAgendaReminder = useCallback(async (eventId: string) => {
    await updatePreferences((current) => {
      const hasReminder = current.savedReminderEventIds.includes(eventId);

      return {
        ...current,
        savedReminderEventIds: hasReminder
          ? current.savedReminderEventIds.filter((value) => value !== eventId)
          : [...current.savedReminderEventIds, eventId],
      };
    });
  }, [updatePreferences]);

  const logout = useCallback(async () => {
    setAppointments([]);
    setGrades([]);
    setInboxPreview([]);
    setSubjectAverages([]);
    setSession(null);
    setCacheMeta(null);
    setErrorMessage(null);
    await clearStoredSession();
    await clearStoredMagisterCache();
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const markMessageReadLocally = useCallback((messageId: number) => {
    setInboxPreview((current) =>
      current.map((message) => (message.id === messageId ? { ...message, isRead: true } : message)),
    );
  }, []);

  const setAppointmentCompletion = useCallback(async (appointmentId: string, completed: boolean) => {
    if (preferences.demoModeEnabled || !session?.accessToken) {
      return null;
    }

    const numericAppointmentId = Number(appointmentId);

    if (!Number.isFinite(numericAppointmentId)) {
      throw new Error('Deze afspraak kan niet worden bijgewerkt.');
    }

    const refreshedSession = await ensureFreshSession(session);
    const personId = refreshedSession.personId ?? refreshedSession.id;
    const updatedAppointment = await updateAppointmentCompletionFromTokens(
      refreshedSession,
      personId,
      numericAppointmentId,
      completed,
    );

    if (!updatedAppointment) {
      return null;
    }

    const nextAppointments = appointmentsRef.current.map((appointment) =>
      appointment.id === updatedAppointment.id ? { ...appointment, ...updatedAppointment } : appointment,
    );

    setAppointments(nextAppointments);

    const nextSession = await persistRefreshedSession(refreshedSession);
    await persistMagisterCache({
      personId: nextSession.personId ?? nextSession.id,
      cachedAt: new Date().toISOString(),
      scheduleFrom: cacheMeta?.scheduleFrom,
      scheduleTo: cacheMeta?.scheduleTo,
      appointments: nextAppointments,
      grades: gradesRef.current,
      inboxPreview: inboxPreviewRef.current,
      subjectAverages: subjectAveragesRef.current,
    });

    return updatedAppointment;
  }, [
    cacheMeta?.scheduleFrom,
    cacheMeta?.scheduleTo,
    ensureFreshSession,
    persistMagisterCache,
    persistRefreshedSession,
    preferences.demoModeEnabled,
    session,
  ]);

  const unreadInboxCount = countUnreadMessages(effectiveInboxPreview);

  return (
    <WalburgAppContext.Provider
      value={{
        appointments: effectiveAppointments,
        grades: effectiveGrades,
        inboxPreview: effectiveInboxPreview,
        subjectAverages: effectiveSubjectAverages,
        preferences,
        isDemoMode,
        isBusy,
        isHydrating,
        unreadInboxCount,
        session: effectiveSession,
        errorMessage,
        clearError,
        loginWithMagister,
        connectWithManualTokens,
        logout,
        refreshAppData,
        refreshInbox,
        refreshSchedule,
        ensureScheduleRangeLoaded,
        updatePreferences,
        toggleAgendaReminder,
        markMessageReadLocally,
        setAppointmentCompletion,
      }}
    >
      {children}
    </WalburgAppContext.Provider>
  );
}

export function useWalburgApp() {
  const context = useContext(WalburgAppContext);

  if (!context) {
    throw new Error('useWalburgApp must be used inside WalburgAppProvider');
  }

  return context;
}
