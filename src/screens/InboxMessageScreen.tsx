import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
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
import { formatDayLabel, formatTime } from '../lib/date';
import { openExternalUrl } from '../lib/externalLinks';
import { fetchMessageDetailFromTokens, resolveAuthenticatedExternalUrl } from '../services/magister';
import { MagisterMessageDetail } from '../types/magister';
import { ProfileStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<ProfileStackParamList, 'InboxMessage'>;

function formatMessageDate(value: string) {
  return `${formatDayLabel(value)} • ${formatTime(value)}`;
}

export function InboxMessageScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { markMessageReadLocally, session } = useWalburgApp();
  const [detail, setDetail] = useState<MagisterMessageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadMessage() {
      if (!session?.accessToken) {
        setError('Je moet opnieuw inloggen om dit bericht te openen.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const nextDetail = await fetchMessageDetailFromTokens(session, route.params.messageId);

        if (!active) {
          return;
        }

        setDetail(nextDetail);
        markMessageReadLocally(route.params.messageId);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Bericht laden mislukte.');
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadMessage().catch(() => {
      return;
    });

    return () => {
      active = false;
    };
  }, [markMessageReadLocally, route.params.messageId, session]);

  const bodyParagraphs = useMemo(() => detail?.bodyText.split(/\n{2,}/).filter(Boolean) ?? [], [detail?.bodyText]);

  async function handleOpenAttachment(attachmentId: number, downloadLink?: string | null) {
    if (!session?.accessToken || !downloadLink) {
      return;
    }

    setOpeningAttachmentId(attachmentId);

    try {
      const resolvedUrl = await resolveAuthenticatedExternalUrl(session, downloadLink);
      await openExternalUrl(resolvedUrl, 'Deze bijlage kon niet worden geopend.');
    } catch (openError) {
      Alert.alert('Openen mislukt', openError instanceof Error ? openError.message : 'Deze bijlage kon niet worden geopend.');
    } finally {
      setOpeningAttachmentId(null);
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
            <Text style={styles.heroEyebrow}>Inbox</Text>
            <Text style={styles.heroTitle}>{detail?.subject ?? 'Bericht'}</Text>
            <Text style={styles.heroText}>
              {detail ? `${detail.sender?.name ?? 'Onbekende afzender'} • ${formatMessageDate(detail.sentAt)}` : 'Bericht wordt geladen.'}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={theme.colors.brandBlue} />
              <Text style={styles.loadingText}>Bericht laden...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorCard}>
              <Ionicons color={theme.colors.warning} name="warning-outline" size={22} />
              <Text style={styles.errorTitle}>Bericht kon niet worden geladen</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : detail ? (
            <>
              <View style={styles.metaCard}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Afzender</Text>
                  <Text style={styles.metaValue}>{detail.sender?.name ?? '-'}</Text>
                </View>
                <View style={[styles.metaRow, styles.metaRowBorder]}>
                  <Text style={styles.metaLabel}>Verzonden</Text>
                  <Text style={styles.metaValue}>{formatMessageDate(detail.sentAt)}</Text>
                </View>
                <View style={[styles.metaRow, styles.metaRowBorder]}>
                  <Text style={styles.metaLabel}>Aan</Text>
                  <Text numberOfLines={2} style={styles.metaValue}>
                    {detail.recipients.map((recipient) => recipient.displayName).join(', ') || '-'}
                  </Text>
                </View>
                {detail.ccRecipients.length > 0 ? (
                  <View style={[styles.metaRow, styles.metaRowBorder]}>
                    <Text style={styles.metaLabel}>CC</Text>
                    <Text numberOfLines={2} style={styles.metaValue}>
                      {detail.ccRecipients.map((recipient) => recipient.displayName).join(', ')}
                    </Text>
                  </View>
                ) : null}
              </View>

              {detail.attachments.length > 0 ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Bijlagen</Text>
                  {detail.attachments.map((attachment) => (
                    <Pressable
                      key={attachment.id}
                      onPress={() => handleOpenAttachment(attachment.id, attachment.downloadLink)}
                      style={styles.attachmentRow}
                    >
                      <View style={styles.attachmentIcon}>
                        <Ionicons color={theme.colors.brandBlue} name="attach-outline" size={18} />
                      </View>
                      <View style={styles.attachmentCopy}>
                        <Text numberOfLines={2} style={styles.attachmentName}>
                          {attachment.name}
                        </Text>
                        <Text style={styles.attachmentMeta}>
                          {attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : 'Bestand'}
                        </Text>
                      </View>
                      {openingAttachmentId === attachment.id ? (
                        <ActivityIndicator color={theme.colors.brandBlue} size="small" />
                      ) : (
                        <Ionicons color={theme.colors.brandBlue} name="open-outline" size={18} />
                      )}
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Inhoud</Text>
                {bodyParagraphs.length > 0 ? (
                  bodyParagraphs.map((paragraph, index) => (
                    <Text key={`${index}-${paragraph.slice(0, 12)}`} style={styles.paragraph}>
                      {paragraph}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.paragraph}>Dit bericht bevat geen zichtbare tekst.</Text>
                )}
              </View>
            </>
          ) : null}
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
    fontSize: 30,
    lineHeight: 36,
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
  loadingCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  loadingText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    marginTop: 12,
  },
  errorCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  errorTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    marginTop: 12,
  },
  errorText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  metaCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  metaRow: {
    gap: 10,
    paddingVertical: 10,
  },
  metaRowBorder: {
    borderTopColor: theme.colors.divider,
    borderTopWidth: 1,
  },
  metaLabel: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 21,
  },
  sectionCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sectionTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 18,
    marginBottom: 12,
  },
  attachmentRow: {
    alignItems: 'center',
    borderTopColor: theme.colors.divider,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  attachmentIcon: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 14,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  attachmentCopy: {
    flex: 1,
  },
  attachmentName: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    lineHeight: 18,
  },
  attachmentMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    marginTop: 4,
  },
  paragraph: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
  },
});
