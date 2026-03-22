import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appConfig } from '../constants/appConfig';
import { theme } from '../constants/theme';
import { schoolPages } from '../data/schoolData';
import { openExternalUrl } from '../lib/externalLinks';
import { HomeStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<HomeStackParamList, 'SchoolPage'>;

export function SchoolPageScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const page = schoolPages[route.params.pageId];

  if (!page) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons color={theme.colors.inkOnDark} name="arrow-back" size={20} />
          </Pressable>
        </View>
        <View style={styles.centerState}>
          <Text style={styles.centerStateText}>Deze pagina kon niet worden gevonden.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 112 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
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
            <Text style={styles.heroEyebrow}>{page.heroSubtitle}</Text>
            <Text style={styles.heroTitle}>{page.heroTitle}</Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {page.sections.map((section) => (
            <View key={section.title} style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.paragraphs?.map((paragraph) => (
                <Text key={paragraph} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
              {section.bullets?.map((bullet) => (
                <View key={bullet} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
              {section.links ? (
                <View style={styles.linkGrid}>
                  {section.links.map((link) => (
                    <Pressable
                      key={link.label}
                      onPress={() => {
                        if (link.pageId) {
                          navigation.navigate('SchoolPage', { pageId: link.pageId });
                          return;
                        }

                        if (link.route === 'SchoolStaffDirectory') {
                          navigation.navigate('SchoolStaffDirectory');
                          return;
                        }

                        if (link.externalUrl) {
                          openExternalUrl(link.externalUrl, 'Deze pagina kon niet worden geopend.');
                        }
                      }}
                      style={styles.linkCard}
                    >
                      <Text style={styles.linkTitle}>{link.label}</Text>
                      {link.description ? <Text style={styles.linkDescription}>{link.description}</Text> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
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
    paddingHorizontal: 18,
  },
  hero: {
    minHeight: 220,
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
    fontSize: 34,
    lineHeight: 40,
    marginTop: 10,
    maxWidth: 420,
  },
  content: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: appConfig.layout.maxContentWidth,
    paddingHorizontal: 18,
    paddingTop: 20,
    width: '100%',
  },
  sectionCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  sectionTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 24,
    lineHeight: 30,
  },
  paragraph: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 24,
    marginTop: 12,
  },
  bulletRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  bulletDot: {
    backgroundColor: theme.colors.brandBlue,
    borderRadius: theme.radius.pill,
    height: 8,
    marginTop: 8,
    width: 8,
  },
  bulletText: {
    color: theme.colors.text,
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 24,
  },
  linkGrid: {
    gap: 12,
    marginTop: 16,
  },
  linkCard: {
    backgroundColor: '#F6FAFF',
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  linkTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 17,
    lineHeight: 23,
  },
  linkDescription: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  centerStateText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    textAlign: 'center',
  },
});
