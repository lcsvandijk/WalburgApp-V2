import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { AppPreferences } from '../types/content';
import { StoredMagisterCache, StoredSession } from '../types/magister';

const SESSION_KEY = 'walburg.magister.session';
const PREFERENCES_KEY = 'walburg.preferences';
const MAGISTER_CACHE_KEY = 'walburg.magister.cache';

const DEFAULT_PREFERENCES: AppPreferences = {
  mailNotificationsEnabled: true,
  priorityMailOnlyNotifications: false,
  gradeNotifications: true,
  scheduleChangeNotifications: true,
  agendaReminders: false,
  agendaAutoAddEnabled: false,
  demoModeEnabled: false,
  lessonRemindersEnabled: false,
  onboardingCompleted: false,
  roundAveragesToWholeNumbers: false,
  savedReminderEventIds: [],
};

async function getItem(key: string) {
  if (Platform.OS === 'web') {
    return window.localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    window.localStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string) {
  if (Platform.OS === 'web') {
    window.localStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export async function loadStoredSession() {
  const raw = await getItem(SESSION_KEY);

  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as StoredSession;
}

export async function saveStoredSession(session: StoredSession) {
  await setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearStoredSession() {
  await deleteItem(SESSION_KEY);
}

export async function loadStoredMagisterCache() {
  const raw = await getItem(MAGISTER_CACHE_KEY);

  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as StoredMagisterCache;
}

export async function saveStoredMagisterCache(cache: StoredMagisterCache) {
  await setItem(MAGISTER_CACHE_KEY, JSON.stringify(cache));
}

export async function clearStoredMagisterCache() {
  await deleteItem(MAGISTER_CACHE_KEY);
}

export async function loadPreferences() {
  const raw = await getItem(PREFERENCES_KEY);

  if (!raw) {
    return DEFAULT_PREFERENCES;
  }

  return {
    ...DEFAULT_PREFERENCES,
    ...(JSON.parse(raw) as Partial<AppPreferences>),
  } satisfies AppPreferences;
}

export async function savePreferences(preferences: AppPreferences) {
  await setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}
