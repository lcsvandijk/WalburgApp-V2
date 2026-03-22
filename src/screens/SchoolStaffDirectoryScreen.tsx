import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appConfig } from '../constants/appConfig';
import { theme } from '../constants/theme';
import { schoolStaffMembers } from '../data/schoolData';
import { SchoolStaffCategory } from '../types/content';
import { HomeStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<HomeStackParamList, 'SchoolStaffDirectory'>;
type FilterMode = 'all' | SchoolStaffCategory;

const categoryLabels: Record<FilterMode, string> = {
  all: 'Alles',
  schoolleiding: 'Schoolleiding',
  onderwijzend: 'Docenten',
  ondersteunend: 'Ondersteuning',
};

export function SchoolStaffDirectoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return schoolStaffMembers
      .filter((member) => filter === 'all' || member.category === filter)
      .filter((member) => {
        if (!normalizedQuery) {
          return true;
        }

        const haystack = `${member.name} ${member.role} ${member.abbreviation ?? ''} ${member.emailPrefix}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => left.name.localeCompare(right.name, 'nl'));
  }, [filter, query]);

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
            <Text style={styles.heroEyebrow}>Walburg College</Text>
            <Text style={styles.heroTitle}>Personeel zoeken</Text>
            <Text style={styles.heroMeta}>Zoek op naam, afkorting, rol of e-mailadres.</Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.searchCard}>
            <View style={styles.searchInputWrap}>
              <Ionicons color={theme.colors.brandBlue} name="search" size={18} />
              <TextInput
                onChangeText={setQuery}
                placeholder="Zoek een medewerker"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.searchInput}
                value={query}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} style={styles.clearButton}>
                  <Ionicons color={theme.colors.brandBlue} name="close-circle" size={20} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.filterRow}>
              {(['all', 'schoolleiding', 'onderwijzend', 'ondersteunend'] as FilterMode[]).map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setFilter(value)}
                  style={[styles.filterChip, filter === value ? styles.filterChipActive : null]}
                >
                  <Text style={[styles.filterChipText, filter === value ? styles.filterChipTextActive : null]}>
                    {categoryLabels[value]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.resultLabel}>{filteredMembers.length} resultaten</Text>
          </View>

          {filteredMembers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Geen medewerkers gevonden met deze zoekopdracht.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {filteredMembers.map((member) => (
                <Pressable
                  key={member.id}
                  onPress={() => navigation.navigate('SchoolStaffMember', { memberId: member.id })}
                  style={styles.memberCard}
                >
                  <View style={styles.memberCopy}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberRole}>{member.role}</Text>
                    <Text style={styles.memberMeta}>
                      {[categoryLabels[member.category], member.abbreviation, `${member.emailPrefix}@ozhw.nl`]
                        .filter(Boolean)
                        .join(' | ')}
                    </Text>
                  </View>
                  <Ionicons color={theme.colors.brandBlue} name="chevron-forward" size={20} />
                </Pressable>
              ))}
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
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  content: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    paddingHorizontal: 18,
    paddingTop: 18,
    width: '100%',
  },
  searchCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
  },
  searchInputWrap: {
    alignItems: 'center',
    backgroundColor: '#F6FAFF',
    borderColor: theme.colors.divider,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
    paddingLeft: 14,
    paddingRight: 10,
  },
  searchInput: {
    color: theme.colors.text,
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    minHeight: 52,
    paddingHorizontal: 10,
  },
  clearButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  filterChip: {
    backgroundColor: '#E8F0FB',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: theme.colors.brandBlue,
  },
  filterChipText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
  },
  filterChipTextActive: {
    color: theme.colors.inkOnDark,
  },
  resultLabel: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    marginTop: 16,
    textTransform: 'uppercase',
  },
  list: {
    gap: 12,
    marginTop: 16,
  },
  memberCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 18,
    lineHeight: 24,
  },
  memberRole: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  memberMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 140,
    paddingHorizontal: 18,
  },
  emptyText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
