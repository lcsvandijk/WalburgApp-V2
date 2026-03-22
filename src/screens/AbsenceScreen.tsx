import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appConfig } from '../constants/appConfig';
import { theme } from '../constants/theme';
import { useWalburgApp } from '../context/WalburgAppContext';
import { formatDayLabel, formatTime } from '../lib/date';
import { extractAttendanceStudentId } from '../services/magisterAuth';
import { fetchAbsenceNoticesFromTokens, fetchLessonAbsencesFromTokens } from '../services/magister';
import { MagisterAbsenceNotice, MagisterLessonAbsence } from '../types/magister';
import { ProfileStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<ProfileStackParamList, 'AbsenceOverview'>;
type AbsenceTab = 'meldingen' | 'lessen';

function isNotice(item: MagisterAbsenceNotice | MagisterLessonAbsence): item is MagisterAbsenceNotice {
  return 'creatorName' in item;
}

function isLessonAbsence(item: MagisterAbsenceNotice | MagisterLessonAbsence): item is MagisterLessonAbsence {
  return 'appointmentTitle' in item;
}

function getAcademicYearRange() {
  const now = new Date();
  const currentYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;

  return {
    from: `${currentYear}-08-01`,
    to: `${currentYear + 1}-07-31`,
  };
}

function getAbsenceBubbleColor(code: string) {
  switch (code.toUpperCase()) {
    case 'ZK':
      return '#D9534F';
    case 'MB':
      return '#E6A23C';
    case 'GA':
      return '#4E8EE8';
    case 'SA':
      return '#4BB99A';
    case 'ST':
      return '#7A5BE8';
    default:
      return theme.colors.brandBlue;
  }
}

function formatRange(start: string, end: string) {
  return `${formatDayLabel(start)} | ${formatTime(start)} - ${formatTime(end)}`;
}

export function AbsenceScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useWalburgApp();
  const attendanceStudentId =
    session?.attendanceStudentId ??
    (session?.accessToken
      ? extractAttendanceStudentId({ accessToken: session.accessToken, idToken: session.idToken })
      : undefined);
  const [activeTab, setActiveTab] = useState<AbsenceTab>('meldingen');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [absenceNotices, setAbsenceNotices] = useState<MagisterAbsenceNotice[]>([]);
  const [lessonAbsences, setLessonAbsences] = useState<MagisterLessonAbsence[]>([]);
  const [selectedItem, setSelectedItem] = useState<MagisterAbsenceNotice | MagisterLessonAbsence | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAbsences() {
      if (!session?.accessToken) {
        setError('Log opnieuw in om afwezigheid op te halen.');
        setIsLoading(false);
        return;
      }

      const range = getAcademicYearRange();
      setIsLoading(true);
      setError(null);

      try {
        const [nextNotices, nextLessonAbsences] = await Promise.all([
          attendanceStudentId
            ? fetchAbsenceNoticesFromTokens(session, attendanceStudentId).catch(() => [])
            : Promise.resolve([]),
          fetchLessonAbsencesFromTokens(session, session.personId ?? session.id, range.from, range.to).catch(() => []),
        ]);

        if (!active) {
          return;
        }

        setAbsenceNotices(nextNotices);
        setLessonAbsences(nextLessonAbsences);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Afwezigheid laden mislukte.');
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadAbsences().catch(() => {
      return;
    });

    return () => {
      active = false;
    };
  }, [attendanceStudentId, session]);

  const visibleItems = useMemo(
    () => (activeTab === 'meldingen' ? absenceNotices : lessonAbsences),
    [absenceNotices, activeTab, lessonAbsences],
  );

  const noticesUnavailable = activeTab === 'meldingen' && !attendanceStudentId;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 112 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[theme.colors.brandBlueDeep, theme.colors.brandBlue, theme.colors.brandCyan]}
          end={{ x: 1, y: 0.9 }}
          start={{ x: 0, y: 0 }}
          style={[styles.hero, { paddingTop: insets.top + 18 }]}
        >
          <View style={styles.heroInner}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons color={theme.colors.inkOnDark} name="arrow-back" size={20} />
            </Pressable>
            <Text style={styles.heroEyebrow}>Profiel</Text>
            <Text style={styles.heroTitle}>Afwezigheid</Text>
            <Text style={styles.heroText}>
              Bekijk meldingen en lesgebonden absenties in twee duidelijke overzichten.
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.switcher}>
            <Pressable
              onPress={() => setActiveTab('meldingen')}
              style={[styles.switcherOption, activeTab === 'meldingen' ? styles.switcherOptionActive : null]}
            >
              <Text style={[styles.switcherText, activeTab === 'meldingen' ? styles.switcherTextActive : null]}>
                Meldingen
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('lessen')}
              style={[styles.switcherOption, activeTab === 'lessen' ? styles.switcherOptionActive : null]}
            >
              <Text style={[styles.switcherText, activeTab === 'lessen' ? styles.switcherTextActive : null]}>
                Lessen
              </Text>
            </Pressable>
          </View>

          {isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={theme.colors.brandBlue} />
              <Text style={styles.stateText}>Afwezigheid laden...</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <Ionicons color={theme.colors.warning} name="warning-outline" size={20} />
              <Text style={styles.stateText}>{error}</Text>
            </View>
          ) : noticesUnavailable ? (
            <View style={styles.stateCard}>
              <Ionicons color={theme.colors.brandBlue} name="information-circle-outline" size={20} />
              <Text style={styles.stateText}>
                Meldingen uit attendance zijn voor deze sessie niet beschikbaar, maar lesabsenties werken wel.
              </Text>
            </View>
          ) : visibleItems.length === 0 ? (
            <View style={styles.stateCard}>
              <Ionicons color={theme.colors.brandBlue} name="checkmark-circle-outline" size={20} />
              <Text style={styles.stateText}>Er zijn hier nu geen items gevonden.</Text>
            </View>
          ) : (
            visibleItems.map((item) => {
              const code = item.code;
              const title = item.description;
              const secondaryText =
                isLessonAbsence(item)
                  ? `${item.lessonHour ? `Lesuur ${item.lessonHour} | ` : ''}${item.appointmentTitle ?? 'Lesafspraak'}`
                  : item.creatorName ?? 'Magistermelding';

              return (
                <Pressable key={item.id} onPress={() => setSelectedItem(item)} style={styles.absenceCard}>
                  <View style={[styles.codeBubble, { backgroundColor: getAbsenceBubbleColor(code) }]}>
                    <Text style={styles.codeBubbleText}>{code}</Text>
                  </View>
                  <View style={styles.absenceCopy}>
                    <Text style={styles.absenceTitle}>{title}</Text>
                    <Text numberOfLines={1} style={styles.absenceMeta}>
                      {secondaryText}
                    </Text>
                    <Text style={styles.absenceDate}>{formatRange(item.start, item.end)}</Text>
                  </View>
                  <Ionicons color={theme.colors.brandBlue} name="chevron-forward" size={18} />
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal animationType="fade" onRequestClose={() => setSelectedItem(null)} statusBarTranslucent transparent visible={Boolean(selectedItem)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={[styles.codeBubble, { backgroundColor: getAbsenceBubbleColor(selectedItem?.code ?? '-') }]}>
                <Text style={styles.codeBubbleText}>{selectedItem?.code ?? '-'}</Text>
              </View>
              <Pressable onPress={() => setSelectedItem(null)} style={styles.closeButton}>
                <Ionicons color={theme.colors.brandBlueDeep} name="close" size={18} />
              </Pressable>
            </View>
            <Text style={styles.modalTitle}>{selectedItem?.description}</Text>
            {selectedItem ? <Text style={styles.modalMeta}>{formatRange(selectedItem.start, selectedItem.end)}</Text> : null}
            {selectedItem && isNotice(selectedItem) && selectedItem.creatorName ? (
              <Text style={styles.modalParagraph}>Aangemaakt door: {selectedItem.creatorName}</Text>
            ) : null}
            {selectedItem && isNotice(selectedItem) && selectedItem.modifiedByName ? (
              <Text style={styles.modalParagraph}>Laatst aangepast door: {selectedItem.modifiedByName}</Text>
            ) : null}
            {selectedItem && isLessonAbsence(selectedItem) && selectedItem.appointmentTitle ? (
              <Text style={styles.modalParagraph}>Les: {selectedItem.appointmentTitle}</Text>
            ) : null}
            {selectedItem && isLessonAbsence(selectedItem) && selectedItem.appointmentLocation ? (
              <Text style={styles.modalParagraph}>Lokaal: {selectedItem.appointmentLocation}</Text>
            ) : null}
            {selectedItem && isLessonAbsence(selectedItem) && selectedItem.appointmentContent ? (
              <Text style={styles.modalParagraph}>{selectedItem.appointmentContent}</Text>
            ) : null}
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
  hero: {
    minHeight: 228,
    paddingBottom: 28,
    paddingHorizontal: 18,
  },
  heroInner: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    width: '100%',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.76)',
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    marginTop: 18,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: theme.colors.inkOnDark,
    fontFamily: theme.fonts.heavy,
    fontSize: 32,
    lineHeight: 38,
    marginTop: 10,
  },
  heroText: {
    color: 'rgba(255,255,255,0.84)',
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    maxWidth: 560,
  },
  content: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    paddingHorizontal: 18,
    paddingTop: 20,
    width: '100%',
  },
  switcher: {
    backgroundColor: '#E8F0FB',
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    marginBottom: 16,
    padding: 4,
  },
  switcherOption: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    flex: 1,
    paddingVertical: 10,
  },
  switcherOptionActive: {
    backgroundColor: theme.colors.paper,
  },
  switcherText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
  },
  switcherTextActive: {
    color: theme.colors.brandBlueDeep,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  stateText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    textAlign: 'center',
  },
  absenceCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  codeBubble: {
    alignItems: 'center',
    borderRadius: 16,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  codeBubbleText: {
    color: theme.colors.inkOnDark,
    fontFamily: theme.fonts.heavy,
    fontSize: 13,
  },
  absenceCopy: {
    flex: 1,
  },
  absenceTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 16,
  },
  absenceMeta: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    marginTop: 6,
  },
  absenceDate: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    marginTop: 5,
  },
  modalScrim: {
    alignItems: 'center',
    backgroundColor: 'rgba(14, 27, 51, 0.48)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: theme.colors.paper,
    borderRadius: 24,
    maxWidth: 520,
    paddingHorizontal: 20,
    paddingVertical: 20,
    width: '100%',
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  modalTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 22,
    lineHeight: 28,
    marginTop: 14,
  },
  modalMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    marginTop: 8,
  },
  modalParagraph: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
});
