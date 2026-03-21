import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { getScheduleRange } from '../lib/date';
import { loginWithMagisterOAuth, refreshMagisterAccessToken } from '../services/magisterAuth';
import {
  calculateSubjectAveragesFromGrades,
  fetchAccountFromTokens,
  fetchLatestGradesFromTokens,
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
import { AppPreferences } from '../types/content';
import {
  MagisterAppointment,
  MagisterGradeResult,
  MagisterSubjectAverage,
  StoredMagisterCache,
  StoredSession,
} from '../types/magister';

type ManualTokenValues = {
  accessToken: string;
  xsrfToken?: string;
  personId?: number;
};

interface WalburgAppContextValue {
  appointments: MagisterAppointment[];
  grades: MagisterGradeResult[];
  subjectAverages: MagisterSubjectAverage[];
  preferences: AppPreferences;
  isBusy: boolean;
  isHydrating: boolean;
  session: StoredSession | null;
  errorMessage: string | null;
  clearError: () => void;
  loginWithMagister: (usernameHint?: string) => Promise<void>;
  connectWithManualTokens: (values: ManualTokenValues) => Promise<void>;
  logout: () => Promise<void>;
  refreshAppData: () => Promise<void>;
  refreshSchedule: () => Promise<void>;
  ensureScheduleRangeLoaded: (from: string, to: string) => Promise<void>;
  updatePreferences: (
    value: Partial<AppPreferences> | ((current: AppPreferences) => AppPreferences),
  ) => Promise<void>;
  toggleAgendaReminder: (eventId: string) => Promise<void>;
}

const WalburgAppContext = createContext<WalburgAppContextValue | null>(null);
const MAGISTER_REFRESH_WINDOW_MS = 120_000;

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

export function WalburgAppProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [appointments, setAppointments] = useState<MagisterAppointment[]>([]);
  const [grades, setGrades] = useState<MagisterGradeResult[]>([]);
  const [subjectAverages, setSubjectAverages] = useState<MagisterSubjectAverage[]>([]);
  const [preferences, setPreferences] = useState<AppPreferences>({
    agendaAutoAddEnabled: false,
    agendaReminders: false,
    gradeNotifications: true,
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
  const subjectAveragesRef = useRef<MagisterSubjectAverage[]>([]);

  useEffect(() => {
    appointmentsRef.current = appointments;
  }, [appointments]);

  useEffect(() => {
    gradesRef.current = grades;
  }, [grades]);

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

        setSession(storedSession);
        setPreferences(storedPreferences);
        if (
          storedSession &&
          storedCache &&
          storedCache.personId === (storedSession.personId ?? storedSession.id)
        ) {
          setAppointments(storedCache.appointments);
          setGrades(storedCache.grades);
          setSubjectAverages(storedCache.subjectAverages);
          setCacheMeta({
            personId: storedCache.personId,
            cachedAt: storedCache.cachedAt,
            scheduleFrom: storedCache.scheduleFrom,
            scheduleTo: storedCache.scheduleTo,
          });
        }

        const hasFreshCache =
          storedSession &&
          storedCache &&
          storedCache.personId === (storedSession.personId ?? storedSession.id) &&
          Date.now() - new Date(storedCache.cachedAt).getTime() < MAGISTER_REFRESH_WINDOW_MS;

        shouldBootstrapSyncRef.current = Boolean(
          storedSession?.hasApiAccess &&
          storedSession.accessToken &&
          !hasFreshCache,
        );
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

  const persistRefreshedSession = useCallback(async (activeSession: StoredSession) => {
    const nextSession = {
      ...activeSession,
      lastSyncedAt: new Date().toISOString(),
    };

    setSession(nextSession);
    await saveStoredSession(nextSession);

    return nextSession;
  }, []);

  const refreshRange = useCallback(async (from: string, to: string, options?: { includeGrades?: boolean; merge?: boolean }) => {
    if (!session?.accessToken) {
      setErrorMessage('Deze sessie kan niet automatisch verversen. Log opnieuw in of gebruik een nieuw token.');
      return;
    }

    const includeGrades = options?.includeGrades ?? false;
    const merge = options?.merge ?? false;
    const requestedPersonId = session.personId ?? session.id;
    const cacheIsFresh =
      cacheMeta?.personId === requestedPersonId &&
      Date.now() - new Date(cacheMeta.cachedAt).getTime() < MAGISTER_REFRESH_WINDOW_MS;
    const requestedRangeCovered =
      Boolean(cacheMeta?.scheduleFrom && cacheMeta?.scheduleTo) &&
      from >= (cacheMeta?.scheduleFrom ?? '') &&
      to <= (cacheMeta?.scheduleTo ?? '');

    if (cacheIsFresh && requestedRangeCovered) {
      return;
    }

    const scheduleResult = await loadScheduleForSession(session, from, to, merge);
    let refreshedSession = scheduleResult.refreshedSession;
    let nextAppointments = merge
      ? mergeAppointments(appointmentsRef.current, scheduleResult.appointments)
      : scheduleResult.appointments;
    let nextGrades = gradesRef.current;
    let nextSubjectAverages = subjectAveragesRef.current;

    if (includeGrades) {
      const gradesResult = await loadGradesForSession(refreshedSession);
      refreshedSession = gradesResult.refreshedSession;
      nextGrades = gradesResult.grades;
      nextSubjectAverages = gradesResult.subjectAverages;
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
      subjectAverages: nextSubjectAverages,
    });
  }, [loadGradesForSession, loadScheduleForSession, persistRefreshedSession, session]);

  const loginWithMagister = useCallback(async (usernameHint?: string) => {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      const tokenSet = await loginWithMagisterOAuth(usernameHint);
      const account = await fetchAccountFromTokens(tokenSet);
      const profile = toProfile(account);
      const range = getScheduleRange();
      const [schedule, scheduleChanges, latestGrades] = await Promise.all([
        fetchScheduleFromTokens(tokenSet, profile.id, range.from, range.to),
        fetchScheduleChangesFromTokens(tokenSet, profile.id, range.from, range.to).catch(() => null),
        fetchLatestGradesFromTokens(tokenSet, profile.id).catch(() => []),
      ]);
      const averages = calculateSubjectAveragesFromGrades(latestGrades);
      const normalizedSchedule = normalizeAppointments(schedule, scheduleChanges);

      const nextSession: StoredSession = {
        ...profile,
        ...tokenSet,
        authMode: 'oauth',
        hasApiAccess: true,
        lastSyncedAt: new Date().toISOString(),
      };

      setAppointments(normalizedSchedule);
      setGrades(latestGrades);
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
      const [schedule, scheduleChanges, latestGrades] = await Promise.all([
        fetchScheduleFromTokens(manualTokenSet, resolvedPersonId, range.from, range.to),
        fetchScheduleChangesFromTokens(manualTokenSet, resolvedPersonId, range.from, range.to).catch(() => null),
        fetchLatestGradesFromTokens(manualTokenSet, resolvedPersonId).catch(() => []),
      ]);
      const averages = calculateSubjectAveragesFromGrades(latestGrades);
      const normalizedSchedule = normalizeAppointments(schedule, scheduleChanges);

      const nextSession: StoredSession = {
        ...profile,
        id: resolvedPersonId,
        personId: resolvedPersonId,
        accessToken: sanitizedAccessToken,
        xsrfToken: sanitizedXsrfToken,
        authMode: 'manual',
        hasApiAccess: true,
        lastSyncedAt: new Date().toISOString(),
      };

      setAppointments(normalizedSchedule);
      setGrades(latestGrades);
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
    const range = getScheduleRange();

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await refreshRange(range.from, range.to, { includeGrades: true, merge: false });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Synchroniseren mislukte.');
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [refreshRange]);

  const refreshSchedule = useCallback(async () => {
    const range = getScheduleRange();

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await refreshRange(range.from, range.to, { includeGrades: false, merge: false });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Rooster vernieuwen mislukte.');
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [refreshRange]);

  const ensureScheduleRangeLoaded = useCallback(async (from: string, to: string) => {
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
  }, [refreshRange]);

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

  return (
    <WalburgAppContext.Provider
      value={{
        appointments,
        grades,
        subjectAverages,
        preferences,
        isBusy,
        isHydrating,
        session,
        errorMessage,
        clearError,
        loginWithMagister,
        connectWithManualTokens,
        logout,
        refreshAppData,
        refreshSchedule,
        ensureScheduleRangeLoaded,
        updatePreferences,
        toggleAgendaReminder,
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
