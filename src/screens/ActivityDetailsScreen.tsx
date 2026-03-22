import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
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
import { formatDisplayLocation } from '../lib/location';
import { loadDemoActivityElements } from '../services/demoContent';
import {
  fetchActivityElementsFromTokens,
  subscribeToActivityElement,
  unsubscribeFromActivityElement,
} from '../services/magister';
import { MagisterActivityElement } from '../types/magister';
import { ScheduleStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<ScheduleStackParamList, 'ActivityDetails'>;

function formatMoment(value?: string | null) {
  if (!value) {
    return null;
  }

  return `${formatDayLabel(value)} | ${formatTime(value)}`;
}

export function ActivityDetailsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { isDemoMode, session } = useWalburgApp();
  const [elements, setElements] = useState<MagisterActivityElement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingElementId, setPendingElementId] = useState<number | null>(null);
  const { activityId, details, selfLink, subscriptionEnd, subscriptionStart, title, visibleFrom, visibleTo } = route.params;

  const registeredCount = useMemo(
    () => elements.filter((element) => element.isSubscribed).length,
    [elements],
  );

  const loadElements = useCallback(async () => {
    if (isDemoMode) {
      try {
        const nextElements = await loadDemoActivityElements(activityId);
        setElements(nextElements);
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Activiteiten laden mislukte.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }

      return;
    }

    if (!session?.accessToken) {
      setElements([]);
      setIsLoading(false);
      return;
    }

    try {
      const personId = session.personId ?? session.id;
      const nextElements = await fetchActivityElementsFromTokens(session, personId, activityId, selfLink);
      setElements(nextElements);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Activiteiten laden mislukte.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activityId, isDemoMode, selfLink, session]);

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    setIsLoading(true);
    loadElements().catch(() => {
      return;
    });
  }, [loadElements]);

  async function handleToggle(element: MagisterActivityElement) {
    if (isDemoMode) {
      setElements((current) =>
        current.map((item) => {
          if (item.elementId !== element.elementId) {
            return item;
          }

          if (item.isMandatory) {
            return item;
          }

          return {
            ...item,
            isSubscribed: !item.isSubscribed,
          };
        }),
      );
      return;
    }

    if (!session?.accessToken || !element.subscriptionLink) {
      return;
    }

    setPendingElementId(element.elementId);

    try {
      const personId = session.personId ?? session.id;

      if (element.isSubscribed && !element.isMandatory) {
        await unsubscribeFromActivityElement(session, element.subscriptionLink);
      } else if (!element.isSubscribed) {
        await subscribeToActivityElement(session, element.subscriptionLink, personId, activityId, element.elementId);
      }

      await loadElements();
    } catch (error) {
      Alert.alert('Actie mislukt', error instanceof Error ? error.message : 'Onbekende fout.');
    } finally {
      setPendingElementId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 112 + insets.bottom, paddingTop: insets.top + 12 }}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              setIsRefreshing(true);
              loadElements().catch(() => {
                return;
              });
            }}
            refreshing={isRefreshing}
            tintColor={theme.colors.brandBlue}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWrap}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons color={theme.colors.brandBlueDeep} name="arrow-back" size={18} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Activiteit</Text>
              <Text style={styles.title}>{title}</Text>
            </View>
          </View>

          <View style={styles.heroCard}>
            {details ? <Text style={styles.heroText}>{details}</Text> : null}
            {subscriptionStart ? <Text style={styles.metaLine}>Start inschrijven | {formatMoment(subscriptionStart)}</Text> : null}
            {subscriptionEnd ? <Text style={styles.metaLine}>Einde inschrijven | {formatMoment(subscriptionEnd)}</Text> : null}
            {visibleFrom ? <Text style={styles.metaLine}>Zichtbaar vanaf | {formatMoment(visibleFrom)}</Text> : null}
            {visibleTo ? <Text style={styles.metaLine}>Zichtbaar tot | {formatMoment(visibleTo)}</Text> : null}
            <Text style={styles.metaStrong}>
              {registeredCount > 0 ? `${registeredCount} keuze${registeredCount === 1 ? '' : 's'} actief` : 'Nog niet ingeschreven'}
            </Text>
          </View>

          {errorMessage ? (
            <View style={styles.errorCard}>
              <Ionicons color={theme.colors.warning} name="warning-outline" size={18} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={theme.colors.brandBlue} />
            </View>
          ) : elements.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateText}>Geen onderdelen gevonden voor deze activiteit.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {elements.map((element) => {
                const isBusy = pendingElementId === element.elementId;
                const isDisabled =
                  isBusy ||
                  !element.subscriptionLink ||
                  (element.isMandatory && element.isSubscribed) ||
                  (!element.isSubscribed && !element.canSubscribe);

                return (
                  <View key={element.id} style={[styles.elementCard, element.isSubscribed ? styles.elementCardActive : null]}>
                    <View style={styles.elementHeader}>
                      <View style={styles.elementCopy}>
                        <Text style={styles.elementTitle}>{element.topic ?? element.title}</Text>
                        <Text style={styles.elementMeta}>
                          {[element.subjectCode, element.teacherCode, formatDisplayLocation(element.room), element.variantCode]
                            .filter(Boolean)
                            .join(' | ')}
                        </Text>
                      </View>
                      <Pressable
                        disabled={isDisabled}
                        onPress={() => handleToggle(element)}
                        style={[
                          styles.actionCircle,
                          element.isSubscribed ? styles.actionCircleActive : null,
                          isDisabled ? styles.actionCircleDisabled : null,
                        ]}
                      >
                        {isBusy ? (
                          <ActivityIndicator color={element.isSubscribed ? theme.colors.brandBlueDeep : theme.colors.inkOnDark} size="small" />
                        ) : (
                          <Ionicons
                            color={element.isSubscribed ? theme.colors.brandBlueDeep : theme.colors.inkOnDark}
                            name={
                              element.isSubscribed
                                ? element.isMandatory
                                  ? 'lock-closed-outline'
                                  : 'remove'
                                : 'add'
                            }
                            size={18}
                          />
                        )}
                      </Pressable>
                    </View>

                    {element.details ? <Text style={styles.elementDescription}>{element.details}</Text> : null}

                    <View style={styles.statsRow}>
                      {element.availableSeats != null ? (
                        <View style={styles.statChip}>
                          <Ionicons color={theme.colors.brandBlue} name="people-outline" size={15} />
                          <Text style={styles.statChipText}>{element.availableSeats} plekken vrij</Text>
                        </View>
                      ) : null}
                      {element.subscriptionEnd ? (
                        <View style={styles.statChip}>
                          <Ionicons color={theme.colors.brandBlue} name="time-outline" size={15} />
                          <Text style={styles.statChipText}>Tot {formatMoment(element.subscriptionEnd)}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
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
  contentWrap: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    paddingHorizontal: 18,
    width: '100%',
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#EDF4FF',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 28,
    lineHeight: 34,
    marginTop: 6,
  },
  heroCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 16,
    padding: 18,
  },
  heroText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 21,
  },
  metaLine: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  metaStrong: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 14,
    marginTop: 14,
  },
  errorCard: {
    alignItems: 'center',
    backgroundColor: '#FFF4E8',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  errorText: {
    color: theme.colors.warning,
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    lineHeight: 18,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 140,
    paddingHorizontal: 18,
  },
  stateText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  list: {
    gap: 14,
    marginTop: 16,
  },
  elementCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  elementCardActive: {
    borderColor: theme.colors.brandBlue,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  elementHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  elementCopy: {
    flex: 1,
    minWidth: 0,
  },
  elementTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 18,
    lineHeight: 24,
  },
  elementMeta: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  actionCircle: {
    alignItems: 'center',
    backgroundColor: theme.colors.brandBlue,
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  actionCircleActive: {
    backgroundColor: '#EAF3FF',
  },
  actionCircleDisabled: {
    opacity: 0.6,
  },
  elementDescription: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  statChip: {
    alignItems: 'center',
    backgroundColor: '#F6FAFF',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statChipText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
  },
});
