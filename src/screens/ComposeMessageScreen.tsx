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
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appConfig } from '../constants/appConfig';
import { theme } from '../constants/theme';
import { useWalburgApp } from '../context/WalburgAppContext';
import { searchMessageContactsFromTokens, sendMessageFromTokens } from '../services/magister';
import { MagisterContactPerson } from '../types/magister';
import { ProfileStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ComposeMessage'>;

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function toMessageHtml(value: string) {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.length > 0
    ? paragraphs
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
        .join('')
    : '<p></p>';
}

export function ComposeMessageScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { refreshInbox, session } = useWalburgApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MagisterContactPerson[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<MagisterContactPerson[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isPriority, setIsPriority] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    let active = true;

    if (!session?.accessToken || query.trim().length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(() => {
      searchMessageContactsFromTokens(session, query, 40)
        .then((nextResults) => {
          if (!active) {
            return;
          }

          setResults(nextResults);
        })
        .catch(() => {
          if (!active) {
            return;
          }

          setResults([]);
        })
        .finally(() => {
          if (active) {
            setIsSearching(false);
          }
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, session]);

  const filteredResults = useMemo(
    () => results.filter((result) => !selectedRecipients.some((recipient) => recipient.id === result.id)),
    [results, selectedRecipients],
  );

  function addRecipient(person: MagisterContactPerson) {
    setSelectedRecipients((current) => [...current, person]);
    setQuery('');
    setResults([]);
  }

  function removeRecipient(personId: number) {
    setSelectedRecipients((current) => current.filter((recipient) => recipient.id !== personId));
  }

  async function handleSend() {
    if (!session?.accessToken) {
      Alert.alert('Niet ingelogd', 'Log opnieuw in om een bericht te versturen.');
      return;
    }

    if (selectedRecipients.length === 0 || !subject.trim() || !body.trim()) {
      Alert.alert('Nog niet compleet', 'Kies minimaal een ontvanger en vul onderwerp en bericht in.');
      return;
    }

    setIsSending(true);

    try {
      await sendMessageFromTokens(session, {
        recipients: selectedRecipients.map((recipient) => ({
          id: recipient.id,
          type: recipient.type === 'groep' ? 'groep' : 'persoon',
        })),
        hasPriority: isPriority,
        bodyHtml: toMessageHtml(body),
        subject: subject.trim(),
      });
      await refreshInbox();
      navigation.goBack();
    } catch (sendError) {
      Alert.alert('Versturen mislukt', sendError instanceof Error ? sendError.message : 'Probeer het opnieuw.');
    } finally {
      setIsSending(false);
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
            <View style={styles.heroTopRow}>
              <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
                <Ionicons color={theme.colors.inkOnDark} name="arrow-back" size={20} />
              </Pressable>
              <Pressable disabled={isSending} onPress={handleSend} style={styles.sendButton}>
                {isSending ? (
                  <ActivityIndicator color={theme.colors.inkOnDark} size="small" />
                ) : (
                  <>
                    <Ionicons color={theme.colors.inkOnDark} name="send-outline" size={18} />
                    <Text style={styles.sendButtonText}>Verstuur</Text>
                  </>
                )}
              </Pressable>
            </View>
            <Text style={styles.heroEyebrow}>Mail</Text>
            <Text style={styles.heroTitle}>Nieuw bericht</Text>
            <Text style={styles.heroText}>
              Zoek personen of groepen, stel je onderwerp in en verstuur direct vanuit de app.
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>Ontvangers</Text>
            <TextInput
              onChangeText={setQuery}
              placeholder="Zoek op naam of klas"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={query}
            />

            {selectedRecipients.length > 0 ? (
              <View style={styles.recipientList}>
                {selectedRecipients.map((recipient) => (
                  <View key={recipient.id} style={styles.recipientChip}>
                    <Text numberOfLines={1} style={styles.recipientChipText}>
                      {recipient.displayName}
                    </Text>
                    <Pressable onPress={() => removeRecipient(recipient.id)}>
                      <Ionicons color={theme.colors.brandBlue} name="close" size={16} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            {isSearching ? <ActivityIndicator color={theme.colors.brandBlue} style={styles.searchLoader} /> : null}

            {filteredResults.length > 0 ? (
              <View style={styles.resultsCard}>
                {filteredResults.slice(0, 10).map((result) => (
                  <Pressable key={`${result.id}-${result.type}`} onPress={() => addRecipient(result)} style={styles.resultRow}>
                    <View style={styles.resultCopy}>
                      <Text style={styles.resultTitle}>{result.displayName}</Text>
                      <Text style={styles.resultMeta}>
                        {result.className ? `${result.className} | ` : ''}
                        {result.type}
                      </Text>
                    </View>
                    <Ionicons color={theme.colors.brandBlue} name="add-circle-outline" size={18} />
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Onderwerp</Text>
            <TextInput
              onChangeText={setSubject}
              placeholder="Onderwerp"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={subject}
            />

            <View style={[styles.priorityRow, styles.fieldSpacing]}>
              <View style={styles.priorityCopy}>
                <Text style={styles.priorityLabel}>Markeer als belangrijk</Text>
                <Text style={styles.priorityMeta}>Verstuur dit bericht met prioriteit.</Text>
              </View>
              <Switch
                onValueChange={setIsPriority}
                thumbColor={theme.colors.paper}
                trackColor={{ false: '#B8C8E2', true: theme.colors.brandBlue }}
                value={isPriority}
              />
            </View>

            <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Bericht</Text>
            <TextInput
              multiline
              onChangeText={setBody}
              placeholder="Typ je bericht"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.messageInput]}
              textAlignVertical="top"
              value={body}
            />
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
    minHeight: 228,
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
  sendButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  sendButtonText: {
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
  formCard: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  fieldLabel: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    marginBottom: 10,
  },
  fieldSpacing: {
    marginTop: 18,
  },
  input: {
    backgroundColor: '#F8FBFF',
    borderColor: theme.colors.divider,
    borderRadius: 14,
    borderWidth: 1,
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  messageInput: {
    minHeight: 180,
  },
  recipientList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  recipientChip: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recipientChipText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    maxWidth: 220,
  },
  searchLoader: {
    marginTop: 12,
  },
  resultsCard: {
    backgroundColor: '#F8FBFF',
    borderColor: theme.colors.divider,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    overflow: 'hidden',
  },
  resultRow: {
    alignItems: 'center',
    borderTopColor: theme.colors.divider,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resultCopy: {
    flex: 1,
  },
  resultTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
  },
  resultMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    marginTop: 4,
  },
  priorityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priorityCopy: {
    flex: 1,
    paddingRight: 16,
  },
  priorityLabel: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
  },
  priorityMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    marginTop: 4,
  },
});
