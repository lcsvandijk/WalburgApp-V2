import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appConfig } from '../constants/appConfig';
import { theme } from '../constants/theme';
import { useWalburgApp } from '../context/WalburgAppContext';
import { formatDayLabel, formatTime } from '../lib/date';

type SettingsPane = 'overview' | 'notifications' | 'appAccess' | 'accountInfo';

function formatSyncLabel(value?: string) {
  if (!value) {
    return 'Nog niet';
  }

  return `${formatDayLabel(value)} | ${formatTime(value)}`;
}

async function safeHaptic(kind: 'selection' | 'success') {
  try {
    if (kind === 'selection') {
      await Haptics.selectionAsync();
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    return;
  }
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const {
    clearError,
    errorMessage,
    isBusy,
    loginWithMagister,
    logout,
    preferences,
    refreshAppData,
    session,
    updatePreferences,
  } = useWalburgApp();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activePane, setActivePane] = useState<SettingsPane>('overview');
  const isWideLayout = width >= appConfig.layout.landscapeWidth;

  const categoryCards = useMemo(
    () => [
      {
        key: 'notifications' as const,
        icon: 'notifications-outline' as const,
        title: 'Meldingen',
        description: 'Nieuwe cijfers en roosterwijzigingen overzichtelijk bij elkaar.',
      },
      {
        key: 'appAccess' as const,
        icon: 'shield-checkmark-outline' as const,
        title: 'App-toegang',
        description: 'Je koppeling, activiteit-herinneringen en toegang tot schooldata.',
      },
      {
        key: 'accountInfo' as const,
        icon: 'information-circle-outline' as const,
        title: 'Account & app-info',
        description: 'Naam, versie, syncstatus en uitloggen op een vaste plek.',
      },
    ],
    [],
  );

  async function handleOAuthLogin() {
    try {
      await loginWithMagister();
    } catch (error) {
      Alert.alert('Login mislukt', error instanceof Error ? error.message : 'Onbekende fout.');
    }
  }

  async function handleRefresh() {
    if (!session) {
      return;
    }

    setIsRefreshing(true);
    await safeHaptic('selection');

    try {
      await refreshAppData();
      await safeHaptic('success');
    } finally {
      setIsRefreshing(false);
    }
  }

  function renderOverview() {
    return (
      <>
        <View style={styles.sessionCard}>
          <View style={styles.sessionCopy}>
            <Text style={styles.sessionLabel}>Sessie</Text>
            <Text style={styles.sessionTitle}>{session ? session.fullName : 'Nog niet ingelogd'}</Text>
            <Text style={styles.sessionMeta}>
              {session ? `Laatste sync | ${formatSyncLabel(session.lastSyncedAt)}` : 'Log in om je rooster en cijfers te koppelen.'}
            </Text>
          </View>
          {!session ? (
            <Pressable disabled={isBusy} onPress={handleOAuthLogin} style={styles.primaryButton}>
              {isBusy ? <ActivityIndicator color={theme.colors.inkOnDark} /> : <Text style={styles.primaryButtonText}>Inloggen</Text>}
            </Pressable>
          ) : null}
        </View>

        <View style={styles.settingsHeader}>
          <Text style={styles.settingsTitle}>Instellingen</Text>
          <Text style={styles.settingsMeta}>Open een categorie voor meer opties.</Text>
        </View>

        <View style={[styles.categoryGrid, isWideLayout ? styles.categoryGridWide : null]}>
          {categoryCards.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setActivePane(item.key)}
              style={[styles.categoryCard, isWideLayout ? styles.categoryCardWide : null]}
            >
              <View style={styles.categoryIcon}>
                <Ionicons color={theme.colors.brandBlue} name={item.icon} size={20} />
              </View>
              <Text style={styles.categoryTitle}>{item.title}</Text>
              <Text numberOfLines={appConfig.ui.previewLines} style={styles.categoryText}>
                {item.description}
              </Text>
            </Pressable>
          ))}
        </View>
      </>
    );
  }

  function renderNotificationsPane() {
    return (
      <View style={styles.detailCard}>
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingLabel}>Nieuwe cijfers</Text>
            <Text style={styles.settingMeta}>Meldingen zodra er nieuwe cijfers binnenkomen.</Text>
          </View>
          <Switch
            onValueChange={(value) => updatePreferences({ gradeNotifications: value })}
            thumbColor={theme.colors.paper}
            trackColor={{ false: '#B8C8E2', true: theme.colors.brandBlue }}
            value={preferences.gradeNotifications}
          />
        </View>

        <View style={[styles.settingRow, styles.settingRowBorder]}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingLabel}>Roosterwijzigingen</Text>
            <Text style={styles.settingMeta}>Meldingen bij wijzigingen in je lessen of afspraken.</Text>
          </View>
          <Switch
            onValueChange={(value) => updatePreferences({ scheduleChangeNotifications: value })}
            thumbColor={theme.colors.paper}
            trackColor={{ false: '#B8C8E2', true: theme.colors.brandBlue }}
            value={preferences.scheduleChangeNotifications}
          />
        </View>

        <View style={[styles.detailRow, styles.settingRowBorder]}>
          <Text style={styles.detailLabel}>Activiteit-herinneringen</Text>
          <Text style={styles.detailValue}>{preferences.savedReminderEventIds.length}</Text>
        </View>

        <View style={[styles.infoNote, styles.settingRowBorder]}>
          <Text style={styles.infoNoteText}>
            Herinneringen voor schoolactiviteiten zet je direct aan vanuit een activiteit zelf.
          </Text>
        </View>
      </View>
    );
  }

  function renderAppAccessPane() {
    return (
      <View style={styles.detailCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Magister-koppeling</Text>
          <Text style={styles.detailValue}>{session ? 'Actief' : 'Niet gekoppeld'}</Text>
        </View>
        <View style={[styles.detailRow, styles.settingRowBorder]}>
          <Text style={styles.detailLabel}>Inlogmethode</Text>
          <Text style={styles.detailValue}>
            {session?.authMode === 'manual' ? 'Handmatig token' : session?.authMode === 'oauth' ? 'Magister login' : '-'}
          </Text>
        </View>
        <View style={[styles.detailRow, styles.settingRowBorder]}>
          <Text style={styles.detailLabel}>API-toegang</Text>
          <Text style={styles.detailValue}>{session?.hasApiAccess ? 'In orde' : 'Nog niet actief'}</Text>
        </View>
        <View style={[styles.detailRow, styles.settingRowBorder]}>
          <Text style={styles.detailLabel}>Schoolactiviteiten met belletje</Text>
          <Text style={styles.detailValue}>{preferences.savedReminderEventIds.length}</Text>
        </View>

        {!session ? (
          <Pressable disabled={isBusy} onPress={handleOAuthLogin} style={styles.primaryButtonFull}>
            {isBusy ? <ActivityIndicator color={theme.colors.inkOnDark} /> : <Text style={styles.primaryButtonText}>Inloggen met Magister</Text>}
          </Pressable>
        ) : null}

        <View style={[styles.infoNote, session ? styles.settingRowBorder : null]}>
          <Text style={styles.infoNoteText}>
            Deze app gebruikt je Magister-koppeling voor rooster, cijfers en schoolinformatie.
          </Text>
        </View>
      </View>
    );
  }

  function renderAccountInfoPane() {
    return (
      <View style={styles.detailCard}>
        <View style={styles.settingsBlockHeader}>
          <Text style={styles.settingsBlockTitle}>Instellingen</Text>
        </View>
        <View style={[styles.settingRow, styles.settingRowBorder]}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingLabel}>Gemiddelden afronden op hele cijfers</Text>
            <Text style={styles.settingMeta}>Standaard staat dit uit.</Text>
          </View>
          <Switch
            onValueChange={(value) => updatePreferences({ roundAveragesToWholeNumbers: value })}
            thumbColor={theme.colors.paper}
            trackColor={{ false: '#B8C8E2', true: theme.colors.brandBlue }}
            value={preferences.roundAveragesToWholeNumbers}
          />
        </View>

        <View style={[styles.settingsBlockHeader, styles.settingRowBorder]}>
          <Text style={styles.settingsBlockTitle}>Account & app-info</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Naam</Text>
          <Text style={styles.detailValue}>{session?.fullName ?? '-'}</Text>
        </View>
        <View style={[styles.detailRow, styles.settingRowBorder]}>
          <Text style={styles.detailLabel}>Laatste sync</Text>
          <Text style={styles.detailValue}>{formatSyncLabel(session?.lastSyncedAt)}</Text>
        </View>
        <View style={[styles.detailRow, styles.settingRowBorder]}>
          <Text style={styles.detailLabel}>Appversie</Text>
          <Text style={styles.detailValue}>v{appConfig.app.version}</Text>
        </View>
        <View style={[styles.detailRow, styles.settingRowBorder]}>
          <Text style={styles.detailLabel}>School</Text>
          <Text style={styles.detailValue}>{appConfig.school.name}</Text>
        </View>
        <View style={[styles.detailRow, styles.settingRowBorder]}>
          <Text style={styles.detailLabel}>Website</Text>
          <Text numberOfLines={1} style={styles.detailValue}>
            {appConfig.school.website.replace('https://', '')}
          </Text>
        </View>

        {session ? (
          <Pressable disabled={isBusy} onPress={logout} style={styles.logoutButton}>
            <Text style={styles.logoutButtonText}>Uitloggen</Text>
          </Pressable>
        ) : (
          <Pressable disabled={isBusy} onPress={handleOAuthLogin} style={styles.primaryButtonFull}>
            {isBusy ? <ActivityIndicator color={theme.colors.inkOnDark} /> : <Text style={styles.primaryButtonText}>Inloggen met Magister</Text>}
          </Pressable>
        )}
      </View>
    );
  }

  function renderActivePane() {
    if (activePane === 'overview') {
      return renderOverview();
    }

    const activeCard = categoryCards.find((item) => item.key === activePane);

    return (
      <>
        <View style={styles.paneHeader}>
          <Pressable onPress={() => setActivePane('overview')} style={styles.backButton}>
            <Ionicons color={theme.colors.brandBlueDeep} name="arrow-back" size={18} />
          </Pressable>
          <View style={styles.paneCopy}>
            <Text style={styles.paneTitle}>{activeCard?.title}</Text>
            <Text style={styles.paneMeta}>{activeCard?.description}</Text>
          </View>
        </View>

        {activePane === 'notifications' ? renderNotificationsPane() : null}
        {activePane === 'appAccess' ? renderAppAccessPane() : null}
        {activePane === 'accountInfo' ? renderAccountInfoPane() : null}
      </>
    );
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
          {errorMessage ? (
            <View style={styles.errorStrip}>
              <Ionicons color={theme.colors.warning} name="warning-outline" size={18} />
              <Text style={styles.errorText}>{errorMessage}</Text>
              <Pressable onPress={clearError}>
                <Ionicons color={theme.colors.warning} name="close" size={18} />
              </Pressable>
            </View>
          ) : null}

          {renderActivePane()}
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
  topInsetHeader: {
    backgroundColor: theme.colors.brandBlueDeep,
  },
  contentWrap: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    paddingHorizontal: 18,
    width: '100%',
  },
  errorStrip: {
    alignItems: 'center',
    backgroundColor: '#FFF1EF',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  errorText: {
    color: '#A34442',
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  sessionCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  sessionCopy: {
    flex: 1,
  },
  sessionLabel: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  sessionTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 22,
    lineHeight: 28,
    marginTop: 6,
  },
  sessionMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.brandBlue,
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 124,
    paddingHorizontal: 18,
  },
  primaryButtonFull: {
    alignItems: 'center',
    backgroundColor: theme.colors.brandBlue,
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 52,
  },
  primaryButtonText: {
    color: theme.colors.inkOnDark,
    fontFamily: theme.fonts.heavy,
    fontSize: 15,
  },
  settingsHeader: {
    marginTop: 20,
  },
  settingsTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 24,
  },
  settingsMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  categoryGrid: {
    gap: 14,
    marginTop: 16,
  },
  categoryGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  categoryCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  categoryCardWide: {
    width: '31.9%',
  },
  categoryIcon: {
    alignItems: 'center',
    backgroundColor: '#EDF4FF',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  categoryTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 18,
    lineHeight: 24,
    marginTop: 12,
  },
  categoryText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  paneHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#EDF4FF',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  paneCopy: {
    flex: 1,
  },
  paneTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 24,
  },
  paneMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  detailCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 16,
    overflow: 'hidden',
    paddingBottom: 2,
  },
  settingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  settingRowBorder: {
    borderTopColor: theme.colors.divider,
    borderTopWidth: 1,
  },
  settingCopy: {
    flex: 1,
  },
  settingLabel: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
  },
  settingMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  settingValue: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 20,
  },
  infoNote: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  infoNoteText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 19,
  },
  settingsBlockHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  settingsBlockTitle: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  detailLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
  },
  detailValue: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    maxWidth: '62%',
    textAlign: 'right',
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 14,
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    minHeight: 50,
  },
  logoutButtonText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 15,
  },
});
