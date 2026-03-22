import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { openExternalUrl } from '../lib/externalLinks';
import { fetchLearningResourcesFromTokens, resolveAuthenticatedExternalUrl } from '../services/magister';
import { MagisterLearningResource } from '../types/magister';
import { ProfileStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<ProfileStackParamList, 'LearningResources'>;

function formatMaterialType(type: number) {
  switch (type) {
    case 0:
      return 'Huur';
    case 1:
      return 'Koop';
    case 2:
      return 'School';
    case 3:
      return 'Digitaal';
    default:
      return 'Leermiddel';
  }
}

export function LearningResourcesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useWalburgApp();
  const [resources, setResources] = useState<MagisterLearningResource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openingId, setOpeningId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadResources() {
      if (!session?.accessToken) {
        setError('Log opnieuw in om je leermiddelen op te halen.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const nextResources = await fetchLearningResourcesFromTokens(session, session.personId ?? session.id);

        if (!active) {
          return;
        }

        setResources(nextResources);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Leermiddelen laden mislukte.');
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadResources().catch(() => {
      return;
    });

    return () => {
      active = false;
    };
  }, [session]);

  async function handleOpenResource(resource: MagisterLearningResource) {
    if (!session?.accessToken || !resource.contentLink) {
      return;
    }

    setOpeningId(resource.id);

    try {
      const resolvedUrl = await resolveAuthenticatedExternalUrl(session, resource.contentLink);
      await openExternalUrl(resolvedUrl, 'Dit leermiddel kon niet extern worden geopend.');
    } catch (openError) {
      Alert.alert('Openen mislukt', openError instanceof Error ? openError.message : 'Dit leermiddel kon niet worden geopend.');
    } finally {
      setOpeningId(null);
    }
  }

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
            <Text style={styles.heroTitle}>Leermiddelen</Text>
            <Text style={styles.heroText}>
              Open digitale leermiddelen rechtstreeks in je externe browser vanuit je actuele lijst.
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={theme.colors.brandBlue} />
              <Text style={styles.stateText}>Leermiddelen laden...</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <Ionicons color={theme.colors.warning} name="warning-outline" size={20} />
              <Text style={styles.stateText}>{error}</Text>
            </View>
          ) : resources.length === 0 ? (
            <View style={styles.stateCard}>
              <Ionicons color={theme.colors.brandBlue} name="book-outline" size={20} />
              <Text style={styles.stateText}>Er zijn momenteel geen leermiddelen gevonden.</Text>
            </View>
          ) : (
            resources.map((resource) => (
              <Pressable
                disabled={!resource.contentLink || openingId === resource.id}
                key={`${resource.id}-${resource.ean ?? resource.title}`}
                onPress={() => handleOpenResource(resource)}
                style={styles.resourceCard}
              >
                <View style={styles.resourceIcon}>
                  <Ionicons color={theme.colors.brandBlue} name="book-outline" size={20} />
                </View>
                <View style={styles.resourceCopy}>
                  <Text style={styles.resourceTitle}>{resource.title}</Text>
                  <Text style={styles.resourceMeta}>
                    {resource.subjectAbbreviation ? `${resource.subjectAbbreviation} • ` : ''}
                    {formatMaterialType(resource.materialType)}
                  </Text>
                  {resource.publisher ? <Text style={styles.resourcePublisher}>{resource.publisher.trim()}</Text> : null}
                </View>
                {openingId === resource.id ? (
                  <ActivityIndicator color={theme.colors.brandBlue} size="small" />
                ) : (
                  <Ionicons color={theme.colors.brandBlue} name="open-outline" size={18} />
                )}
              </Pressable>
            ))
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
  resourceCard: {
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
  resourceIcon: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 18,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  resourceCopy: {
    flex: 1,
  },
  resourceTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 16,
    lineHeight: 21,
  },
  resourceMeta: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  resourcePublisher: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
});
