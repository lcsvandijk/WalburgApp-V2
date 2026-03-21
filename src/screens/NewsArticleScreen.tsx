import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../constants/theme';
import { appConfig } from '../constants/appConfig';
import { openExternalUrl } from '../lib/externalLinks';
import { loadSchoolNewsArticle } from '../services/walburgContent';
import { SchoolNewsArticle } from '../types/content';
import { HomeStackParamList } from '../types/navigation';

const dateFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

type Props = NativeStackScreenProps<HomeStackParamList, 'NewsArticle'>;

export function NewsArticleScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [article, setArticle] = useState<SchoolNewsArticle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isWideLayout = width >= appConfig.layout.landscapeWidth;

  const loadArticle = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextArticle = await loadSchoolNewsArticle(route.params.articleId);
      setArticle(nextArticle);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Nieuwsartikel laden mislukte.');
    } finally {
      setIsLoading(false);
    }
  }, [route.params.articleId]);

  useEffect(() => {
    let active = true;

    loadArticle().catch(() => {
      return;
    });

    return () => {
      active = false;
    };
  }, [loadArticle]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await loadArticle();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadArticle]);

  const resolvedTitle = article?.title ?? route.params.fallbackTitle ?? 'Nieuws';
  const resolvedDate = article?.publishedAt ?? route.params.fallbackPublishedAt;
  const resolvedImage = article?.imageUrl ?? route.params.fallbackImageUrl;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 112 + insets.bottom }}
        refreshControl={
          <RefreshControl onRefresh={handleRefresh} refreshing={isRefreshing} tintColor={theme.colors.brandBlue} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons color={theme.colors.inkOnDark} name="arrow-back" size={20} />
          </Pressable>
          <Text numberOfLines={2} style={styles.headerTitle}>
            Walburg Nieuws
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {resolvedImage ? <Image source={{ uri: resolvedImage }} style={[styles.heroImage, isWideLayout ? styles.heroImageWide : null]} /> : null}

        <View style={styles.content}>
          {resolvedDate ? <Text style={styles.dateLabel}>{dateFormatter.format(new Date(resolvedDate))}</Text> : null}
          <Text style={styles.title}>{resolvedTitle}</Text>

          {isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={theme.colors.brandBlue} />
            </View>
          ) : errorMessage ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateText}>{errorMessage}</Text>
            </View>
          ) : (
            <View style={styles.articleBody}>
              {article?.body.map((paragraph, index) => (
                <Text key={`${paragraph}-${index}`} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
              {article?.link ? (
                <Pressable
                  onPress={() => openExternalUrl(article.link, 'Dit nieuwsartikel kon niet extern worden geopend.')}
                  style={styles.externalButton}
                >
                  <Text style={styles.externalButtonText}>Open origineel</Text>
                </Pressable>
              ) : null}
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
  header: {
    alignItems: 'center',
    backgroundColor: theme.colors.brandBlueDeep,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 18,
    paddingHorizontal: 18,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  headerTitle: {
    color: theme.colors.inkOnDark,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
  },
  headerSpacer: {
    width: 42,
  },
  heroImage: {
    alignSelf: 'center',
    backgroundColor: '#D9E5F6',
    height: 280,
    maxWidth: appConfig.layout.maxContentWidth,
    width: '100%',
  },
  heroImageWide: {
    borderBottomLeftRadius: theme.radius.md,
    borderBottomRightRadius: theme.radius.md,
    height: 360,
  },
  content: {
    alignSelf: 'center',
    maxWidth: 860,
    paddingHorizontal: 20,
    paddingTop: 22,
    width: '100%',
  },
  dateLabel: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 32,
    lineHeight: 38,
    marginTop: 10,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
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
  articleBody: {
    gap: 16,
    marginTop: 22,
  },
  paragraph: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 16,
    lineHeight: 27,
  },
  externalButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.brandBlue,
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 8,
    minHeight: 52,
  },
  externalButtonText: {
    color: theme.colors.inkOnDark,
    fontFamily: theme.fonts.heavy,
    fontSize: 15,
  },
});
