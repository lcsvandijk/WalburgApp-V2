import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appConfig } from '../constants/appConfig';
import { theme } from '../constants/theme';
import { useWalburgApp } from '../context/WalburgAppContext';
import { formatDayLabel, formatTime } from '../lib/date';
import { openExternalUrl } from '../lib/externalLinks';
import { sendInstantAppNotification } from '../services/notifications';
import { ProfileStackParamList } from '../types/navigation';

type SettingsPane = 'overview' | 'notifications' | 'appAccess' | 'accountInfo';
type DebugMessageType = 'activiteiten' | 'cijfer' | 'rooster';
type Props = NativeStackScreenProps<ProfileStackParamList, 'ProfileIndex'>;

const DEBUG_CODE_HASH = '2ee62f16ca41fe7879853975d5fcb4cb858f6edb5fd0355cfb7948d997e6b6a9';

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

export function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const {
    clearError,
    errorMessage,
    isDemoMode,
    isBusy,
    loginWithMagister,
    logout,
    preferences,
    refreshAppData,
    unreadInboxCount,
    session,
    updatePreferences,
  } = useWalburgApp();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activePane, setActivePane] = useState<SettingsPane>('overview');
  const [versionTapCount, setVersionTapCount] = useState(0);
  const [isDebugCodeVisible, setIsDebugCodeVisible] = useState(false);
  const [isDebugMenuVisible, setIsDebugMenuVisible] = useState(false);
  const [debugCode, setDebugCode] = useState('');
  const [isCheckingDebugCode, setIsCheckingDebugCode] = useState(false);
  const [debugApiOutageMode, setDebugApiOutageMode] = useState(false);
  const [debugVerboseStatus, setDebugVerboseStatus] = useState(false);
  const [debugForceDemoActivities, setDebugForceDemoActivities] = useState(false);
  const [debugMessages, setDebugMessages] = useState<
    Array<{ id: string; text: string; type: DebugMessageType }>
  >([]);
  const isWideLayout = width >= appConfig.layout.landscapeWidth;

  useEffect(() => {
    if (versionTapCount === 0 || isDebugCodeVisible) {
      return;
    }

    const timeout = setTimeout(() => {
      setVersionTapCount(0);
    }, 1800);

    return () => {
      clearTimeout(timeout);
    };
  }, [isDebugCodeVisible, versionTapCount]);

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

  async function handleVersionTap() {
    const nextCount = versionTapCount + 1;
    setVersionTapCount(nextCount);

    if (nextCount < 5) {
      await safeHaptic('selection');
      return;
    }

    setVersionTapCount(0);
    setDebugCode('');
    setIsDebugCodeVisible(true);
    await safeHaptic('success');
  }

  async function handleDebugCodeSubmit() {
    setIsCheckingDebugCode(true);

    try {
      const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, debugCode.trim());

      if (digest !== DEBUG_CODE_HASH) {
        Alert.alert('Code onjuist', 'Deze debugcode klopt niet.');
        return;
      }

      setIsDebugCodeVisible(false);
      setIsDebugMenuVisible(true);
      setDebugCode('');
      await safeHaptic('success');
    } finally {
      setIsCheckingDebugCode(false);
    }
  }

  async function simulateDebugMessage(type: DebugMessageType) {
    const label =
      type === 'cijfer'
        ? 'Nieuw cijfer ontvangen'
        : type === 'rooster'
          ? 'Roosterwijziging gesimuleerd'
          : 'Activiteitenmelding toegevoegd';
    const notificationBody =
      type === 'cijfer'
        ? 'Wiskunde | SO Hoofdstuk 4 | 8,1'
        : type === 'rooster'
          ? 'Engels | 10:20 | B203'
          : 'Open dag voorbereiding | Vandaag 15:30';

    setDebugMessages((current) => [
      {
        id: `${type}-${Date.now()}`,
        text: `${label} | ${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`,
        type,
      },
      ...current,
    ]);

    await sendInstantAppNotification({
      title: label,
      body: notificationBody,
      subtitle: type === 'cijfer' ? 'Cijfers' : type === 'rooster' ? 'Rooster' : 'Activiteiten',
      data: {
        debugType: type,
      },
    });
  }

  function renderOverview() {
    return (
      <>
        <View style={styles.sessionCard}>
          <View style={styles.sessionCopy}>
            <Text style={styles.sessionLabel}>Sessie</Text>
            <Text style={styles.sessionTitle}>{session ? session.fullName : 'Nog niet ingelogd'}</Text>
            <Text style={styles.sessionMeta}>
              {isDemoMode
                ? 'Demo-account actief voor screenshots en voorbeelddata.'
                : session
                  ? `Laatst bijgewerkt | ${formatSyncLabel(session.lastSyncedAt)}`
                  : 'Log in om je rooster en cijfers te koppelen.'}
            </Text>
          </View>
          {!session ? (
            <Pressable disabled={isBusy} onPress={handleOAuthLogin} style={styles.primaryButton}>
              {isBusy ? <ActivityIndicator color={theme.colors.inkOnDark} /> : <Text style={styles.primaryButtonText}>Inloggen</Text>}
            </Pressable>
          ) : null}
        </View>

        <View style={styles.quickSection}>
          <Pressable onPress={() => navigation.navigate('Inbox')} style={styles.quickLinkCard}>
            <View style={styles.quickLinkIcon}>
              <Ionicons color={theme.colors.brandBlue} name="mail-outline" size={20} />
            </View>
            <View style={styles.quickLinkCopy}>
              <Text style={styles.quickLinkTitle}>Inbox</Text>
              <Text style={styles.quickLinkText}>
                Open je berichten, bekijk ongelezen mail en verstuur een nieuw bericht.
              </Text>
            </View>
            {unreadInboxCount > 0 ? (
              <View style={styles.quickLinkBadge}>
                <Text style={styles.quickLinkBadgeText}>{unreadInboxCount > 9 ? '9+' : unreadInboxCount}</Text>
              </View>
            ) : null}
            <Ionicons color={theme.colors.brandBlue} name="chevron-forward" size={18} />
          </Pressable>
        </View>

        <View style={styles.quickSection}>
          <Pressable onPress={() => navigation.navigate('AbsenceOverview')} style={styles.quickLinkCard}>
            <View style={styles.quickLinkIcon}>
              <Ionicons color={theme.colors.brandBlue} name="calendar-outline" size={20} />
            </View>
            <View style={styles.quickLinkCopy}>
              <Text style={styles.quickLinkTitle}>Afwezigheid</Text>
              <Text style={styles.quickLinkText}>
                Bekijk meldingen en lesabsenties in twee aparte tabbladen.
              </Text>
            </View>
            <Ionicons color={theme.colors.brandBlue} name="chevron-forward" size={18} />
          </Pressable>
        </View>

        <View style={styles.quickSection}>
          <Pressable onPress={() => navigation.navigate('LearningResources')} style={styles.quickLinkCard}>
            <View style={styles.quickLinkIcon}>
              <Ionicons color={theme.colors.brandBlue} name="book-outline" size={20} />
            </View>
            <View style={styles.quickLinkCopy}>
              <Text style={styles.quickLinkTitle}>Leermiddelen</Text>
              <Text style={styles.quickLinkText}>
                Open je digitale leermiddelen direct in een externe browser.
              </Text>
            </View>
            <Ionicons color={theme.colors.brandBlue} name="chevron-forward" size={18} />
          </Pressable>
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
            <Text style={styles.settingLabel}>Nieuwe mail</Text>
            <Text style={styles.settingMeta}>Lokale melding wanneer er nieuwe ongelezen inbox-berichten binnenkomen.</Text>
          </View>
          <Switch
            onValueChange={(value) => updatePreferences({ mailNotificationsEnabled: value })}
            thumbColor={theme.colors.paper}
            trackColor={{ false: '#B8C8E2', true: theme.colors.brandBlue }}
            value={preferences.mailNotificationsEnabled}
          />
        </View>

        {preferences.mailNotificationsEnabled ? (
          <View style={[styles.settingRow, styles.settingRowBorder]}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingLabel}>Alleen belangrijke mail</Text>
              <Text style={styles.settingMeta}>
                Geef alleen een melding bij nieuwe berichten die als belangrijk zijn gemarkeerd.
              </Text>
            </View>
            <Switch
              onValueChange={(value) => updatePreferences({ priorityMailOnlyNotifications: value })}
              thumbColor={theme.colors.paper}
              trackColor={{ false: '#B8C8E2', true: theme.colors.brandBlue }}
              value={preferences.priorityMailOnlyNotifications}
            />
          </View>
        ) : null}

        <View style={[styles.settingRow, styles.settingRowBorder]}>
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

        <View style={[styles.settingRow, styles.settingRowBorder]}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingLabel}>Lesherinnering 5 minuten van tevoren</Text>
            <Text style={styles.settingMeta}>Krijg vlak voor je les een melding met vak en lokaal.</Text>
          </View>
          <Switch
            onValueChange={(value) => updatePreferences({ lessonRemindersEnabled: value })}
            thumbColor={theme.colors.paper}
            trackColor={{ false: '#B8C8E2', true: theme.colors.brandBlue }}
            value={preferences.lessonRemindersEnabled}
          />
        </View>

        <View style={[styles.detailRow, styles.settingRowBorder]}>
          <Text style={styles.detailLabel}>Activiteit-herinneringen</Text>
          <Text style={styles.detailValue}>{preferences.savedReminderEventIds.length}</Text>
        </View>

        <View style={[styles.infoNote, styles.settingRowBorder]}>
          <Text style={styles.infoNoteText}>
            Nieuwe cijfers en roosterwijzigingen kunnen een lokale melding geven zodra de app synchroniseert. Lesherinneringen worden 5 minuten van tevoren ingepland op je toestel.
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
          <Text style={styles.detailLabel}>Laatst bijgewerkt</Text>
          <Text style={styles.detailValue}>{formatSyncLabel(session?.lastSyncedAt)}</Text>
        </View>
        <Pressable onPress={handleVersionTap} style={[styles.detailRow, styles.settingRowBorder]}>
          <Text style={styles.detailLabel}>Appversie</Text>
          <Text style={styles.detailValue}>v{appConfig.app.version}</Text>
        </Pressable>
        <View style={[styles.detailRow, styles.settingRowBorder]}>
          <Text style={styles.detailLabel}>School</Text>
          <Text style={styles.detailValue}>{appConfig.school.name}</Text>
        </View>
        <View style={[styles.detailRow, styles.settingRowBorder]}>
          <Text style={styles.detailLabel}>Website</Text>
          <Pressable onPress={() => openExternalUrl(appConfig.school.website)} style={styles.inlineLinkWrap}>
            <Text numberOfLines={1} style={styles.detailLinkValue}>
              {appConfig.school.website.replace('https://', '')}
            </Text>
          </Pressable>
        </View>
        <View style={[styles.detailRow, styles.settingRowBorder]}>
          <Text style={styles.detailLabel}>Feedback</Text>
          <Pressable
            onPress={() => openExternalUrl('https://forms.gle/bb49ERNxZ4sNEXkX8', 'Het feedbackformulier kon niet worden geopend.')}
            style={styles.inlineLinkWrap}
          >
            <Text numberOfLines={1} style={styles.detailLinkValue}>
              Open feedbackformulier
            </Text>
          </Pressable>
        </View>

        {isDemoMode ? (
          <Pressable onPress={() => updatePreferences({ demoModeEnabled: false })} style={styles.logoutButton}>
            <Text style={styles.logoutButtonText}>Demo mode verlaten</Text>
          </Pressable>
        ) : session ? (
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

      <Modal
        animationType="fade"
        onRequestClose={() => setIsDebugCodeVisible(false)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={isDebugCodeVisible}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Debugcode</Text>
            <Text style={styles.modalText}>Voer de verborgen code in om het debugmenu te openen.</Text>
            <View style={styles.debugInputWrap}>
              <TextInput
                autoFocus
                keyboardType="number-pad"
                onChangeText={setDebugCode}
                placeholder="Code"
                placeholderTextColor={theme.colors.textMuted}
                secureTextEntry
                style={styles.debugInput}
                value={debugCode}
              />
            </View>
            <View style={styles.debugButtonRow}>
              <Pressable onPress={() => setIsDebugCodeVisible(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Sluiten</Text>
              </Pressable>
              <Pressable
                disabled={isCheckingDebugCode || debugCode.trim().length === 0}
                onPress={handleDebugCodeSubmit}
                style={[styles.primaryButtonInline, isCheckingDebugCode ? styles.buttonDisabled : null]}
              >
                {isCheckingDebugCode ? (
                  <ActivityIndicator color={theme.colors.inkOnDark} size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Openen</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setIsDebugMenuVisible(false)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={isDebugMenuVisible}
      >
        <View style={styles.modalScrim}>
          <View style={styles.debugMenuCard}>
            <View style={styles.debugMenuHeader}>
              <View style={styles.debugMenuCopy}>
                <Text style={styles.modalTitle}>Debugmenu</Text>
                <Text style={styles.modalText}>Verborgen testpaneel voor demo- en simulatietools.</Text>
              </View>
              <Pressable onPress={() => setIsDebugMenuVisible(false)} style={styles.closeButton}>
                <Ionicons color={theme.colors.brandBlueDeep} name="close" size={18} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.debugSection}>
                <Text style={styles.debugSectionTitle}>Statussen</Text>
                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingLabel}>Demo mode</Text>
                    <Text style={styles.settingMeta}>Snelle stand voor screenshots en testscenario's.</Text>
                  </View>
                  <Switch
                    onValueChange={(value) => updatePreferences({ demoModeEnabled: value })}
                    thumbColor={theme.colors.paper}
                    trackColor={{ false: '#B8C8E2', true: theme.colors.brandBlue }}
                    value={preferences.demoModeEnabled}
                  />
                </View>
                <View style={[styles.settingRow, styles.settingRowBorder]}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingLabel}>API storing simuleren</Text>
                    <Text style={styles.settingMeta}>Gebruik om errorstates en fallback-UI te bekijken.</Text>
                  </View>
                  <Switch
                    onValueChange={setDebugApiOutageMode}
                    thumbColor={theme.colors.paper}
                    trackColor={{ false: '#B8C8E2', true: theme.colors.brandBlue }}
                    value={debugApiOutageMode}
                  />
                </View>
                <View style={[styles.settingRow, styles.settingRowBorder]}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingLabel}>Verbose statuslabels</Text>
                    <Text style={styles.settingMeta}>Handig om edge cases en interne staten te spotten.</Text>
                  </View>
                  <Switch
                    onValueChange={setDebugVerboseStatus}
                    thumbColor={theme.colors.paper}
                    trackColor={{ false: '#B8C8E2', true: theme.colors.brandBlue }}
                    value={debugVerboseStatus}
                  />
                </View>
                <View style={[styles.settingRow, styles.settingRowBorder]}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingLabel}>Demo-activiteiten forceren</Text>
                    <Text style={styles.settingMeta}>Voor later gebruik als je altijd een gevulde demo wilt.</Text>
                  </View>
                  <Switch
                    onValueChange={setDebugForceDemoActivities}
                    thumbColor={theme.colors.paper}
                    trackColor={{ false: '#B8C8E2', true: theme.colors.brandBlue }}
                    value={debugForceDemoActivities}
                  />
                </View>
                <Pressable
                  onPress={() => {
                    updatePreferences({ onboardingCompleted: false }).catch(() => {
                      return;
                    });
                    Alert.alert('Onboarding gereset', 'Bij de volgende start krijg je de onboarding opnieuw te zien.');
                  }}
                  style={[styles.debugResetButton, styles.settingRowBorder]}
                >
                  <Ionicons color={theme.colors.brandBlue} name="refresh-outline" size={18} />
                  <View style={styles.debugResetCopy}>
                    <Text style={styles.debugResetTitle}>Onboarding resetten</Text>
                    <Text style={styles.debugResetText}>Toon de eerste-opstartflow opnieuw bij de volgende appstart.</Text>
                  </View>
                </Pressable>
              </View>

              <View style={styles.debugSection}>
                <Text style={styles.debugSectionTitle}>Message Simulation</Text>
                <View style={styles.debugActionGrid}>
                  <Pressable onPress={() => simulateDebugMessage('cijfer')} style={styles.debugActionButton}>
                    <Ionicons color={theme.colors.brandBlue} name="stats-chart-outline" size={18} />
                    <Text style={styles.debugActionText}>Cijfer</Text>
                  </Pressable>
                  <Pressable onPress={() => simulateDebugMessage('rooster')} style={styles.debugActionButton}>
                    <Ionicons color={theme.colors.brandBlue} name="swap-horizontal-outline" size={18} />
                    <Text style={styles.debugActionText}>Rooster</Text>
                  </Pressable>
                  <Pressable onPress={() => simulateDebugMessage('activiteiten')} style={styles.debugActionButton}>
                    <Ionicons color={theme.colors.brandBlue} name="pencil-outline" size={18} />
                    <Text style={styles.debugActionText}>Activiteit</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.debugSection}>
                <View style={styles.debugSectionHeader}>
                  <Text style={styles.debugSectionTitle}>Simulaties</Text>
                  <Pressable onPress={() => setDebugMessages([])} style={styles.debugClearButton}>
                    <Text style={styles.debugClearText}>Leegmaken</Text>
                  </Pressable>
                </View>
                {debugMessages.length === 0 ? (
                  <Text style={styles.debugEmptyText}>Nog geen gesimuleerde berichten toegevoegd.</Text>
                ) : (
                  debugMessages.map((message) => (
                    <View key={message.id} style={styles.debugMessageCard}>
                      <Text style={styles.debugMessageType}>{message.type}</Text>
                      <Text style={styles.debugMessageText}>{message.text}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
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
  quickSection: {
    marginTop: 18,
  },
  quickLinkCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  quickLinkIcon: {
    alignItems: 'center',
    backgroundColor: '#EDF4FF',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  quickLinkCopy: {
    flex: 1,
  },
  quickLinkTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 17,
  },
  quickLinkText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  quickLinkBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.brandCyan,
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  quickLinkBadgeText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 12,
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
    marginHorizontal: 16,
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
    marginTop: 20,
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
    paddingBottom: 12,
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
  inlineLinkWrap: {
    alignItems: 'flex-end',
    flexShrink: 1,
    maxWidth: '62%',
  },
  detailLinkValue: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
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
    maxWidth: 460,
    padding: 20,
    width: '100%',
  },
  debugMenuCard: {
    backgroundColor: theme.colors.paper,
    borderRadius: 24,
    maxHeight: '88%',
    maxWidth: 760,
    padding: 20,
    width: '100%',
  },
  debugMenuHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  debugMenuCopy: {
    flex: 1,
    minWidth: 0,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#EDF4FF',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  modalTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 24,
    lineHeight: 30,
  },
  modalText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  debugInputWrap: {
    backgroundColor: '#F6FAFF',
    borderColor: theme.colors.divider,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  debugInput: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 16,
    minHeight: 54,
  },
  debugButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  secondaryButtonText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 15,
  },
  primaryButtonInline: {
    alignItems: 'center',
    backgroundColor: theme.colors.brandBlue,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  debugSection: {
    backgroundColor: '#F9FBFE',
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 16,
    overflow: 'hidden',
  },
  debugSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  debugSectionTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  debugActionGrid: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
  },
  debugActionButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    justifyContent: 'center',
    minHeight: 94,
  },
  debugActionText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
  },
  debugResetButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  debugResetCopy: {
    flex: 1,
  },
  debugResetTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
  },
  debugResetText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  debugClearButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  debugClearText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
  },
  debugEmptyText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    padding: 16,
  },
  debugMessageCard: {
    borderTopColor: theme.colors.divider,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  debugMessageType: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  debugMessageText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
});
