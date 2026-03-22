import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import { ProfileStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Inbox'>;

function formatMessageDate(value: string) {
  return `${formatDayLabel(value)} | ${formatTime(value)}`;
}

export function InboxScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { inboxPreview, isBusy, refreshInbox, unreadInboxCount } = useWalburgApp();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await refreshInbox();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshInbox]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 112 + insets.bottom }}
        refreshControl={
          <RefreshControl onRefresh={handleRefresh} refreshing={isRefreshing} tintColor={theme.colors.brandBlue} />
        }
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[theme.colors.brandBlueDeep, theme.colors.brandBlue, theme.colors.brandCyan]}
          end={{ x: 1, y: 0.9 }}
          start={{ x: 0, y: 0 }}
          style={[styles.hero, { paddingTop: insets.top + 18 }]}
        >
          <View style={styles.heroInner}>
            <View style={styles.heroTopRow}>
              <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
                <Ionicons color={theme.colors.inkOnDark} name="arrow-back" size={20} />
              </Pressable>
              <Pressable onPress={() => navigation.navigate('ComposeMessage')} style={styles.composeButton}>
                <Ionicons color={theme.colors.inkOnDark} name="create-outline" size={18} />
                <Text style={styles.composeButtonText}>Nieuw</Text>
              </Pressable>
            </View>
            <Text style={styles.heroEyebrow}>Mail</Text>
            <Text style={styles.heroTitle}>Inbox</Text>
            <Text style={styles.heroText}>
              Bekijk je recente berichten, open bijlagen en houd ongelezen mail snel in de gaten.
            </Text>
            {unreadInboxCount > 0 ? (
              <View style={styles.unreadBubble}>
                <Text style={styles.unreadBubbleText}>
                  {unreadInboxCount > 9 ? '9+' : unreadInboxCount} ongelezen
                </Text>
              </View>
            ) : null}
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Postvak in</Text>
            {isBusy && !isRefreshing ? <ActivityIndicator color={theme.colors.brandBlue} size="small" /> : null}
          </View>

          {inboxPreview.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons color={theme.colors.brandBlue} name="mail-open-outline" size={22} />
              <Text style={styles.emptyTitle}>Nog geen berichten geladen</Text>
              <Text style={styles.emptyText}>Trek omlaag om je inbox op te halen uit Magister.</Text>
            </View>
          ) : (
            inboxPreview.map((message) => (
              <Pressable
                key={message.id}
                onPress={() => navigation.navigate('InboxMessage', { messageId: message.id })}
                style={[styles.messageCard, !message.isRead ? styles.messageCardUnread : null]}
              >
                <View style={styles.messageRow}>
                  <View style={styles.messageCopy}>
                    <View style={styles.messageTitleRow}>
                      {!message.isRead ? <View style={styles.unreadDot} /> : null}
                      <Text numberOfLines={2} style={[styles.messageSubject, !message.isRead ? styles.messageSubjectUnread : null]}>
                        {message.subject}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={styles.messageSender}>
                      {message.sender?.name ?? 'Onbekende afzender'}
                    </Text>
                    <Text style={styles.messageMeta}>{formatMessageDate(message.sentAt)}</Text>
                  </View>

                  <View style={styles.messageBadges}>
                    {message.hasPriority ? (
                      <View style={[styles.messageBadge, styles.priorityBadge]}>
                        <Ionicons color={theme.colors.brandBlueDeep} name="flag" size={12} />
                      </View>
                    ) : null}
                    {message.hasAttachments ? (
                      <View style={styles.messageBadge}>
                        <Ionicons color={theme.colors.brandBlue} name="attach-outline" size={14} />
                      </View>
                    ) : null}
                    <Ionicons color={theme.colors.brandBlue} name="chevron-forward" size={18} />
                  </View>
                </View>
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
    minHeight: 238,
    paddingBottom: 28,
    paddingHorizontal: 18,
  },
  heroInner: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    width: '100%',
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  composeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  composeButtonText: {
    color: theme.colors.inkOnDark,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
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
  heroText: {
    color: 'rgba(255,255,255,0.84)',
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    maxWidth: 540,
  },
  unreadBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: theme.radius.pill,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  unreadBubbleText: {
    color: theme.colors.inkOnDark,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
  },
  content: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    paddingHorizontal: 18,
    paddingTop: 20,
    width: '100%',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 24,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  emptyTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    marginTop: 12,
  },
  emptyText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  messageCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  messageCardUnread: {
    borderColor: '#9CB4E8',
    shadowColor: theme.colors.brandBlue,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  messageRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  messageCopy: {
    flex: 1,
  },
  messageTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  unreadDot: {
    backgroundColor: theme.colors.brandBlue,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  messageSubject: {
    color: theme.colors.brandBlueDeep,
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    lineHeight: 20,
  },
  messageSubjectUnread: {
    fontFamily: theme.fonts.heavy,
  },
  messageSender: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    marginTop: 8,
  },
  messageMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    marginTop: 5,
  },
  messageBadges: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  messageBadge: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 12,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  priorityBadge: {
    backgroundColor: '#E6F0FF',
  },
});
