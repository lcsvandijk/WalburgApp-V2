import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appConfig } from '../constants/appConfig';
import { theme } from '../constants/theme';
import { useWalburgApp } from '../context/WalburgAppContext';
import { formatDayLabel, formatTime, getGreeting, isToday, isUpcomingAppointment } from '../lib/date';
import { combineAppointmentsForDisplay, formatLessonHoursLabel } from '../lib/schedule';
import { loadSchoolAgenda, loadSchoolNews } from '../services/walburgContent';
import { SchoolAgendaItem, SchoolNewsItem } from '../types/content';
import { HomeStackParamList } from '../types/navigation';

const shortDateFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
});

const newsDateFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatEventMoment(item: SchoolAgendaItem) {
  if (item.isAllDay) {
    return shortDateFormatter.format(new Date(item.start));
  }

  return `${shortDateFormatter.format(new Date(item.start))} | ${formatTime(item.start)}`;
}

function formatSyncLabel(value?: string) {
  if (!value) {
    return 'Nog niet gesynchroniseerd';
  }

  return `${formatDayLabel(value)} | ${formatTime(value)}`;
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { appointments, session } = useWalburgApp();
  const [agendaItems, setAgendaItems] = useState<SchoolAgendaItem[]>([]);
  const [newsItems, setNewsItems] = useState<SchoolNewsItem[]>([]);
  const [isContentLoading, setIsContentLoading] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);

  const isWideLayout = width >= appConfig.layout.landscapeWidth;

  useEffect(() => {
    let active = true;

    async function loadContent() {
      setIsContentLoading(true);
      setContentError(null);

      const [agendaResult, newsResult] = await Promise.allSettled([loadSchoolAgenda(), loadSchoolNews()]);

      if (!active) {
        return;
      }

      setAgendaItems(agendaResult.status === 'fulfilled' ? agendaResult.value : []);
      setNewsItems(newsResult.status === 'fulfilled' ? newsResult.value : []);

      const errors = [
        agendaResult.status === 'rejected' ? 'schoolagenda' : null,
        newsResult.status === 'rejected' ? 'nieuws' : null,
      ].filter(Boolean);

      setContentError(errors.length > 0 ? `Laden van ${errors.join(' en ')} mislukte.` : null);
      setIsContentLoading(false);
    }

    loadContent().catch((error) => {
      if (!active) {
        return;
      }

      setAgendaItems([]);
      setNewsItems([]);
      setContentError(error instanceof Error ? error.message : 'Inhoud laden mislukte.');
      setIsContentLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const now = new Date();
  const greeting = session?.firstName ? `${getGreeting()}, ${session.firstName}` : getGreeting();

  const todayAgenda = useMemo(
    () =>
      agendaItems
        .filter((item) => isToday(item.start, now))
        .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()),
    [agendaItems],
  );

  const todayLessons = useMemo(
    () => combineAppointmentsForDisplay(appointments.filter((appointment) => isToday(appointment.start, now))),
    [appointments],
  );

  const nextLesson = useMemo(
    () =>
      todayLessons
        .filter((appointment) => isUpcomingAppointment(appointment, now))
        .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())[0],
    [todayLessons],
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        contentContainerStyle={{ paddingBottom: 112 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[theme.colors.brandBlueDeep, theme.colors.brandBlue, theme.colors.brandCyan]}
          end={{ x: 1, y: 0.9 }}
          start={{ x: 0, y: 0 }}
          style={[styles.hero, { paddingTop: insets.top + 24 }]}
        >
          <View style={styles.heroInner}>
            <Text style={styles.heroTitle}>{greeting}</Text>
            {session ? <Text style={styles.heroMeta}>Laatste sync | {formatSyncLabel(session.lastSyncedAt)}</Text> : null}
          </View>
        </LinearGradient>

        <View style={styles.section}>
          <View style={styles.sectionInner}>
            <Text style={styles.sectionTitle}>Vandaag</Text>

            <View style={[styles.listCard, isWideLayout ? styles.featureCardWide : null]}>
              <Text style={styles.subsectionTitle}>Eerstvolgende les</Text>
              {!session ? (
                <Text style={styles.stateText}>Log in via profiel om je eerstvolgende les van vandaag te zien.</Text>
              ) : !nextLesson ? (
                <Text style={styles.stateText}>Er staat voor vandaag geen volgende les meer in je rooster.</Text>
              ) : (
                <>
                  <View style={styles.lessonHeader}>
                    <View style={styles.lessonCopy}>
                      <Text numberOfLines={appConfig.ui.previewLines} style={styles.lessonTitle}>
                        {nextLesson.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.lessonMeta}>
                        {formatLessonHoursLabel(nextLesson.lessonHours) ?? `${formatTime(nextLesson.start)} - ${formatTime(nextLesson.end)}`}
                      </Text>
                    </View>
                    <View style={styles.lessonBadge}>
                      <Text style={styles.lessonBadgeText}>{formatTime(nextLesson.start)}</Text>
                    </View>
                  </View>
                  <Text numberOfLines={appConfig.ui.previewLines} style={styles.lessonDetail}>
                    {nextLesson.subject} | {nextLesson.location}
                  </Text>
                  <Text numberOfLines={appConfig.ui.previewLines} style={styles.lessonDetail}>
                    {nextLesson.teachers}
                  </Text>
                  {nextLesson.description ? (
                    <Text numberOfLines={appConfig.ui.previewLines} style={styles.lessonDetail}>
                      {nextLesson.description}
                    </Text>
                  ) : null}
                </>
              )}
            </View>

            {isContentLoading && todayAgenda.length === 0 ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={theme.colors.brandBlue} />
              </View>
            ) : todayAgenda.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateText}>Er staan vandaag geen items in de schoolagenda.</Text>
              </View>
            ) : (
              <View style={[styles.listCard, isWideLayout ? styles.featureCardWide : null]}>
                <Text style={styles.subsectionTitle}>Schoolagenda</Text>
                {todayAgenda.map((item, index) => (
                  <View key={item.id} style={[styles.inlineBlock, index > 0 ? styles.inlineRowBorder : null]}>
                    <View style={styles.inlineCopy}>
                      <Text numberOfLines={appConfig.ui.previewLines} style={styles.inlineTitle}>
                        {item.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.inlineMeta}>
                        {formatEventMoment(item)}
                      </Text>
                    </View>
                    {item.description ? (
                      <Text numberOfLines={appConfig.ui.previewLines} style={styles.inlineMeta}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        <View style={styles.newsSection}>
          <View style={styles.newsSectionInner}>
            <View style={styles.newsHeader}>
              <Text style={styles.sectionTitle}>Nieuws</Text>
              <Text style={styles.newsHeaderMeta}>{appConfig.school.name}</Text>
            </View>

            {newsItems.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateText}>
                  {contentError ?? 'Er kon nog geen nieuws van de schoolsite worden geladen.'}
                </Text>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.newsCarousel}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {newsItems.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() =>
                      navigation.navigate('NewsArticle', {
                        articleId: item.id,
                        fallbackImageUrl: item.imageUrl,
                        fallbackPublishedAt: item.publishedAt,
                        fallbackTitle: item.title,
                      })
                    }
                    style={[styles.newsCard, isWideLayout ? styles.newsCardWide : null]}
                  >
                    {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.newsImage} /> : null}
                    <View style={styles.newsContent}>
                      <Text style={styles.newsDate}>{newsDateFormatter.format(new Date(item.publishedAt))}</Text>
                      <Text numberOfLines={appConfig.ui.previewLines} style={styles.newsTitle}>
                        {item.title}
                      </Text>
                      <Text numberOfLines={appConfig.ui.previewLines} style={styles.newsSummary}>
                        {item.summary}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  hero: {
    minHeight: 194,
    paddingBottom: 30,
    paddingHorizontal: 22,
  },
  heroInner: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    width: '100%',
  },
  heroTitle: {
    color: theme.colors.inkOnDark,
    fontFamily: theme.fonts.heavy,
    fontSize: 34,
    lineHeight: 40,
    maxWidth: 320,
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 14,
  },
  section: {
    paddingHorizontal: 18,
    paddingTop: 22,
  },
  sectionInner: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    width: '100%',
  },
  sectionTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 30,
    marginBottom: 14,
  },
  subsectionTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    marginBottom: 10,
  },
  listCard: {
    backgroundColor: theme.colors.paper,
    borderRadius: theme.radius.md,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  featureCardWide: {
    paddingHorizontal: 22,
    paddingVertical: 20,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    marginBottom: 14,
    minHeight: 88,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  stateText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  inlineBlock: {
    paddingVertical: 12,
  },
  inlineRowBorder: {
    borderTopColor: theme.colors.divider,
    borderTopWidth: 1,
  },
  inlineCopy: {
    flex: 1,
  },
  inlineTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    lineHeight: 22,
  },
  inlineMeta: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  lessonHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  lessonCopy: {
    flex: 1,
    paddingRight: 12,
  },
  lessonTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 24,
    lineHeight: 30,
  },
  lessonMeta: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
  },
  lessonBadge: {
    backgroundColor: '#E7F0FF',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lessonBadgeText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.heavy,
    fontSize: 14,
  },
  lessonDetail: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  newsSection: {
    paddingBottom: 8,
    paddingTop: 24,
  },
  newsSectionInner: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    width: '100%',
  },
  newsHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  newsHeaderMeta: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    marginBottom: 18,
    textTransform: 'uppercase',
  },
  newsCarousel: {
    gap: 14,
    paddingHorizontal: 18,
  },
  newsCard: {
    backgroundColor: theme.colors.paper,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    width: 286,
  },
  newsCardWide: {
    width: 360,
  },
  newsImage: {
    backgroundColor: '#D9E5F6',
    height: 164,
    width: '100%',
  },
  newsContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  newsDate: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    marginBottom: 10,
  },
  newsTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 20,
    lineHeight: 26,
  },
  newsSummary: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
});
