import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloorPlanViewer } from '../components/FloorPlanViewer';
import { appConfig } from '../constants/appConfig';
import { theme } from '../constants/theme';
import { useWalburgApp } from '../context/WalburgAppContext';
import {
  addDays,
  formatApiDate,
  formatDayLabel,
  formatShortDate,
  formatShortWeekday,
  formatTime,
  getDefaultSchoolDate,
  getSchoolWeekDates,
  getWeekNumber,
  getWeekStart,
  isSameDay,
} from '../lib/date';
import { findFloorPlanMatch } from '../lib/floorPlan';
import { formatDisplayLocation } from '../lib/location';
import { combineAppointmentsForDisplay, formatLessonHoursLabel } from '../lib/schedule';
import { loadDemoActivities, loadDemoSchoolAgenda } from '../services/demoContent';
import { fetchActivitiesFromTokens } from '../services/magister';
import { loadSchoolAgenda } from '../services/walburgContent';
import { SchoolAgendaItem } from '../types/content';
import { MagisterActivity, MagisterAppointment } from '../types/magister';
import { ScheduleStackParamList } from '../types/navigation';

type ScheduleMode = 'schedule' | 'calendar' | 'schoolwork' | 'activities';
type CalendarRangePreset = 'thisWeek' | 'nextWeek';
type ScheduleTimelineItem =
  | { type: 'pause'; id: string; minutes: number }
  | { type: 'appointment'; appointment: MagisterAppointment };
type StudyWeekGroup = {
  date: Date;
  items: MagisterAppointment[];
};

type Props = NativeStackScreenProps<ScheduleStackParamList, 'ScheduleIndex'>;

function isFlexAppointment(appointment: MagisterAppointment) {
  return appointment.type === 7;
}

function isActivityAppointment(appointment: MagisterAppointment) {
  return appointment.type === 2;
}

function isFreeDayAppointment(appointment: MagisterAppointment) {
  return appointment.type === 6;
}

function formatLessonHours(appointment: MagisterAppointment) {
  if (appointment.isAllDay) {
    return 'Hele dag';
  }

  const { lessonHours: value, start, end } = appointment;

  if (value) {
    return formatLessonHoursLabel(value);
  }

  if (start && end) {
    return `${formatTime(start)} - ${formatTime(end)}`;
  }

  return 'Tijd volgt';
}

function formatAgendaMoment(item: SchoolAgendaItem) {
  if (item.isAllDay) {
    return 'Hele dag';
  }

  return `${formatTime(item.start)} - ${formatTime(item.end)}`;
}

function formatActivityWindow(start?: string | null, end?: string | null) {
  if (start && end) {
    return `${formatDayLabel(start)} | ${formatTime(start)} - ${formatTime(end)}`;
  }

  if (start) {
    return `Vanaf ${formatDayLabel(start)} | ${formatTime(start)}`;
  }

  if (end) {
    return `Tot ${formatDayLabel(end)} | ${formatTime(end)}`;
  }

  return null;
}

function getInfoLabel(appointment: MagisterAppointment) {
  const normalizedTitle = appointment.title.trim().toLowerCase();
  const normalizedSubject = appointment.subject.trim().toLowerCase();
  const hasAssessmentMarker =
    /\b(pw|so|mo)\b/.test(normalizedTitle) ||
    /\b(pw|so|mo)\b/.test(normalizedSubject) ||
    /\b(proefwerk|toets)\b/.test(normalizedTitle);

  if (appointment.infoType === 1) {
    return 'Huiswerk';
  }

  if (appointment.infoType === 2) {
    return hasAssessmentMarker ? 'Toets' : 'Informatie';
  }

  if (hasAssessmentMarker) {
    return 'Toets';
  }

  return 'Informatie';
}

function isLessonAppointment(appointment: MagisterAppointment) {
  return (
    !isActivityAppointment(appointment) &&
    !isFreeDayAppointment(appointment) &&
    (appointment.subject !== 'Schoolafspraak' || appointment.title !== 'Schoolafspraak')
  );
}

function getLessonHeading(appointment: MagisterAppointment) {
  if (isFreeDayAppointment(appointment)) {
    return {
      title: 'Lesvrije dag',
      subtitle: appointment.title,
    };
  }

  if (isActivityAppointment(appointment)) {
    return {
      title: appointment.title,
      subtitle: appointment.subject !== 'Schoolafspraak' && appointment.subject !== appointment.title ? appointment.subject : null,
    };
  }

  if (!isLessonAppointment(appointment)) {
    return {
      title: appointment.title,
      subtitle: appointment.subject !== appointment.title ? appointment.subject : null,
    };
  }

  return {
    title: appointment.subject,
    subtitle: appointment.title !== appointment.subject ? appointment.title : null,
  };
}

function isVisibleInLessonList(appointment: MagisterAppointment) {
  return (
    isLessonAppointment(appointment) ||
    isFlexAppointment(appointment) ||
    isActivityAppointment(appointment) ||
    isFreeDayAppointment(appointment) ||
    appointment.status === 2
  );
}

function getSecondaryMetaLine(appointment: MagisterAppointment) {
  if (appointment.isCancelled) {
    return 'Uitgevallen';
  }

  if (isFreeDayAppointment(appointment)) {
    return null;
  }

  const metaParts = [appointment.location, appointment.teachers].filter(
    (value) => Boolean(value) && value !== 'Locatie volgt' && value !== 'Docent onbekend',
  );

  if (metaParts.length > 0) {
    return metaParts.join(' | ');
  }

  if (isActivityAppointment(appointment)) {
    return 'Activiteit';
  }

  return appointment.subject;
}

function canToggleLessonCompletion(appointment: MagisterAppointment) {
  return (
    !appointment.isCancelled &&
    !isActivityAppointment(appointment) &&
    !isFreeDayAppointment(appointment) &&
    Boolean(appointment.description?.trim())
  );
}

function formatStudyItemCount(count: number) {
  if (count === 0) {
    return 'Rustig';
  }

  if (count === 1) {
    return '1 item';
  }

  return `${count} items`;
}

function buildScheduleTimeline(appointments: MagisterAppointment[]): ScheduleTimelineItem[] {
  const visibleAppointments = appointments.filter(isVisibleInLessonList);
  const timeline: ScheduleTimelineItem[] = [];
  let cancelledBlockStart: string | null = null;

  visibleAppointments.forEach((appointment, index) => {
    const previous = visibleAppointments[index - 1];

    if (previous) {
      if (previous.isAllDay || appointment.isAllDay) {
        timeline.push({
          type: 'appointment',
          appointment,
        });
        return;
      }

      if (previous.isCancelled) {
        if (!appointment.isCancelled && cancelledBlockStart) {
          const pauseMinutes = Math.round(
            (new Date(appointment.start).getTime() - new Date(cancelledBlockStart).getTime()) / 60_000,
          );

          if (pauseMinutes > 0) {
            timeline.push({
              type: 'pause',
              id: `${previous.id}__pause__${appointment.id}`,
              minutes: pauseMinutes,
            });
          }

          cancelledBlockStart = null;
        }
      } else {
        const pauseMinutes = Math.round(
          (new Date(appointment.start).getTime() - new Date(previous.end).getTime()) / 60_000,
        );

        if (pauseMinutes > 0) {
          timeline.push({
            type: 'pause',
            id: `${previous.id}__pause__${appointment.id}`,
            minutes: pauseMinutes,
          });
        }
      }
    }

    if (appointment.isCancelled && !cancelledBlockStart) {
      cancelledBlockStart = appointment.start;
    }

    timeline.push({
      type: 'appointment',
      appointment,
    });
  });

  return timeline;
}

function getAdjacentSchoolDay(date: Date, direction: -1 | 1) {
  let nextDate = addDays(date, direction);

  while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
    nextDate = addDays(nextDate, direction);
  }

  return nextDate;
}

export function ScheduleScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const {
    appointments,
    ensureScheduleRangeLoaded,
    errorMessage,
    isDemoMode,
    preferences,
    setAppointmentCompletion,
    session,
    toggleAgendaReminder,
  } = useWalburgApp();
  const defaultSchoolDate = getDefaultSchoolDate();
  const [mode, setMode] = useState<ScheduleMode>('schedule');
  const [selectedWeekStart, setSelectedWeekStart] = useState(getWeekStart(defaultSchoolDate));
  const [selectedDate, setSelectedDate] = useState(defaultSchoolDate);
  const [selectedLesson, setSelectedLesson] = useState<MagisterAppointment | null>(null);
  const [selectedLocationLesson, setSelectedLocationLesson] = useState<MagisterAppointment | null>(null);
  const [selectedAgendaItem, setSelectedAgendaItem] = useState<SchoolAgendaItem | null>(null);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [activities, setActivities] = useState<MagisterActivity[]>([]);
  const [isActivitiesLoading, setIsActivitiesLoading] = useState(false);
  const [agendaItems, setAgendaItems] = useState<SchoolAgendaItem[]>([]);
  const [isAgendaLoading, setIsAgendaLoading] = useState(true);
  const [rangePreset, setRangePreset] = useState<CalendarRangePreset>('thisWeek');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRangePickerVisible, setIsRangePickerVisible] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdatingLessonCompletion, setIsUpdatingLessonCompletion] = useState(false);
  const focusAppointmentId = route.params?.focusAppointmentId;
  const focusDateParam = route.params?.focusDate;
  const focusNonce = route.params?.focusNonce;

  const isWideLayout = width >= appConfig.layout.landscapeWidth;
  const weekDays = useMemo(() => getSchoolWeekDates(selectedWeekStart), [selectedWeekStart]);

  useFocusEffect(
    useCallback(() => {
      const focusDate = focusDateParam ? new Date(focusDateParam) : getDefaultSchoolDate();

      if (focusAppointmentId || focusDateParam) {
        setMode('schedule');
        setSelectedWeekStart(getWeekStart(focusDate));
        setSelectedDate(focusDate);
        setSelectedLesson(null);
        setSelectedLocationLesson(null);
        setSelectedAgendaItem(null);
        setIsRangePickerVisible(false);
        setIsSearchVisible(false);

        return undefined;
      }

      setSelectedWeekStart(getWeekStart(focusDate));
      setSelectedDate(focusDate);
      setSelectedLesson(null);
      setSelectedLocationLesson(null);
      setSelectedAgendaItem(null);
      setIsRangePickerVisible(false);
      setIsSearchVisible(false);

      return undefined;
    }, [focusAppointmentId, focusDateParam]),
  );

  useEffect(() => {
    let active = true;

    async function loadWeek() {
      if (!session) {
        return;
      }

      setIsScheduleLoading(true);

      try {
        await ensureScheduleRangeLoaded(formatApiDate(selectedWeekStart), formatApiDate(addDays(selectedWeekStart, 6)));
      } finally {
        if (active) {
          setIsScheduleLoading(false);
        }
      }
    }

    loadWeek().catch(() => {
      if (active) {
        setIsScheduleLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [ensureScheduleRangeLoaded, selectedWeekStart, session]);

  useEffect(() => {
    let active = true;

    async function loadAgenda() {
      setIsAgendaLoading(true);

      try {
        const nextAgenda = await (isDemoMode ? loadDemoSchoolAgenda() : loadSchoolAgenda());

        if (active) {
          setAgendaItems(nextAgenda);
        }
      } finally {
        if (active) {
          setIsAgendaLoading(false);
        }
      }
    }

    loadAgenda().catch(() => {
      if (active) {
        setAgendaItems([]);
        setIsAgendaLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [isDemoMode]);

  const refreshActivities = useCallback(async () => {
    if (isDemoMode) {
      setIsActivitiesLoading(true);

      try {
        const nextActivities = await loadDemoActivities();
        setActivities(nextActivities);
      } finally {
        setIsActivitiesLoading(false);
      }

      return;
    }

    if (!session?.accessToken) {
      setActivities([]);
      return;
    }

    setIsActivitiesLoading(true);

    try {
      const personId = session.personId ?? session.id;
      const nextActivities = await fetchActivitiesFromTokens(session, personId);
      setActivities(nextActivities);
    } finally {
      setIsActivitiesLoading(false);
    }
  }, [isDemoMode, session]);

  useFocusEffect(
    useCallback(() => {
      refreshActivities().catch(() => {
        setActivities([]);
      });

      return undefined;
    }, [refreshActivities]),
  );

  const refreshAgenda = useCallback(async () => {
    const nextAgenda = await (isDemoMode ? loadDemoSchoolAgenda() : loadSchoolAgenda());
    setAgendaItems(nextAgenda);
  }, [isDemoMode]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await Promise.all([
        session
          ? ensureScheduleRangeLoaded(
              formatApiDate(selectedWeekStart),
              formatApiDate(addDays(selectedWeekStart, 6)),
            )
          : Promise.resolve(),
        refreshAgenda().catch(() => {
          return;
        }),
        refreshActivities().catch(() => {
          return;
        }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [ensureScheduleRangeLoaded, refreshActivities, refreshAgenda, selectedWeekStart, session]);

  const handleLessonCompletionToggle = useCallback(async () => {
    if (!selectedLesson || !canToggleLessonCompletion(selectedLesson) || isUpdatingLessonCompletion) {
      return;
    }

    setIsUpdatingLessonCompletion(true);

    try {
      const updatedLesson = await setAppointmentCompletion(selectedLesson.id, !selectedLesson.completed);

      if (updatedLesson) {
        setSelectedLesson(updatedLesson);
      }
    } finally {
      setIsUpdatingLessonCompletion(false);
    }
  }, [isUpdatingLessonCompletion, selectedLesson, setAppointmentCompletion]);

  const combinedDayAppointments = useMemo(
    () =>
      combineAppointmentsForDisplay(
        appointments
          .filter((appointment) => isSameDay(appointment.start, selectedDate))
          .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()),
      ),
    [appointments, selectedDate],
  );

  const scheduleTimeline = useMemo(
    () => buildScheduleTimeline(combinedDayAppointments),
    [combinedDayAppointments],
  );
  const studyWeekGroups = useMemo<StudyWeekGroup[]>(
    () =>
      weekDays.map((day) => ({
        date: day,
        items: combineAppointmentsForDisplay(
          appointments
            .filter((appointment) => isSameDay(appointment.start, day))
            .filter(
              (appointment) =>
                Boolean(appointment.description?.trim()) &&
                !appointment.isCancelled &&
                !isActivityAppointment(appointment) &&
                !isFreeDayAppointment(appointment),
            )
            .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()),
        ),
      })),
    [appointments, weekDays],
  );
  const hasStudyWeekEntries = useMemo(
    () => studyWeekGroups.some((group) => group.items.length > 0),
    [studyWeekGroups],
  );
  const totalStudyItems = useMemo(
    () => studyWeekGroups.reduce((total, group) => total + group.items.length, 0),
    [studyWeekGroups],
  );
  const completedStudyItems = useMemo(
    () =>
      studyWeekGroups.reduce(
        (total, group) => total + group.items.filter((item) => item.completed).length,
        0,
      ),
    [studyWeekGroups],
  );

  const agendaRangeStart = useMemo(() => {
    const currentWeekStart = getWeekStart(defaultSchoolDate);
    return rangePreset === 'nextWeek' ? addDays(currentWeekStart, 7) : currentWeekStart;
  }, [defaultSchoolDate, rangePreset]);
  const agendaRangeEnd = addDays(agendaRangeStart, 6);
  const selectedLocationFloorPlanMatch = useMemo(
    () => findFloorPlanMatch(selectedLocationLesson?.location),
    [selectedLocationLesson],
  );

  const filteredAgendaDays = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const sortedItems = [...agendaItems].sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());

    if (normalizedQuery) {
      const matches = sortedItems.filter((item) => {
        const haystack = `${item.title} ${item.description ?? ''}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });

      const grouped = new Map<string, { date: Date; items: SchoolAgendaItem[] }>();

      matches.forEach((item) => {
        const date = new Date(item.start);
        const key = formatApiDate(date);

        if (!grouped.has(key)) {
          grouped.set(key, { date, items: [] });
        }

        grouped.get(key)?.items.push(item);
      });

      return Array.from(grouped.values());
    }

    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(agendaRangeStart, index);
      const items = sortedItems.filter((item) => isSameDay(item.start, date));

      return {
        date,
        items,
      };
    });
  }, [agendaItems, agendaRangeStart, searchQuery]);
  const hasActivities = activities.length > 0;

  useEffect(() => {
    if (!hasActivities && mode === 'activities') {
      setMode('schedule');
    }
  }, [hasActivities, mode]);

  useEffect(() => {
    if (!focusAppointmentId) {
      return;
    }

    const nextLesson =
      appointments.find((appointment) => appointment.id === focusAppointmentId) ?? null;

    if (!nextLesson) {
      return;
    }

    const nextDate = new Date(nextLesson.start);
    setMode('schedule');
    setSelectedWeekStart(getWeekStart(nextDate));
    setSelectedDate(nextDate);
    setSelectedLesson(nextLesson);
    setSelectedLocationLesson(null);
    setSelectedAgendaItem(null);

    navigation.setParams({
      focusAppointmentId: undefined,
      focusDate: undefined,
      focusNonce: undefined,
    });
  }, [appointments, focusAppointmentId, focusNonce, navigation]);

  const shiftSelectedDay = useCallback((direction: -1 | 1) => {
    const nextDate = getAdjacentSchoolDay(selectedDate, direction);

    setSelectedDate(nextDate);
    setSelectedWeekStart(getWeekStart(nextDate));
  }, [selectedDate]);

  const scheduleSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 18 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.25;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx <= -56) {
            shiftSelectedDay(1);
          }

          if (gestureState.dx >= 56) {
            shiftSelectedDay(-1);
          }
        },
      }),
    [shiftSelectedDay],
  );

  function shiftWeek(direction: -1 | 1) {
    const currentIndex = Math.max(
      0,
      weekDays.findIndex((day) => isSameDay(day, selectedDate)),
    );
    const nextWeekStart = addDays(selectedWeekStart, direction * 7);
    const nextDate = addDays(nextWeekStart, currentIndex);

    setSelectedWeekStart(nextWeekStart);
    setSelectedDate(nextDate);
  }

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={[theme.colors.brandBlueDeep, theme.colors.brandBlue, theme.colors.brandCyan]}
        end={{ x: 1, y: 0.9 }}
        start={{ x: 0, y: 0 }}
        style={[styles.topInsetHeader, { height: insets.top + 18 }]}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 112 + insets.bottom, paddingTop: 14 }}
        refreshControl={
          <RefreshControl onRefresh={handleRefresh} refreshing={isRefreshing} tintColor={theme.colors.brandBlue} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={styles.topBarInner}>
            <View style={styles.topRow}>
              <View style={styles.modeSwitch}>
                <Pressable
                  onPress={() => setMode('schedule')}
                  style={[styles.modeButton, mode === 'schedule' ? styles.modeButtonActive : null]}
                >
                  <Ionicons
                    color={mode === 'schedule' ? theme.colors.brandBlueDeep : theme.colors.textMuted}
                    name="create-outline"
                    size={18}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setMode('schoolwork')}
                  style={[styles.modeButton, mode === 'schoolwork' ? styles.modeButtonActive : null]}
                >
                  <Ionicons
                    color={mode === 'schoolwork' ? theme.colors.brandBlueDeep : theme.colors.textMuted}
                    name="reader-outline"
                    size={18}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setMode('calendar')}
                  style={[styles.modeButton, mode === 'calendar' ? styles.modeButtonActive : null]}
                >
                  <Ionicons
                    color={mode === 'calendar' ? theme.colors.brandBlueDeep : theme.colors.textMuted}
                    name="calendar-clear-outline"
                    size={18}
                  />
                </Pressable>
                {hasActivities ? (
                  <Pressable
                    onPress={() => setMode('activities')}
                    style={[styles.modeButton, mode === 'activities' ? styles.modeButtonActive : null]}
                  >
                    <Ionicons
                      color={mode === 'activities' ? theme.colors.brandBlueDeep : theme.colors.textMuted}
                      name="pencil-outline"
                      size={18}
                    />
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.heroLabel}>
                {mode === 'schedule'
                  ? 'Lesrooster'
                  : mode === 'calendar'
                    ? 'Schoolagenda'
                    : mode === 'schoolwork'
                      ? 'Huiswerk'
                      : 'Activiteiten'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.contentWrap}>
          {errorMessage ? (
            <View style={styles.errorStrip}>
              <Ionicons color={theme.colors.warning} name="warning-outline" size={18} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {mode === 'schedule' ? (
            <View {...scheduleSwipeResponder.panHandlers}>
              <View style={styles.weekCard}>
                <View style={styles.weekHeader}>
                  <Pressable onPress={() => shiftWeek(-1)} style={styles.arrowButton}>
                    <Ionicons color={theme.colors.brandBlueDeep} name="chevron-back" size={20} />
                  </Pressable>
                  <View style={styles.weekHeaderCopy}>
                    <Text style={styles.weekNumber}>Week {getWeekNumber(selectedWeekStart)}</Text>
                    <Text style={styles.weekRange}>
                      {formatShortDate(selectedWeekStart)} - {formatShortDate(addDays(selectedWeekStart, 4))}
                    </Text>
                  </View>
                  <Pressable onPress={() => shiftWeek(1)} style={styles.arrowButton}>
                    <Ionicons color={theme.colors.brandBlueDeep} name="chevron-forward" size={20} />
                  </Pressable>
                </View>

                <View style={styles.dayChipRow}>
                  {weekDays.map((day) => {
                    const isSelected = isSameDay(day, selectedDate);

                    return (
                      <Pressable
                        key={day.toISOString()}
                        onPress={() => setSelectedDate(day)}
                        style={[styles.dayChip, isSelected ? styles.dayChipActive : null]}
                      >
                        <Text style={[styles.dayChipLabel, isSelected ? styles.dayChipLabelActive : null]}>
                          {formatShortWeekday(day)}
                        </Text>
                        <Text style={[styles.dayChipMeta, isSelected ? styles.dayChipMetaActive : null]}>
                          {day.getDate()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {!session ? (
                <View style={styles.stateCard}>
                  <Text style={styles.stateText}>Log in via profiel om je rooster uit Magister te laden.</Text>
                </View>
              ) : isScheduleLoading && scheduleTimeline.length === 0 ? (
                <View style={styles.stateCard}>
                  <ActivityIndicator color={theme.colors.brandBlue} />
                </View>
              ) : scheduleTimeline.length === 0 ? (
                <View style={styles.stateCard}>
                  <Text style={styles.stateText}>Geen lessen gevonden voor deze dag.</Text>
                </View>
              ) : (
                <View style={[styles.section, isWideLayout ? styles.sectionWide : null]}>
                  {scheduleTimeline.map((item) => {
                    if (item.type === 'pause') {
                      return (
                        <View key={item.id} style={[styles.pauseRow, isWideLayout ? styles.pauseRowWide : null]}>
                          <View style={styles.pauseLine} />
                          <Text style={styles.pauseText}>
                            {item.minutes > 31 ? `Tussenuur • ${item.minutes} min` : `${item.minutes} min pauze`}
                          </Text>
                          <View style={styles.pauseLine} />
                        </View>
                      );
                    }

                    const appointment = item.appointment;
                    const heading = getLessonHeading(appointment);
                    const hasInfo = Boolean(appointment.description?.trim()) && !appointment.isCancelled;
                    const infoLabel = !appointment.isCancelled && hasInfo ? getInfoLabel(appointment) : null;
                    const isTestBadge = infoLabel === 'Toets';
                    const isCancelled = appointment.isCancelled;
                    const isFlex = isFlexAppointment(appointment);
                    const locationMatch = !isCancelled ? findFloorPlanMatch(appointment.location) : null;
                    const secondaryMeta = getSecondaryMetaLine(appointment);
                    const statusChips = [
                      isCancelled ? (
                        <View key="cancelled" style={styles.lessonCancelledBadge}>
                          <Text style={styles.lessonCancelledBadgeText}>Uitgevallen</Text>
                        </View>
                      ) : null,
                      isFlex ? (
                        <View key="flex" style={styles.lessonTypeBadge}>
                          <Text style={styles.lessonTypeBadgeText}>Flexuur</Text>
                        </View>
                      ) : null,
                      infoLabel ? (
                        <View
                          key="info"
                          style={[
                            styles.lessonInfoBadge,
                            isTestBadge ? styles.lessonInfoBadgeDark : null,
                            isCancelled ? styles.lessonInfoBadgeCancelled : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.lessonInfoBadgeText,
                              isTestBadge ? styles.lessonInfoBadgeTextDark : null,
                              isCancelled ? styles.lessonInfoBadgeTextCancelled : null,
                            ]}
                          >
                            {infoLabel}
                          </Text>
                        </View>
                      ) : null,
                    ].filter(Boolean);

                    return (
                      <Pressable
                        key={appointment.id}
                        disabled={Boolean(isCancelled)}
                        onPress={() => setSelectedLesson(appointment)}
                        style={[
                          styles.lessonCard,
                          isWideLayout ? styles.lessonCardWide : null,
                          isCancelled ? styles.lessonCardCancelled : null,
                        ]}
                      >
                        <View style={styles.lessonTopRow}>
                          <View style={styles.lessonCopy}>
                            <Text
                              numberOfLines={2}
                              style={[styles.lessonTitle, isCancelled ? styles.lessonTitleCancelled : null]}
                            >
                              {heading.title}
                            </Text>
                            {heading.subtitle ? (
                              <Text
                                numberOfLines={2}
                                style={[styles.lessonSubtitle, isCancelled ? styles.lessonSubtitleCancelled : null]}
                              >
                                {heading.subtitle}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.lessonSidebar}>
                            <View style={[styles.lessonBadge, isCancelled ? styles.lessonBadgeCancelled : null]}>
                              <Text
                                adjustsFontSizeToFit
                                minimumFontScale={0.82}
                                numberOfLines={1}
                                style={[styles.lessonBadgeText, isCancelled ? styles.lessonBadgeTextCancelled : null]}
                              >
                                {formatLessonHours(appointment)}
                              </Text>
                            </View>
                            {statusChips.length > 0 ? <View style={styles.lessonSidebarBadges}>{statusChips}</View> : null}
                            {locationMatch ? (
                              <Pressable
                                hitSlop={8}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  setSelectedLocationLesson(appointment);
                                }}
                                style={styles.lessonWalkButton}
                              >
                                <Ionicons color={theme.colors.brandBlue} name="walk-outline" size={20} />
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                        <Text numberOfLines={1} style={[styles.lessonMeta, isCancelled ? styles.lessonMetaCancelled : null]}>
                          {formatTime(appointment.start)} - {formatTime(appointment.end)}
                        </Text>
                        {secondaryMeta ? (
                          <Text
                            numberOfLines={3}
                            style={[styles.lessonMeta, isCancelled ? styles.lessonMetaCancelled : null]}
                          >
                            {secondaryMeta}
                          </Text>
                        ) : null}
                        {isCancelled ? (
                          <Text
                            numberOfLines={appConfig.ui.previewLines}
                            style={[styles.lessonMeta, styles.lessonMetaCancelled]}
                          >
                            {appointment.teachers}
                          </Text>
                        ) : null}
                        {hasInfo ? (
                          <>
                            <View style={styles.lessonDivider} />
                            <Text
                              numberOfLines={appConfig.ui.previewLines}
                              style={[styles.lessonPreview, isCancelled ? styles.lessonPreviewCancelled : null]}
                            >
                              {appointment.description}
                            </Text>
                          </>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ) : mode === 'calendar' ? (
            <>
              <View style={styles.filterCard}>
                <Pressable onPress={() => setIsRangePickerVisible(true)} style={styles.filterButton}>
                  <Ionicons color={theme.colors.brandBlue} name="swap-horizontal-outline" size={18} />
                  <Text style={styles.filterButtonText}>
                    {rangePreset === 'nextWeek' ? 'Volgende week' : 'Deze week'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setIsSearchVisible(true)} style={styles.filterButton}>
                  <Ionicons color={theme.colors.brandBlue} name="search-outline" size={18} />
                  <Text numberOfLines={1} style={styles.filterButtonText}>
                    {searchQuery ? searchQuery : 'Zoeken in alle activiteiten'}
                  </Text>
                </Pressable>
              </View>

              {isAgendaLoading ? (
                <View style={styles.stateCard}>
                  <ActivityIndicator color={theme.colors.brandBlue} />
                </View>
              ) : filteredAgendaDays.length === 0 ? (
                <View style={styles.stateCard}>
                  <Text style={styles.stateText}>Geen schoolactiviteiten gevonden voor deze zoekopdracht.</Text>
                </View>
              ) : (
                <View style={[styles.section, isWideLayout ? styles.sectionWide : null]}>
                  {filteredAgendaDays.map((group) => (
                    <View key={group.date.toISOString()} style={[styles.agendaDayCard, isWideLayout ? styles.agendaDayCardWide : null]}>
                      <View style={styles.agendaDayHeader}>
                        <Text style={styles.agendaDayLabel}>{formatShortWeekday(group.date)}</Text>
                        <Text style={styles.agendaDayMeta}>{formatShortDate(group.date)}</Text>
                      </View>

                      {group.items.length === 0 ? (
                        <Text style={styles.agendaEmpty}>Geen schoolagenda voor deze dag.</Text>
                      ) : (
                        group.items.map((item) => (
                          <Pressable key={item.id} onPress={() => setSelectedAgendaItem(item)} style={styles.agendaItem}>
                            <Text numberOfLines={appConfig.ui.previewLines} style={styles.agendaTitle}>
                              {item.title}
                            </Text>
                            <Text numberOfLines={1} style={styles.agendaMeta}>
                              {formatAgendaMoment(item)}
                            </Text>
                            {item.description ? (
                              <Text numberOfLines={appConfig.ui.previewLines} style={styles.agendaDescription}>
                                {item.description}
                              </Text>
                            ) : null}
                          </Pressable>
                        ))
                      )}
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : mode === 'schoolwork' ? (
            <>
              <View style={styles.weekCard}>
                <View style={styles.weekHeader}>
                  <Pressable onPress={() => shiftWeek(-1)} style={styles.arrowButton}>
                    <Ionicons color={theme.colors.brandBlueDeep} name="chevron-back" size={20} />
                  </Pressable>
                  <View style={styles.weekHeaderCopy}>
                    <Text style={styles.weekNumber}>Week {getWeekNumber(selectedWeekStart)}</Text>
                    <Text style={styles.weekRange}>
                      {formatShortDate(selectedWeekStart)} - {formatShortDate(addDays(selectedWeekStart, 4))}
                    </Text>
                  </View>
                  <Pressable onPress={() => shiftWeek(1)} style={styles.arrowButton}>
                    <Ionicons color={theme.colors.brandBlueDeep} name="chevron-forward" size={20} />
                  </Pressable>
                </View>

                <View style={styles.dayChipRow}>
                  {studyWeekGroups.map((group) => (
                    <View key={group.date.toISOString()} style={[styles.dayChip, styles.studyDayChip]}>
                      <Text style={styles.dayChipLabel}>{formatShortWeekday(group.date)}</Text>
                      <Text style={styles.studyDayChipMeta}>{formatStudyItemCount(group.items.length)}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.studyProgressRow}>
                  <Text style={styles.studyProgressLabel}>Afgerond</Text>
                  <Text style={styles.studyProgressValue}>
                    {completedStudyItems} van {totalStudyItems}
                  </Text>
                </View>
              </View>

              {!session ? (
                <View style={styles.stateCard}>
                  <Text style={styles.stateText}>Log in via profiel om je lesstof en toetsen uit Magister te laden.</Text>
                </View>
              ) : isScheduleLoading && !hasStudyWeekEntries ? (
                <View style={styles.stateCard}>
                  <ActivityIndicator color={theme.colors.brandBlue} />
                </View>
              ) : !hasStudyWeekEntries ? (
                <View style={styles.stateCard}>
                  <Text style={styles.stateText}>Voor deze week staat er nog geen huiswerk, toets of info klaar.</Text>
                </View>
              ) : (
                <View style={[styles.section, isWideLayout ? styles.sectionWide : null]}>
                  {studyWeekGroups.map((group) => (
                    <View
                      key={group.date.toISOString()}
                      style={[styles.agendaDayCard, isWideLayout ? styles.agendaDayCardWide : null]}
                    >
                      <View style={styles.agendaDayHeader}>
                        <Text style={styles.agendaDayLabel}>{formatShortWeekday(group.date)}</Text>
                        <Text style={styles.agendaDayMeta}>{formatShortDate(group.date)}</Text>
                      </View>

                      {group.items.length === 0 ? (
                        <Text style={styles.agendaEmpty}>Geen lesstof of toetsen voor deze dag.</Text>
                      ) : (
                        group.items.map((item) => {
                          const infoLabel = getInfoLabel(item);
                          const isTestBadge = infoLabel === 'Toets';
                          const secondaryMeta = getSecondaryMetaLine(item);

                          return (
                            <Pressable
                              key={item.id}
                              onPress={() => setSelectedLesson(item)}
                              style={styles.studyItem}
                            >
                              <View style={styles.studyItemHeader}>
                                <View style={styles.studyItemCopy}>
                                  <Text numberOfLines={2} style={styles.studyItemTitle}>
                                    {item.subject}
                                  </Text>
                                  {item.title !== item.subject ? (
                                    <Text numberOfLines={2} style={styles.studyItemSubtitle}>
                                      {item.title}
                                    </Text>
                                  ) : null}
                                </View>
                                <View style={styles.studyItemSidebar}>
                                  <View style={styles.lessonBadge}>
                                    <Text
                                      adjustsFontSizeToFit
                                      minimumFontScale={0.82}
                                      numberOfLines={1}
                                      style={styles.lessonBadgeText}
                                    >
                                      {formatLessonHours(item)}
                                    </Text>
                                  </View>
                                  <View
                                    style={[
                                      styles.studyBadge,
                                      isTestBadge ? styles.studyBadgeDark : null,
                                      item.completed ? styles.studyBadgeCompleted : null,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.studyBadgeText,
                                        isTestBadge ? styles.studyBadgeTextDark : null,
                                        item.completed ? styles.studyBadgeTextCompleted : null,
                                      ]}
                                    >
                                      {infoLabel}
                                    </Text>
                                    {item.completed ? (
                                      <>
                                        <View style={styles.studyBadgeDivider} />
                                        <Text style={styles.studyBadgeFooterText}>Afgerond</Text>
                                      </>
                                    ) : null}
                                  </View>
                                </View>
                              </View>
                              <Text numberOfLines={1} style={styles.agendaMeta}>
                                {formatTime(item.start)} - {formatTime(item.end)}
                              </Text>
                              {secondaryMeta ? (
                                <Text numberOfLines={1} style={styles.studyItemMeta}>
                                  {secondaryMeta}
                                </Text>
                              ) : null}
                              <Text numberOfLines={appConfig.ui.previewLines + 1} style={styles.studyItemDescription}>
                                {item.description}
                              </Text>
                            </Pressable>
                          );
                        })
                      )}
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : !session ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateText}>Log in via profiel om je activiteiten uit Magister te laden.</Text>
            </View>
          ) : isActivitiesLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={theme.colors.brandBlue} />
            </View>
          ) : !hasActivities ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateText}>Er zijn op dit moment geen activiteiten beschikbaar.</Text>
            </View>
          ) : (
            <View style={styles.section}>
              {activities.map((activity) => {
                const registrationWindow = formatActivityWindow(activity.subscriptionStart, activity.subscriptionEnd);
                const visibilityWindow = formatActivityWindow(activity.visibleFrom, activity.visibleTo);

                return (
                  <Pressable
                    key={activity.id}
                    onPress={() =>
                      navigation.navigate('ActivityDetails', {
                        activityId: activity.activityId,
                        details: activity.details,
                        selfLink: activity.selfLink,
                        subscriptionEnd: activity.subscriptionEnd,
                        subscriptionStart: activity.subscriptionStart,
                        title: activity.title,
                        visibleFrom: activity.visibleFrom,
                        visibleTo: activity.visibleTo,
                      })
                    }
                    style={styles.activityCard}
                  >
                    <View style={styles.activityCardHeader}>
                      <View style={styles.activityIconWrap}>
                        <Ionicons color={theme.colors.brandBlue} name="pencil-outline" size={20} />
                      </View>
                      <View style={styles.activityCopy}>
                        <Text style={styles.activityTitle}>{activity.title}</Text>
                        {registrationWindow ? (
                          <Text style={styles.activityMeta}>Inschrijven | {registrationWindow}</Text>
                        ) : visibilityWindow ? (
                          <Text style={styles.activityMeta}>Zichtbaar | {visibilityWindow}</Text>
                        ) : null}
                      </View>
                      <Ionicons color={theme.colors.brandBlue} name="chevron-forward" size={20} />
                    </View>
                    {activity.details ? (
                      <Text numberOfLines={appConfig.ui.previewLines + 1} style={styles.activityDescription}>
                        {activity.details}
                      </Text>
                    ) : null}
                    <View style={styles.activityFooter}>
                      <Text style={styles.activityFooterText}>
                        {activity.subscriptionCount > 0
                          ? `${activity.subscriptionCount} inschrijving${activity.subscriptionCount === 1 ? '' : 'en'} actief`
                          : 'Nog geen keuzes gemaakt'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedLesson(null)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={Boolean(selectedLesson)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{selectedLesson ? getLessonHeading(selectedLesson).title : ''}</Text>
                <Pressable onPress={() => setSelectedLesson(null)} style={styles.modalClose}>
                  <Ionicons color={theme.colors.brandBlueDeep} name="close" size={20} />
                </Pressable>
              </View>
              {selectedLesson ? (
                <>
                  {getLessonHeading(selectedLesson).subtitle ? (
                    <Text style={styles.modalMeta}>{getLessonHeading(selectedLesson).subtitle}</Text>
                  ) : null}
                  <Text style={styles.modalMeta}>
                    {formatTime(selectedLesson.start)} - {formatTime(selectedLesson.end)} |{' '}
                    {formatDisplayLocation(selectedLesson.location) || 'Locatie volgt'}
                  </Text>
                  <Text style={styles.modalMeta}>{selectedLesson.teachers}</Text>
                  {canToggleLessonCompletion(selectedLesson) ? (
                    <Pressable
                      disabled={isUpdatingLessonCompletion}
                      onPress={handleLessonCompletionToggle}
                      style={[
                        styles.lessonCompletionButton,
                        selectedLesson.completed ? styles.lessonCompletionButtonActive : null,
                        isUpdatingLessonCompletion ? styles.lessonCompletionButtonDisabled : null,
                      ]}
                    >
                      {isUpdatingLessonCompletion ? (
                        <ActivityIndicator color={theme.colors.brandBlueDeep} size="small" />
                      ) : (
                        <Ionicons
                          color={theme.colors.brandBlueDeep}
                          name={selectedLesson.completed ? 'checkmark-circle' : 'ellipse-outline'}
                          size={18}
                        />
                      )}
                      <Text style={styles.lessonCompletionButtonText}>
                        {selectedLesson.completed ? 'Afgerond, tik om terug te zetten' : 'Markeer als afgerond'}
                      </Text>
                    </Pressable>
                  ) : null}
                  {selectedLesson.description ? (
                    <View style={styles.modalInfoBlock}>
                      <Text style={styles.modalInfoTitle}>{getInfoLabel(selectedLesson)}</Text>
                      <Text style={styles.modalInfoText}>{selectedLesson.description}</Text>
                    </View>
                  ) : null}
                  {selectedLesson.hasAttachments ? (
                    <Text style={styles.modalAttachment}>Deze les heeft ook bijlagen in Magister.</Text>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedLocationLesson(null)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={Boolean(selectedLocationLesson)}
      >
        <View style={styles.modalScrim}>
          <View style={[styles.modalCard, styles.locationModalCard]}>
            <View style={styles.modalHeader}>
              <View style={styles.locationModalTitleWrap}>
                <Text style={[styles.modalTitle, styles.locationModalTitle]}>
                  {formatDisplayLocation(selectedLocationLesson?.location) || 'Locatie'}
                </Text>
                {selectedLocationLesson ? (
                  <Text style={styles.modalMeta}>
                    {formatTime(selectedLocationLesson.start)} - {formatTime(selectedLocationLesson.end)} |{' '}
                    {getLessonHeading(selectedLocationLesson).title}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => setSelectedLocationLesson(null)} style={styles.modalClose}>
                <Ionicons color={theme.colors.brandBlueDeep} name="close" size={20} />
              </Pressable>
            </View>
            {selectedLocationLesson ? (
              selectedLocationFloorPlanMatch ? (
                <FloorPlanViewer
                  animationKey={
                    selectedLocationLesson
                      ? `${selectedLocationLesson.id}:${selectedLocationLesson.start}`
                      : undefined
                  }
                  autoFocusEnabled
                  match={selectedLocationFloorPlanMatch}
                />
              ) : (
                <View style={styles.mapEmptyState}>
                  <Text style={styles.mapEmptyTitle}>
                    Nog geen locatie ingesteld voor {formatDisplayLocation(selectedLocationLesson.location) || 'deze locatie'}
                  </Text>
                  <Text style={styles.mapEmptyText}>
                    Voeg dit lokaal toe in `src/data/floorPlans.json` of gebruik de editor in `tools/floorplan-editor`.
                  </Text>
                </View>
              )
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedAgendaItem(null)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={Boolean(selectedAgendaItem)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedAgendaItem?.title}</Text>
              <Pressable onPress={() => setSelectedAgendaItem(null)} style={styles.modalClose}>
                <Ionicons color={theme.colors.brandBlueDeep} name="close" size={20} />
              </Pressable>
            </View>
            {selectedAgendaItem ? (
              <>
                <Text style={styles.modalMeta}>{formatShortDate(new Date(selectedAgendaItem.start))}</Text>
                <Text style={styles.modalMeta}>{formatAgendaMoment(selectedAgendaItem)}</Text>
                {selectedAgendaItem.description ? (
                  <View style={styles.modalInfoBlock}>
                    <Text style={styles.modalInfoText}>{selectedAgendaItem.description}</Text>
                  </View>
                ) : null}
                <Pressable onPress={() => toggleAgendaReminder(selectedAgendaItem.id)} style={styles.reminderRow}>
                  <Ionicons
                    color={
                      preferences.savedReminderEventIds.includes(selectedAgendaItem.id)
                        ? theme.colors.brandBlueDeep
                        : theme.colors.brandBlue
                    }
                    name={
                      preferences.savedReminderEventIds.includes(selectedAgendaItem.id)
                        ? 'notifications'
                        : 'notifications-outline'
                    }
                    size={20}
                  />
                  <Text style={styles.reminderText}>
                    {preferences.savedReminderEventIds.includes(selectedAgendaItem.id)
                      ? 'Herinnering staat aan, 15 minuten van tevoren.'
                      : 'Herinner 15 minuten van tevoren'}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsRangePickerVisible(false)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={isRangePickerVisible}
      >
        <View style={styles.modalScrim}>
          <View style={styles.popupCard}>
            <Text style={styles.popupTitle}>Kies week</Text>
            {appConfig.schedule.agendaRangeOptions.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  setRangePreset(option.key);
                  setIsRangePickerVisible(false);
                }}
                style={[styles.popupOption, rangePreset === option.key ? styles.popupOptionActive : null]}
              >
                <Text style={[styles.popupOptionText, rangePreset === option.key ? styles.popupOptionTextActive : null]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsSearchVisible(false)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={isSearchVisible}
      >
        <View style={[styles.modalScrim, styles.topModalScrim, { paddingTop: insets.top + 12 }]}>
          <View style={styles.popupCard}>
            <Text style={styles.popupTitle}>Zoeken in activiteiten</Text>
            <View style={styles.searchInputWrap}>
              <TextInput
                autoFocus
                onChangeText={setSearchQuery}
                placeholder="Zoek in alle activiteiten"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.searchInput}
                value={searchQuery}
              />
              <Pressable onPress={() => setSearchQuery('')} style={styles.searchClearButton}>
                <Ionicons color={theme.colors.brandBlue} name="close-circle" size={20} />
              </Pressable>
            </View>
            <Pressable onPress={() => setIsSearchVisible(false)} style={styles.searchCloseButton}>
              <Text style={styles.searchCloseButtonText}>Sluiten</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  topInsetHeader: {
    backgroundColor: theme.colors.brandBlueDeep,
  },
  topBar: {
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  topBarInner: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    width: '100%',
  },
  contentWrap: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    width: '100%',
  },
  errorStrip: {
    alignItems: 'center',
    backgroundColor: '#FFF4E8',
    borderRadius: theme.radius.sm,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 18,
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    color: theme.colors.warning,
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    lineHeight: 18,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroLabel: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  modeSwitch: {
    backgroundColor: '#E8F0FB',
    borderRadius: 14,
    flexDirection: 'row',
    padding: 6,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    position: 'relative',
    width: 52,
  },
  modeButtonActive: {
    backgroundColor: theme.colors.paper,
  },
  weekCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    marginHorizontal: 18,
    marginTop: 18,
    padding: 16,
  },
  weekHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  arrowButton: {
    alignItems: 'center',
    backgroundColor: '#EDF4FF',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  weekHeaderCopy: {
    alignItems: 'center',
  },
  weekNumber: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  weekRange: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 20,
    lineHeight: 26,
    marginTop: 4,
  },
  dayChipRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  dayChip: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 76,
    position: 'relative',
  },
  dayChipActive: {
    backgroundColor: theme.colors.brandBlue,
    borderColor: theme.colors.brandBlue,
  },
  dayChipLabel: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
  },
  dayChipLabelActive: {
    color: theme.colors.inkOnDark,
  },
  dayChipMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    marginTop: 4,
  },
  dayChipMetaActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  studyDayChip: {
    minHeight: 84,
    paddingHorizontal: 6,
  },
  studyDayChipMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    marginTop: 6,
    textAlign: 'center',
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    marginHorizontal: 18,
    marginTop: 18,
    minHeight: 120,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  stateText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  section: {
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  sectionWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  lessonCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  lessonCardCancelled: {
    backgroundColor: '#F2F4F7',
    borderColor: '#D8DDE6',
  },
  lessonCardWide: {
    width: '48.8%',
  },
  pauseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 8,
  },
  pauseRowWide: {
    width: '48.8%',
  },
  pauseLine: {
    backgroundColor: theme.colors.divider,
    flex: 1,
    height: 1,
  },
  pauseText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  lessonTopRow: {
    minHeight: 104,
    position: 'relative',
  },
  lessonCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 154,
  },
  lessonSidebar: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 8,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  lessonSidebarBadges: {
    alignItems: 'flex-end',
    gap: 8,
  },
  lessonTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 18,
    lineHeight: 24,
  },
  lessonSubtitle: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    marginTop: 5,
    paddingRight: 0,
    textTransform: 'uppercase',
  },
  lessonTitleCancelled: {
    color: '#536479',
  },
  lessonSubtitleCancelled: {
    color: '#7A8697',
  },
  lessonBadge: {
    backgroundColor: '#EDF4FF',
    borderRadius: 10,
    maxWidth: 134,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  lessonBadgeText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.heavy,
    fontSize: 12,
    textAlign: 'center',
  },
  lessonBadgeCancelled: {
    backgroundColor: '#FCE8E7',
  },
  lessonBadgeTextCancelled: {
    color: theme.colors.warning,
  },
  lessonInfoBadge: {
    backgroundColor: '#EDF4FF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  lessonInfoBadgeDark: {
    backgroundColor: theme.colors.brandBlueDeep,
  },
  lessonInfoBadgeCancelled: {
    backgroundColor: '#E5E8EE',
  },
  lessonInfoBadgeText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
  },
  lessonInfoBadgeTextDark: {
    color: theme.colors.inkOnDark,
  },
  lessonInfoBadgeTextCancelled: {
    color: '#536479',
  },
  lessonWalkButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  lessonCancelledBadge: {
    backgroundColor: '#FCE8E7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  lessonCancelledBadgeText: {
    color: theme.colors.warning,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
  },
  lessonTypeBadge: {
    backgroundColor: '#E9EDF3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  lessonTypeBadgeText: {
    color: '#5B6678',
    fontFamily: theme.fonts.bold,
    fontSize: 12,
  },
  lessonMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 7,
  },
  lessonBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  lessonMetaCancelled: {
    color: '#7A8697',
  },
  lessonDivider: {
    backgroundColor: theme.colors.divider,
    height: 1,
    marginHorizontal: 4,
    marginTop: 14,
  },
  lessonPreview: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  lessonPreviewCancelled: {
    color: '#607184',
  },
  filterCard: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    paddingHorizontal: 18,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 14,
  },
  filterButtonText: {
    color: theme.colors.brandBlue,
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    textAlign: 'center',
  },
  activityCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  activityCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  activityIconWrap: {
    alignItems: 'center',
    backgroundColor: '#EDF4FF',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  activityCopy: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 18,
    lineHeight: 24,
  },
  activityMeta: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  activityDescription: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  activityFooter: {
    marginTop: 14,
  },
  activityFooterText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
  },
  agendaDayCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  agendaDayCardWide: {
    width: '48.8%',
  },
  agendaDayHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  agendaDayLabel: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 20,
  },
  agendaDayMeta: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
  },
  agendaEmpty: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  agendaItem: {
    backgroundColor: '#F9FBFE',
    borderColor: theme.colors.divider,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  agendaTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    lineHeight: 21,
  },
  agendaMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  agendaDescription: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  studyItem: {
    backgroundColor: '#F9FBFE',
    borderColor: theme.colors.divider,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  studyItemHeader: {
    minHeight: 96,
    position: 'relative',
  },
  studyItemSidebar: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 8,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  studyItemCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 154,
  },
  studyItemTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    lineHeight: 20,
  },
  studyItemSubtitle: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  studyBadge: {
    backgroundColor: '#EDF4FF',
    borderRadius: 10,
    minWidth: 84,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  studyBadgeDark: {
    backgroundColor: theme.colors.brandBlueDeep,
  },
  studyBadgeCompleted: {
    paddingBottom: 8,
  },
  studyBadgeText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    textAlign: 'center',
  },
  studyBadgeTextDark: {
    color: theme.colors.inkOnDark,
  },
  studyBadgeTextCompleted: {
    color: theme.colors.brandBlueDeep,
  },
  studyBadgeDivider: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(38, 77, 151, 0.18)',
    height: 1,
    marginTop: 6,
  },
  studyBadgeFooterText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    marginTop: 6,
    textAlign: 'center',
  },
  studyItemMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 7,
  },
  studyItemDescription: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  studyProgressRow: {
    alignItems: 'center',
    backgroundColor: '#F4F8FF',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  studyProgressLabel: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  studyProgressValue: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 16,
  },
  modalScrim: {
    alignItems: 'center',
    backgroundColor: 'rgba(14, 27, 51, 0.42)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  topModalScrim: {
    justifyContent: 'flex-start',
  },
  modalCard: {
    backgroundColor: theme.colors.paper,
    maxHeight: '88%',
    borderRadius: 24,
    maxWidth: 720,
    padding: 20,
    width: '100%',
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: theme.colors.brandBlueDeep,
    flexShrink: 1,
    fontFamily: theme.fonts.heavy,
    fontSize: 24,
    lineHeight: 32,
    minWidth: 0,
    paddingRight: 14,
  },
  modalClose: {
    alignItems: 'center',
    backgroundColor: '#EDF4FF',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  modalMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  lessonCompletionButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#EDF4FF',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  lessonCompletionButtonActive: {
    backgroundColor: '#E8F6F1',
  },
  lessonCompletionButtonDisabled: {
    opacity: 0.7,
  },
  lessonCompletionButtonText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
  },
  modalInfoBlock: {
    backgroundColor: '#F7FAFF',
    borderRadius: theme.radius.sm,
    marginTop: 18,
    padding: 14,
  },
  modalInfoTitle: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  modalInfoText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  modalAttachment: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  locationModalCard: {
    maxWidth: 1120,
    paddingBottom: 18,
  },
  locationModalTitleWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 14,
  },
  locationModalTitle: {
    paddingRight: 0,
  },
  mapEmptyState: {
    backgroundColor: '#F7FAFF',
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  mapEmptyTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    lineHeight: 21,
  },
  mapEmptyText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  reminderRow: {
    alignItems: 'center',
    backgroundColor: '#F6FAFF',
    borderColor: theme.colors.divider,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  reminderText: {
    color: theme.colors.brandBlueDeep,
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    lineHeight: 20,
  },
  popupCard: {
    backgroundColor: theme.colors.paper,
    borderRadius: 24,
    maxWidth: 520,
    padding: 20,
    width: '100%',
  },
  popupTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 24,
    lineHeight: 30,
  },
  popupOption: {
    backgroundColor: '#F6FAFF',
    borderRadius: 12,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  popupOptionActive: {
    backgroundColor: theme.colors.brandBlue,
  },
  popupOptionText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
  },
  popupOptionTextActive: {
    color: theme.colors.inkOnDark,
  },
  searchInputWrap: {
    backgroundColor: '#F6FAFF',
    alignItems: 'center',
    borderColor: theme.colors.divider,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 14,
    minHeight: 54,
    paddingLeft: 14,
    paddingRight: 10,
  },
  searchInput: {
    color: theme.colors.text,
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    minHeight: 54,
  },
  searchClearButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  searchCloseButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.brandBlue,
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 50,
  },
  searchCloseButtonText: {
    color: theme.colors.inkOnDark,
    fontFamily: theme.fonts.heavy,
    fontSize: 15,
  },
});
