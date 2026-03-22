import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../constants/theme';
import { useWalburgApp } from '../context/WalburgAppContext';
import { formatDayLabel, formatTime } from '../lib/date';

function formatSyncLabel(value?: string) {
  if (!value) {
    return 'Nog niet';
  }

  return `${formatDayLabel(value)} | ${formatTime(value)}`;
}

export function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { clearError, errorMessage, isBusy, loginWithMagister, logout, session } = useWalburgApp();

  async function handleOAuthLogin() {
    try {
      await loginWithMagister();
      Alert.alert('Ingelogd', 'Je account en rooster zijn opgehaald via Magister.');
    } catch (error) {
      Alert.alert('Login mislukt', error instanceof Error ? error.message : 'Onbekende fout.');
    }
  }

  async function handleLogout() {
    await logout();
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        contentContainerStyle={{ paddingBottom: 112 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { paddingTop: insets.top + 24 }]}>
          <Text style={styles.eyebrow}>Account</Text>
          <Text style={styles.title}>{session?.fullName ?? 'Niet ingelogd'}</Text>
          <Text style={styles.copy}>
            {session
              ? 'Je Magister-account is gekoppeld.'
              : 'Log in met Magister om je naam, rooster en synchronisatie te laden.'}
          </Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorStrip}>
            <Ionicons color={theme.colors.warning} name="warning-outline" size={18} />
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Pressable onPress={clearError}>
              <Ionicons color={theme.colors.warning} name="close" size={18} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Sessie</Text>
            <Text style={styles.detailValue}>{session ? 'Actief' : 'Inactief'}</Text>
          </View>
          {session ? (
            <>
              <View style={[styles.detailRow, styles.detailRowBorder]}>
                <Text style={styles.detailLabel}>Naam</Text>
                <Text style={styles.detailValue}>{session.fullName}</Text>
              </View>
              <View style={[styles.detailRow, styles.detailRowBorder]}>
                <Text style={styles.detailLabel}>Laatst bijgewerkt</Text>
                <Text style={styles.detailValue}>{formatSyncLabel(session.lastSyncedAt)}</Text>
              </View>
            </>
          ) : null}
        </View>

        <LinearGradient
          colors={[theme.colors.brandGreen, theme.colors.brandCyan]}
          end={{ x: 1, y: 0.8 }}
          start={{ x: 0, y: 0.2 }}
          style={styles.actionPanel}
        >
          {!session ? (
            <>
              <Text style={styles.actionTitle}>Inloggen met Magister</Text>
              <Text style={styles.actionCopy}>
                Gebruik de Magister OAuth-popup om direct een actieve sessie op te bouwen.
              </Text>
              <Pressable disabled={isBusy} onPress={handleOAuthLogin} style={styles.primaryButton}>
                {isBusy ? (
                  <ActivityIndicator color={theme.colors.brandBlue} />
                ) : (
                  <Text style={styles.primaryButtonText}>Inloggen</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.actionTitle}>Je account is actief</Text>
              <Text style={styles.actionCopy}>Als je wilt kun je deze sessie hier direct beeindigen.</Text>
              <Pressable disabled={isBusy} onPress={handleLogout} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Uitloggen</Text>
              </Pressable>
            </>
          )}
        </LinearGradient>
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
    backgroundColor: theme.colors.background,
    paddingBottom: 12,
    paddingHorizontal: 18,
  },
  eyebrow: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 34,
    lineHeight: 40,
    marginTop: 12,
  },
  copy: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 320,
  },
  errorStrip: {
    alignItems: 'center',
    backgroundColor: '#FFF1EF',
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
  card: {
    backgroundColor: theme.colors.paper,
    borderRadius: theme.radius.md,
    marginHorizontal: 18,
    marginTop: 18,
    overflow: 'hidden',
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    fontSize: 13,
  },
  detailValue: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    maxWidth: '62%',
    textAlign: 'right',
  },
  actionPanel: {
    borderRadius: theme.radius.md,
    marginHorizontal: 18,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  actionTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 28,
    lineHeight: 34,
  },
  actionCopy: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 300,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 52,
  },
  primaryButtonText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.heavy,
    fontSize: 15,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(23,50,94,0.16)',
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 52,
  },
  secondaryButtonText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 15,
  },
});
