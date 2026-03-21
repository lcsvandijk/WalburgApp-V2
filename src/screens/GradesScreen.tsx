import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
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
import { formatDayLabel, formatTime } from '../lib/date';
import { MagisterGradeResult, MagisterSubjectAverage } from '../types/magister';

type GradesMode = 'recent' | 'averages';

function formatEnteredAt(value?: string | null) {
  if (!value) {
    return 'Moment onbekend';
  }

  return `${formatDayLabel(value)} | ${formatTime(value)}`;
}

function formatWeight(value?: string | null) {
  const normalized = value?.trim();

  if (!normalized) {
    return '1x';
  }

  return normalized.toLowerCase().endsWith('x') ? normalized : `${normalized}x`;
}

export function GradesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { grades, preferences, refreshAppData, session, subjectAverages } = useWalburgApp();
  const [mode, setMode] = useState<GradesMode>('recent');
  const [selectedGrade, setSelectedGrade] = useState<MagisterGradeResult | null>(null);
  const [selectedAverage, setSelectedAverage] = useState<MagisterSubjectAverage | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isWideLayout = width >= appConfig.layout.landscapeWidth;

  const sortedGrades = useMemo(
    () =>
      [...grades].sort((left, right) => {
        const leftTime = left.enteredAt ? new Date(left.enteredAt).getTime() : 0;
        const rightTime = right.enteredAt ? new Date(right.enteredAt).getTime() : 0;

        return rightTime - leftTime;
      }),
    [grades],
  );

  const sortedAverages = useMemo(
    () => [...subjectAverages].sort((left, right) => left.subject.localeCompare(right.subject, 'nl')),
    [subjectAverages],
  );

  function getAverageDisplay(item: MagisterSubjectAverage) {
    return preferences.roundAveragesToWholeNumbers ? item.roundedAverage ?? item.average : item.average;
  }

  async function handleRefresh() {
    if (!session) {
      return;
    }

    setIsRefreshing(true);

    try {
      await refreshAppData();
    } finally {
      setIsRefreshing(false);
    }
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
        <View style={styles.contentWrap}>
          <View style={styles.switchWrap}>
            <Pressable
              onPress={() => setMode('recent')}
              style={[styles.switchButton, mode === 'recent' ? styles.switchButtonActive : null]}
            >
              <Text style={[styles.switchText, mode === 'recent' ? styles.switchTextActive : null]}>Laatste cijfers</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('averages')}
              style={[styles.switchButton, mode === 'averages' ? styles.switchButtonActive : null]}
            >
              <Text style={[styles.switchText, mode === 'averages' ? styles.switchTextActive : null]}>Gemiddelden</Text>
            </Pressable>
          </View>

          {!session ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateText}>Je moet eerst inloggen voordat cijfers zichtbaar worden.</Text>
            </View>
          ) : mode === 'recent' ? (
            sortedGrades.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateText}>Er zijn nog geen recente cijfers geladen.</Text>
              </View>
            ) : (
              <View style={[styles.listCard, isWideLayout ? styles.listCardWide : null]}>
                {sortedGrades.map((grade, index) => (
                  <Pressable
                    key={grade.id}
                    onPress={() => setSelectedGrade(grade)}
                    style={[styles.listRow, index > 0 ? styles.listRowBorder : null]}
                  >
                    <View style={styles.listCopy}>
                      <Text numberOfLines={1} style={styles.listTitle}>
                        {grade.subject}
                      </Text>
                      <Text numberOfLines={1} style={styles.listSubtitle}>
                        {grade.title}
                      </Text>
                    </View>
                    <View style={styles.scoreColumn}>
                      <View style={styles.scoreBadge}>
                        <Text style={styles.scoreBadgeText}>{grade.grade}</Text>
                      </View>
                      <Text style={styles.scoreWeight}>{formatWeight(grade.weight)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )
          ) : sortedAverages.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateText}>Er zijn nog geen gewogen gemiddelden gevonden.</Text>
            </View>
          ) : (
            <View style={[styles.listCard, isWideLayout ? styles.listCardWide : null]}>
              {sortedAverages.map((item, index) => (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedAverage(item)}
                  style={[styles.listRow, index > 0 ? styles.listRowBorder : null]}
                >
                  <View style={styles.listCopy}>
                    <Text numberOfLines={1} style={styles.listTitle}>
                      {item.subject}
                    </Text>
                  </View>
                  <View style={styles.averageBadge}>
                    <Text style={styles.averageBadgeText}>{getAverageDisplay(item)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedGrade(null)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={Boolean(selectedGrade)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalCopy}>
                <Text style={styles.modalEyebrow}>Cijferdetail</Text>
                <Text style={styles.modalTitle}>{selectedGrade?.subject}</Text>
              </View>
              <Pressable onPress={() => setSelectedGrade(null)} style={styles.modalClose}>
                <Ionicons color={theme.colors.brandBlueDeep} name="close" size={20} />
              </Pressable>
            </View>

            {selectedGrade ? (
              <>
                <View style={styles.modalScoreWrap}>
                  <View style={styles.modalScoreBadge}>
                    <Text style={styles.modalScoreText}>{selectedGrade.grade}</Text>
                  </View>
                  <Text style={styles.modalScoreMeta}>Weging {formatWeight(selectedGrade.weight)}</Text>
                </View>

                <View style={styles.detailBlock}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Omschrijving</Text>
                    <Text style={styles.detailValue}>{selectedGrade.title}</Text>
                  </View>
                  <View style={[styles.detailRow, styles.detailRowBorder]}>
                    <Text style={styles.detailLabel}>Moment</Text>
                    <Text style={styles.detailValue}>{formatEnteredAt(selectedGrade.enteredAt)}</Text>
                  </View>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedAverage(null)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={Boolean(selectedAverage)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalCopy}>
                <Text style={styles.modalEyebrow}>Gewogen gemiddelde</Text>
                <Text style={styles.modalTitle}>{selectedAverage?.subject}</Text>
              </View>
              <Pressable onPress={() => setSelectedAverage(null)} style={styles.modalClose}>
                <Ionicons color={theme.colors.brandBlueDeep} name="close" size={20} />
              </Pressable>
            </View>

            {selectedAverage ? (
              <>
                <View style={styles.modalScoreWrap}>
                  <View style={[styles.modalScoreBadge, styles.modalScoreBadgeBlue]}>
                    <Text style={[styles.modalScoreText, styles.modalScoreTextBlue]}>{selectedAverage.average}</Text>
                  </View>
                  <Text style={styles.modalScoreMeta}>Berekend uit alle cijfers en wegingen van dit vak</Text>
                </View>

                <View style={styles.detailBlock}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Afgerond</Text>
                    <Text style={styles.detailValue}>{selectedAverage.roundedAverage ?? selectedAverage.average}</Text>
                  </View>
                  <View style={[styles.detailRow, styles.detailRowBorder]}>
                    <Text style={styles.detailLabel}>Exact gewogen</Text>
                    <Text style={styles.detailValue}>{selectedAverage.exactAverage ?? selectedAverage.average}</Text>
                  </View>
                  <View style={[styles.detailRow, styles.detailRowBorder]}>
                    <Text style={styles.detailLabel}>Aantal cijfers</Text>
                    <Text style={styles.detailValue}>{selectedAverage.gradeCount}</Text>
                  </View>
                </View>
              </>
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
  topInsetHeader: {
    backgroundColor: theme.colors.brandBlueDeep,
  },
  contentWrap: {
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    paddingHorizontal: 18,
    width: '100%',
  },
  switchWrap: {
    backgroundColor: '#E8F0FB',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    maxWidth: 860,
    padding: 6,
    width: '100%',
  },
  switchButton: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  switchButtonActive: {
    backgroundColor: theme.colors.brandBlue,
  },
  switchText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
  },
  switchTextActive: {
    color: theme.colors.inkOnDark,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 18,
    maxWidth: 860,
    minHeight: 132,
    paddingHorizontal: 18,
    paddingVertical: 18,
    width: '100%',
  },
  stateText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  listCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 18,
    overflow: 'hidden',
    width: '100%',
  },
  listCardWide: {
    maxWidth: 860,
  },
  listRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 92,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  listRowBorder: {
    borderTopColor: theme.colors.divider,
    borderTopWidth: 1,
  },
  listCopy: {
    flex: 1,
    paddingRight: 14,
  },
  listTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 18,
    lineHeight: 24,
  },
  listSubtitle: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  scoreColumn: {
    alignItems: 'center',
    minWidth: 68,
  },
  scoreBadge: {
    alignItems: 'center',
    backgroundColor: '#EFF6E0',
    borderRadius: 14,
    justifyContent: 'center',
    minWidth: 68,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  scoreBadgeText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 24,
  },
  scoreWeight: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    marginTop: 6,
  },
  averageBadge: {
    alignItems: 'center',
    backgroundColor: '#E8F0FB',
    borderRadius: 14,
    justifyContent: 'center',
    minWidth: 78,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  averageBadgeText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.heavy,
    fontSize: 24,
  },
  modalScrim: {
    alignItems: 'center',
    backgroundColor: 'rgba(14, 27, 51, 0.42)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: theme.colors.paper,
    borderRadius: 24,
    maxWidth: 520,
    padding: 20,
    width: '100%',
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  modalCopy: {
    flex: 1,
  },
  modalEyebrow: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  modalTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 28,
    lineHeight: 34,
    marginTop: 8,
  },
  modalClose: {
    alignItems: 'center',
    backgroundColor: '#EAF2FF',
    borderRadius: theme.radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  modalScoreWrap: {
    alignItems: 'center',
    marginTop: 22,
  },
  modalScoreBadge: {
    alignItems: 'center',
    backgroundColor: '#EFF6E0',
    borderRadius: 18,
    justifyContent: 'center',
    minWidth: 112,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalScoreBadgeBlue: {
    backgroundColor: '#E8F0FB',
  },
  modalScoreText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 34,
  },
  modalScoreTextBlue: {
    color: theme.colors.brandBlue,
  },
  modalScoreMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    textAlign: 'center',
  },
  detailBlock: {
    backgroundColor: '#F8FBFF',
    borderRadius: 18,
    marginTop: 22,
    overflow: 'hidden',
  },
  detailRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  detailRowBorder: {
    borderTopColor: theme.colors.divider,
    borderTopWidth: 1,
  },
  detailLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
});
