import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloorPlanBrowser } from '../components/FloorPlanBrowser';
import { appConfig } from '../constants/appConfig';
import { theme } from '../constants/theme';
import { HomeStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<HomeStackParamList, 'FloorPlan'>;

export function FloorPlanScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [isMapInteracting, setIsMapInteracting] = useState(false);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 112 + insets.bottom }}
        scrollEnabled={!isMapInteracting}
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
            <Text style={styles.heroEyebrow}>Onze school</Text>
            <Text style={styles.heroTitle}>Plattegrond</Text>
            <Text style={styles.heroText}>
              Zoek direct een lokaal of blader rustig per verdieping door het gebouw zonder automatische sprongen.
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <FloorPlanBrowser
            description="Zoek meteen naar een lokaal of kies zelf een verdieping in de algemene plattegrond."
            initialFocusNonce={route.params?.focusNonce}
            initialLocation={route.params?.focusLocation}
            onMapInteractionChange={setIsMapInteracting}
            title="Algemene plattegrond"
          />
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
  heroText: {
    color: 'rgba(255,255,255,0.84)',
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    maxWidth: 500,
  },
  content: {
    alignSelf: 'center',
    maxWidth: appConfig.layout.maxContentWidth,
    paddingHorizontal: 18,
    paddingTop: 20,
    width: '100%',
  },
});
