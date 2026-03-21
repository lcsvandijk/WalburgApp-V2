import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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

import { appConfig } from '../constants/appConfig';
import { theme } from '../constants/theme';
import { useWalburgApp } from '../context/WalburgAppContext';
import {
  addDays,
  formatApiDate,
  formatShortDate,
  formatShortWeekday,
  formatTime,
  getDefaultSchoolDate,
  getSchoolWeekDates,
  getWeekNumber,
  getWeekStart,
  isSameDay,
} from '../lib/date';
import { combineAppointmentsForDisplay, formatLessonHoursLabel } from '../lib/schedule';
import { loadSchoolAgenda } from '../services/walburgContent';
import { SchoolAgendaItem } from '../types/content';
import { MagisterAppointment } from '../types/magister';

type ScheduleMode = 'schedule' | 'calendar';
type CalendarRangePreset = 'thisWeek' | 'nextWeek';
type ScheduleTimelineItem =
  | { type: 'pause'; id: string; minutes: number }
  | { type: 'appointment'; appointment: MagisterAppointment };

function formatLessonHours(value?: string | null, start?: string, end?: string) {
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
  return appointment.subject !== 'Schoolafspraak';
}

function getLessonHeading(appointment: MagisterAppointment) {
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
  return isLessonAppointment(appointment);
}

function buildScheduleTimeline(appointments: MagisterAppointment[]): ScheduleTimelineItem[] {
  const visibleAppointments = appointments.filter(isVisibleInLessonList);
  const timeline: ScheduleTimelineItem[] = [];

  visibleAppointments.forEach((appointment, index) => {
    const previous = visibleAppointments[index - 1];

    if (previous) {
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

    timeline.push({
      type: 'appointment',
      appointment,
    });
  });

  return timeline;
}

export function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const {
    appointments,
    ensureScheduleRangeLoaded,
    errorMessage,
    preferences,
    session,
    toggleAgendaReminder,
  } = useWalburgApp();
  const defaultSchoolDate = getDefaultSchoolDate();
  const [mode, setMode] = useState<ScheduleMode>('schedule');
  const [selectedWeekStart, setSelectedWeekStart] = useState(getWeekStart(defaultSchoolDate));
  const [selectedDate, setSelectedDate] = useState(defaultSchoolDate);
  const [selectedLesson, setSelectedLesson] = useState<MagisterAppointment | null>(null);
  const [selectedAgendaItem, setSelectedAgendaItem] = useState<SchoolAgendaItem | null>(null);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [agendaItems, setAgendaItems] = useState<SchoolAgendaItem[]>([]);
  const [isAgendaLoading, setIsAgendaLoading] = useState(true);
  const [rangePreset, setRangePreset] = useState<CalendarRangePreset>('thisWeek');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRangePickerVisible, setIsRangePickerVisible] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isWideLayout = width >= appConfig.layout.landscapeWidth;
  const weekDays = useMemo(() => getSchoolWeekDates(selectedWeekStart), [selectedWeekStart]);

  useFocusEffect(
    useCallback(() => {
      const focusDate = getDefaultSchoolDate();

      setMode('schedule');
      setSelectedWeekStart(getWeekStart(focusDate));
      setSelectedDate(focusDate);
      setSelectedLesson(null);
      setSelectedAgendaItem(null);
      setIsRangePickerVisible(false);
      setIsSearchVisible(false);

      return undefined;
    }, []),
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
        const nextAgenda = await loadSchoolAgenda();

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
  }, []);

  const refreshAgenda = useCallback(async () => {
    const nextAgenda = await loadSchoolAgenda();
    setAgendaItems(nextAgenda);
  }, []);

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
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [ensureScheduleRangeLoaded, refreshAgenda, selectedWeekStart, session]);

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

  const agendaRangeStart = useMemo(() => {
    const currentWeekStart = getWeekStart(defaultSchoolDate);
    return rangePreset === 'nextWeek' ? addDays(currentWeekStart, 7) : currentWeekStart;
  }, [defaultSchoolDate, rangePreset]);
  const agendaRangeEnd = addDays(agendaRangeStart, 6);

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
                  <Ionicons color={theme.colors.brandBlueDeep} name="create-outline" size={18} />
                </Pressable>
                <Pressable
                  onPress={() => setMode('calendar')}
                  style={[styles.modeButton, mode === 'calendar' ? styles.modeButtonActive : null]}
                >
                  <Ionicons color={theme.colors.brandBlueDeep} name="calendar-clear-outline" size={18} />
                </Pressable>
              </View>
              <Text style={styles.heroLabel}>{mode === 'schedule' ? 'Lesrooster' : 'Schoolagenda'}</Text>
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
                    const hasInfo = Boolean(appointment.description) && !appointment.isCancelled;
                    const infoLabel = !appointment.isCancelled && hasInfo ? getInfoLabel(appointment) : null;
                    const isTestBadge = infoLabel === 'Toets';
                    const isCancelled = appointment.isCancelled;

                    return (
                      <Pressable
                        key={appointment.id}
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
                              numberOfLines={appConfig.ui.previewLines}
                              style={[styles.lessonTitle, isCancelled ? styles.lessonTitleCancelled : null]}
                            >
                              {heading.title}
                            </Text>
                            {heading.subtitle ? (
                              <Text
                                numberOfLines={1}
                                style={[styles.lessonSubtitle, isCancelled ? styles.lessonSubtitleCancelled : null]}
                              >
                                {heading.subtitle}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.lessonBadgeColumn}>
                            <View style={[styles.lessonBadge, isCancelled ? styles.lessonBadgeCancelled : null]}>
                              <Text style={[styles.lessonBadgeText, isCancelled ? styles.lessonBadgeTextCancelled : null]}>
                                {formatLessonHours(appointment.lessonHours, appointment.start, appointment.end)}
                              </Text>
                            </View>
                            {isCancelled ? (
                              <View style={styles.lessonCancelledBadge}>
                                <Text style={styles.lessonCancelledBadgeText}>Uitgevallen</Text>
                              </View>
                            ) : null}
                            {infoLabel ? (
                              <View
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
                            ) : null}
                          </View>
                        </View>
                        <Text numberOfLines={1} style={[styles.lessonMeta, isCancelled ? styles.lessonMetaCancelled : null]}>
                          {formatTime(appointment.start)} - {formatTime(appointment.end)}
                        </Text>
                        <Text
                          numberOfLines={appConfig.ui.previewLines}
                          style={[styles.lessonMeta, isCancelled ? styles.lessonMetaCancelled : null]}
                        >
                          {isCancelled ? 'Uitgevallen' : `${appointment.location} | ${appointment.teachers}`}
                        </Text>
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
            </>
          ) : (
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
                  {formatTime(selectedLesson.start)} - {formatTime(selectedLesson.end)} | {selectedLesson.location}
                </Text>
                <Text style={styles.modalMeta}>{selectedLesson.teachers}</Text>
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
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  lessonCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  lessonBadgeColumn: {
    alignItems: 'flex-end',
    flexShrink: 0,
    marginLeft: 10,
    width: 104,
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
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  lessonBadgeText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.heavy,
    fontSize: 13,
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
    marginTop: 8,
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
  lessonCancelledBadge: {
    backgroundColor: '#FCE8E7',
    borderRadius: 10,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  lessonCancelledBadgeText: {
    color: theme.colors.warning,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
  },
  lessonMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
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
    marginTop: 12,
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
    flex: 1,
    fontFamily: theme.fonts.heavy,
    fontSize: 24,
    lineHeight: 30,
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
