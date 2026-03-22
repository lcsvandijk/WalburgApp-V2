import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import {
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

import { GradeTrendChart } from '../components/GradeTrendChart';
import { appConfig } from '../constants/appConfig';
import { theme } from '../constants/theme';
import { useWalburgApp } from '../context/WalburgAppContext';
import { formatDayLabel, formatTime } from '../lib/date';
import { MagisterGradeResult, MagisterSubjectAverage } from '../types/magister';
import { RootTabParamList } from '../types/navigation';

type GradesMode = 'recent' | 'averages';
type GradeSortOption = 'recent' | 'highest' | 'lowest';
type AverageCalculatorMode = 'numeric' | 'qualitative';

const QUALITATIVE_GRADE_VALUES: Record<string, number> = {
  O: 1,
  V: 2,
  G: 3,
  U: 4,
};

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

function parseGradeNumber(value: string) {
  const normalized = Number(value.replace(',', '.'));

  if (Number.isFinite(normalized)) {
    return normalized;
  }

  const qualitativeValue = QUALITATIVE_GRADE_VALUES[value.trim().toUpperCase()];
  return Number.isFinite(qualitativeValue) ? qualitativeValue : null;
}

function formatGradeDisplay(value: number, scale: AverageCalculatorMode) {
  if (scale === 'qualitative') {
    const rounded = Math.min(4, Math.max(1, Math.round(value)));

    return (
      Object.entries(QUALITATIVE_GRADE_VALUES).find(([, numericValue]) => numericValue === rounded)?.[0] ??
      'O'
    );
  }

  return value.toFixed(1).replace('.', ',');
}

export function GradesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const route = useRoute<RouteProp<RootTabParamList, 'Cijfers'>>();
  const { grades, preferences, refreshAppData, session, subjectAverages } = useWalburgApp();
  const [mode, setMode] = useState<GradesMode>('recent');
  const [selectedGrade, setSelectedGrade] = useState<MagisterGradeResult | null>(null);
  const [selectedAverage, setSelectedAverage] = useState<MagisterSubjectAverage | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [gradeSearchQuery, setGradeSearchQuery] = useState('');
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [gradeSort, setGradeSort] = useState<GradeSortOption>('recent');
  const [minimumGrade, setMinimumGrade] = useState('');
  const [maximumGrade, setMaximumGrade] = useState('');
  const [requiredAverageTarget, setRequiredAverageTarget] = useState('');
  const [requiredGradeWeight, setRequiredGradeWeight] = useState('');
  const [projectedGradeInput, setProjectedGradeInput] = useState('');
  const [projectedGradeWeight, setProjectedGradeWeight] = useState('');
  const isWideLayout = width >= appConfig.layout.landscapeWidth;

  const availableSubjects = useMemo(
    () => Array.from(new Set(grades.map((grade) => grade.subject))).sort((left, right) => left.localeCompare(right, 'nl')),
    [grades],
  );

  const filteredGrades = useMemo(() => {
    const normalizedQuery = gradeSearchQuery.trim().toLowerCase();
    const minValue = minimumGrade ? parseGradeNumber(minimumGrade) : null;
    const maxValue = maximumGrade ? parseGradeNumber(maximumGrade) : null;

    const nextGrades = [...grades]
      .filter((grade) => {
        if (selectedSubjects.length > 0 && !selectedSubjects.includes(grade.subject)) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const haystack = `${grade.subject} ${grade.title} ${grade.grade}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .filter((grade) => {
        const numericGrade = parseGradeNumber(grade.grade);

        if (minValue != null && (numericGrade == null || numericGrade < minValue)) {
          return false;
        }

        if (maxValue != null && (numericGrade == null || numericGrade > maxValue)) {
          return false;
        }

        return true;
      });

    return nextGrades.sort((left, right) => {
      if (gradeSort === 'highest') {
        return (parseGradeNumber(right.grade) ?? 0) - (parseGradeNumber(left.grade) ?? 0);
      }

      if (gradeSort === 'lowest') {
        return (parseGradeNumber(left.grade) ?? 0) - (parseGradeNumber(right.grade) ?? 0);
      }

      const leftTime = left.enteredAt ? new Date(left.enteredAt).getTime() : 0;
      const rightTime = right.enteredAt ? new Date(right.enteredAt).getTime() : 0;

      return rightTime - leftTime;
    });
  }, [gradeSearchQuery, gradeSort, grades, maximumGrade, minimumGrade, selectedSubjects]);

  const sortedAverages = useMemo(
    () => [...subjectAverages].sort((left, right) => left.subject.localeCompare(right.subject, 'nl')),
    [subjectAverages],
  );
  const selectedAverageGrades = useMemo(
    () =>
      selectedAverage
        ? grades
            .filter((grade) => grade.subject === selectedAverage.subject)
            .sort((left, right) => {
              const leftTime = left.enteredAt ? new Date(left.enteredAt).getTime() : 0;
              const rightTime = right.enteredAt ? new Date(right.enteredAt).getTime() : 0;
              return leftTime - rightTime;
            })
        : [],
    [grades, selectedAverage],
  );
  const selectedAverageNumber = useMemo(
    () => selectedAverage?.numericAverage ?? (selectedAverage?.exactAverage ? parseGradeNumber(selectedAverage.exactAverage) : null),
    [selectedAverage],
  );
  const selectedAverageScale = (selectedAverage?.scale ?? 'numeric') as AverageCalculatorMode;
  const selectedAverageWeightTotal = useMemo(
    () =>
      selectedAverage?.weightTotal ??
      selectedAverageGrades.reduce((total, grade) => total + (parseGradeNumber(grade.weight ?? '1') ?? 1), 0),
    [selectedAverage, selectedAverageGrades],
  );
  const requiredGradeResult = useMemo(() => {
    if (selectedAverageScale !== 'numeric' || selectedAverageNumber == null || selectedAverageWeightTotal <= 0) {
      return null;
    }

    const desiredAverage = parseGradeNumber(requiredAverageTarget);
    const nextWeight = parseGradeNumber(requiredGradeWeight);

    if (desiredAverage == null || nextWeight == null || nextWeight <= 0) {
      return null;
    }

    return (
      (desiredAverage * (selectedAverageWeightTotal + nextWeight) - selectedAverageNumber * selectedAverageWeightTotal) /
      nextWeight
    );
  }, [requiredAverageTarget, requiredGradeWeight, selectedAverageNumber, selectedAverageScale, selectedAverageWeightTotal]);
  const projectedAverageResult = useMemo(() => {
    if (selectedAverageScale !== 'numeric' || selectedAverageNumber == null || selectedAverageWeightTotal <= 0) {
      return null;
    }

    const nextGrade = parseGradeNumber(projectedGradeInput);
    const nextWeight = parseGradeNumber(projectedGradeWeight);

    if (nextGrade == null || nextWeight == null || nextWeight <= 0) {
      return null;
    }

    return (
      (selectedAverageNumber * selectedAverageWeightTotal + nextGrade * nextWeight) /
      (selectedAverageWeightTotal + nextWeight)
    );
  }, [projectedGradeInput, projectedGradeWeight, selectedAverageNumber, selectedAverageScale, selectedAverageWeightTotal]);

  const activeFilterCount = [
    selectedSubjects.length > 0,
    minimumGrade.length > 0,
    maximumGrade.length > 0,
    gradeSort !== 'recent',
  ].filter(Boolean).length;

  useEffect(() => {
    setRequiredAverageTarget('');
    setRequiredGradeWeight('');
    setProjectedGradeInput('');
    setProjectedGradeWeight('');
  }, [selectedAverage?.id]);

  useEffect(() => {
    const focusGradeId = route.params?.focusGradeId;

    if (!focusGradeId) {
      return;
    }

    const nextSelectedGrade = grades.find((grade) => grade.id === focusGradeId);

    if (!nextSelectedGrade) {
      return;
    }

    setMode('recent');
    setSelectedGrade(nextSelectedGrade);
  }, [grades, route.params?.focusGradeId, route.params?.focusNonce]);

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

          {session && mode === 'recent' ? (
            <>
              <View style={styles.filterBar}>
                <View style={styles.searchWrap}>
                  <Ionicons color={theme.colors.brandBlue} name="search" size={18} />
                  <TextInput
                    onChangeText={setGradeSearchQuery}
                    placeholder="Zoek in cijfers"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.searchInput}
                    value={gradeSearchQuery}
                  />
                  {gradeSearchQuery ? (
                    <Pressable onPress={() => setGradeSearchQuery('')} style={styles.filterIconButtonInline}>
                      <Ionicons color={theme.colors.brandBlue} name="close-circle" size={18} />
                    </Pressable>
                  ) : null}
                </View>
                <Pressable onPress={() => setIsFilterModalVisible(true)} style={styles.filterButton}>
                  <Ionicons color={theme.colors.brandBlue} name="options-outline" size={18} />
                  <Text style={styles.filterButtonText}>
                    Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                  </Text>
                </Pressable>
              </View>

              {activeFilterCount > 0 ? (
                <Text style={styles.filterSummary}>
                  {selectedSubjects.length > 0 ? `${selectedSubjects.length} vakken` : null}
                  {selectedSubjects.length > 0 && (minimumGrade || maximumGrade || gradeSort !== 'recent') ? ' | ' : ''}
                  {minimumGrade || maximumGrade ? `Cijfer ${minimumGrade || '0'}-${maximumGrade || '10'}` : null}
                  {(selectedSubjects.length > 0 || minimumGrade || maximumGrade) && gradeSort !== 'recent' ? ' | ' : ''}
                  {gradeSort === 'highest' ? 'Hoog naar laag' : gradeSort === 'lowest' ? 'Laag naar hoog' : null}
                </Text>
              ) : null}
            </>
          ) : null}

          {!session ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateText}>Je moet eerst inloggen voordat cijfers zichtbaar worden.</Text>
            </View>
          ) : mode === 'recent' ? (
            filteredGrades.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateText}>Er zijn geen cijfers gevonden met deze filters.</Text>
              </View>
            ) : (
              <View style={[styles.listCard, isWideLayout ? styles.listCardWide : null]}>
                {filteredGrades.map((grade, index) => (
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
            <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
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
                      <Text style={styles.detailValue}>
                        {selectedAverage.scale === 'qualitative'
                          ? `${selectedAverage.average} | ${selectedAverage.exactAverage ?? '-'}`
                          : selectedAverage.exactAverage ?? selectedAverage.average}
                      </Text>
                    </View>
                    <View style={[styles.detailRow, styles.detailRowBorder]}>
                      <Text style={styles.detailLabel}>Aantal cijfers</Text>
                      <Text style={styles.detailValue}>{selectedAverage.gradeCount}</Text>
                    </View>
                  </View>

                  <View style={styles.chartBlock}>
                    <Text style={styles.chartLabel}>Cijferverloop</Text>
                    <Text style={styles.chartDescription}>
                      {selectedAverage.scale === 'qualitative'
                        ? 'Voor O/V/G/U-vakken tonen we het gemiddelde zonder grafiek.'
                        : 'Alle ingevoerde cijfers van dit vak in een snelle trend.'}
                    </Text>
                    {selectedAverage.scale === 'qualitative' ? null : (
                      <GradeTrendChart average={selectedAverageNumber} grades={selectedAverageGrades} />
                    )}
                  </View>

                  <View style={styles.calculatorBlock}>
                    <Text style={styles.chartLabel}>Cijfercalculator</Text>
                    <Text style={styles.chartDescription}>
                      {selectedAverage.scale === 'qualitative'
                        ? 'Deze rekenhulp werkt alleen voor vakken met cijfergemiddelden.'
                        : 'Reken meteen uit wat je moet halen of waar je dan op uitkomt.'}
                    </Text>
                    {selectedAverage.scale === 'qualitative' ? null : (
                      <>
                        <View style={styles.calculatorCard}>
                          <Text style={styles.calculatorTitle}>Wat moet ik halen?</Text>
                          <View style={styles.calculatorInputRow}>
                            <View style={styles.calculatorInputWrap}>
                              <Text style={styles.rangeLabel}>Doelgemiddelde</Text>
                              <TextInput
                                keyboardType="decimal-pad"
                                onChangeText={setRequiredAverageTarget}
                                placeholder="7,5"
                                placeholderTextColor={theme.colors.textMuted}
                                style={styles.rangeInput}
                                value={requiredAverageTarget}
                              />
                            </View>
                            <View style={styles.calculatorInputWrap}>
                              <Text style={styles.rangeLabel}>Weging toets</Text>
                              <TextInput
                                keyboardType="decimal-pad"
                                onChangeText={setRequiredGradeWeight}
                                placeholder="2"
                                placeholderTextColor={theme.colors.textMuted}
                                style={styles.rangeInput}
                                value={requiredGradeWeight}
                              />
                            </View>
                          </View>
                          <Text style={styles.calculatorResult}>
                            {requiredGradeResult == null
                              ? 'Vul een doelgemiddelde en weging in.'
                              : `Je moet halen: ${formatGradeDisplay(requiredGradeResult, 'numeric')}`}
                          </Text>
                        </View>

                        <View style={styles.calculatorCard}>
                          <Text style={styles.calculatorTitle}>Wat ga ik staan?</Text>
                          <View style={styles.calculatorInputRow}>
                            <View style={styles.calculatorInputWrap}>
                              <Text style={styles.rangeLabel}>Cijfer toets</Text>
                              <TextInput
                                keyboardType="decimal-pad"
                                onChangeText={setProjectedGradeInput}
                                placeholder="8,1"
                                placeholderTextColor={theme.colors.textMuted}
                                style={styles.rangeInput}
                                value={projectedGradeInput}
                              />
                            </View>
                            <View style={styles.calculatorInputWrap}>
                              <Text style={styles.rangeLabel}>Weging toets</Text>
                              <TextInput
                                keyboardType="decimal-pad"
                                onChangeText={setProjectedGradeWeight}
                                placeholder="2"
                                placeholderTextColor={theme.colors.textMuted}
                                style={styles.rangeInput}
                                value={projectedGradeWeight}
                              />
                            </View>
                          </View>
                          <Text style={styles.calculatorResult}>
                            {projectedAverageResult == null
                              ? 'Vul een cijfer en weging in.'
                              : `Nieuw gemiddelde: ${formatGradeDisplay(projectedAverageResult, 'numeric')}`}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsFilterModalVisible(false)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={isFilterModalVisible}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalCopy}>
                <Text style={styles.modalEyebrow}>Filters</Text>
                <Text style={styles.modalTitle}>Cijfers filteren</Text>
              </View>
              <Pressable onPress={() => setIsFilterModalVisible(false)} style={styles.modalClose}>
                <Ionicons color={theme.colors.brandBlueDeep} name="close" size={20} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.filterModalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.filterSectionTitle}>Sorteren</Text>
              <View style={styles.sortRow}>
                {([
                  { label: 'Recent', value: 'recent' },
                  { label: 'Hoog-laag', value: 'highest' },
                  { label: 'Laag-hoog', value: 'lowest' },
                ] as Array<{ label: string; value: GradeSortOption }>).map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => setGradeSort(option.value)}
                    style={[styles.sortChip, gradeSort === option.value ? styles.sortChipActive : null]}
                  >
                    <Text style={[styles.sortChipText, gradeSort === option.value ? styles.sortChipTextActive : null]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.filterSectionTitle}>Vak</Text>
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                style={styles.subjectScroller}
                contentContainerStyle={styles.subjectGrid}
              >
                {availableSubjects.map((subject) => {
                  const isActive = selectedSubjects.includes(subject);

                  return (
                    <Pressable
                      key={subject}
                      onPress={() =>
                        setSelectedSubjects((current) =>
                          current.includes(subject)
                            ? current.filter((value) => value !== subject)
                            : [...current, subject],
                        )
                      }
                      style={[styles.subjectChip, isActive ? styles.subjectChipActive : null]}
                    >
                      <Text style={[styles.subjectChipText, isActive ? styles.subjectChipTextActive : null]}>
                        {subject}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.filterSectionTitle}>Cijferbereik</Text>
              <View style={styles.rangeRow}>
                <View style={styles.rangeInputWrap}>
                  <Text style={styles.rangeLabel}>Min</Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    onChangeText={setMinimumGrade}
                    placeholder="0,0"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.rangeInput}
                    value={minimumGrade}
                  />
                </View>
                <View style={styles.rangeInputWrap}>
                  <Text style={styles.rangeLabel}>Max</Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    onChangeText={setMaximumGrade}
                    placeholder="10,0"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.rangeInput}
                    value={maximumGrade}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.filterActionRow}>
              <Pressable
                onPress={() => {
                  setSelectedSubjects([]);
                  setMinimumGrade('');
                  setMaximumGrade('');
                  setGradeSort('recent');
                }}
                style={styles.filterSecondaryButton}
              >
                <Text style={styles.filterSecondaryButtonText}>Reset</Text>
              </Pressable>
              <Pressable onPress={() => setIsFilterModalVisible(false)} style={styles.filterPrimaryButton}>
                <Text style={styles.filterPrimaryButtonText}>Toepassen</Text>
              </Pressable>
            </View>
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
  filterBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    maxWidth: 860,
    width: '100%',
  },
  searchWrap: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: 48,
    paddingLeft: 14,
    paddingRight: 8,
  },
  searchInput: {
    color: theme.colors.text,
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    minHeight: 48,
    paddingHorizontal: 10,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  filterButtonText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
  },
  filterIconButtonInline: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  filterSummary: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
    maxWidth: 860,
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
    maxHeight: '82%',
    maxWidth: 520,
    padding: 20,
    width: '100%',
  },
  modalScrollContent: {
    paddingBottom: 2,
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
  filterSectionTitle: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    marginTop: 18,
    textTransform: 'uppercase',
  },
  filterModalScrollContent: {
    paddingBottom: 4,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  sortChip: {
    backgroundColor: '#E8F0FB',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sortChipActive: {
    backgroundColor: theme.colors.brandBlue,
  },
  sortChipText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
  },
  sortChipTextActive: {
    color: theme.colors.inkOnDark,
  },
  subjectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 4,
  },
  subjectScroller: {
    marginTop: 12,
    maxHeight: 186,
  },
  subjectChip: {
    backgroundColor: '#F3F7FD',
    borderColor: theme.colors.divider,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  subjectChipActive: {
    backgroundColor: theme.colors.brandBlue,
    borderColor: theme.colors.brandBlue,
  },
  subjectChipText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
  },
  subjectChipTextActive: {
    color: theme.colors.inkOnDark,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  rangeInputWrap: {
    backgroundColor: '#F8FBFF',
    borderColor: theme.colors.divider,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rangeLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  rangeInput: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    marginTop: 8,
    minHeight: 24,
    padding: 0,
  },
  filterActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  filterSecondaryButton: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  filterSecondaryButtonText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 14,
  },
  filterPrimaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.brandBlue,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  filterPrimaryButtonText: {
    color: theme.colors.inkOnDark,
    fontFamily: theme.fonts.heavy,
    fontSize: 14,
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
  chartBlock: {
    marginTop: 22,
  },
  chartLabel: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  chartDescription: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  calculatorBlock: {
    marginTop: 22,
  },
  calculatorCard: {
    backgroundColor: '#F7FAFF',
    borderColor: theme.colors.divider,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  calculatorTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
  },
  calculatorInputRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  calculatorInputWrap: {
    flex: 1,
  },
  calculatorResult: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
});
