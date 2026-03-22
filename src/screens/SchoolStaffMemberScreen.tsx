import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appConfig } from '../constants/appConfig';
import { theme } from '../constants/theme';
import { getSchoolStaffMemberById } from '../data/schoolData';
import { openExternalUrl } from '../lib/externalLinks';
import { HomeStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<HomeStackParamList, 'SchoolStaffMember'>;

const categoryLabels = {
  schoolleiding: 'Schoolleiding',
  onderwijzend: 'Onderwijzend personeel',
  ondersteunend: 'Ondersteunend personeel',
} as const;

export function SchoolStaffMemberScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const member = getSchoolStaffMemberById(route.params.memberId);

  if (!member) {
    return (
      <View style={styles.screen}>
        <View style={styles.centerState}>
          <Text style={styles.centerStateText}>Deze medewerker kon niet worden gevonden.</Text>
        </View>
      </View>
    );
  }

  const email = `${member.emailPrefix}@ozhw.nl`;

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
            <Text style={styles.heroEyebrow}>{categoryLabels[member.category]}</Text>
            <Text style={styles.heroTitle}>{member.name}</Text>
            <Text style={styles.heroMeta}>{member.role}</Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Contact</Text>
            <Pressable onPress={() => openExternalUrl(`mailto:${email}`, 'De e-mailapp kon niet worden geopend.')} style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowLabel}>E-mailadres</Text>
                <Text style={styles.rowValue}>{email}</Text>
              </View>
              <Ionicons color={theme.colors.brandBlue} name="mail-outline" size={20} />
            </Pressable>
            <View style={[styles.row, styles.rowBorder]}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowLabel}>Afkorting</Text>
                <Text style={styles.rowValue}>{member.abbreviation ?? 'Niet opgegeven'}</Text>
              </View>
            </View>
            <View style={[styles.row, styles.rowBorder]}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowLabel}>Rol / vakken</Text>
                <Text style={styles.rowValue}>{member.role}</Text>
              </View>
            </View>
            <View style={[styles.row, styles.rowBorder]}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowLabel}>Categorie</Text>
                <Text style={styles.rowValue}>{categoryLabels[member.category]}</Text>
              </View>
            </View>
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
    fontSize: 32,
    lineHeight: 38,
    marginTop: 10,
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  content: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    paddingHorizontal: 18,
    paddingTop: 18,
    width: '100%',
  },
  card: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardTitle: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    textTransform: 'uppercase',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowBorder: {
    borderTopColor: theme.colors.divider,
    borderTopWidth: 1,
  },
  rowCopy: {
    flex: 1,
  },
  rowLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  rowValue: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
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
