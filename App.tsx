import { Ionicons } from '@expo/vector-icons';
import {
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/montserrat';
import {
  NavigationContainer,
  Theme as NavigationTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { appConfig } from './src/constants/appConfig';
import { theme } from './src/constants/theme';
import { useWalburgApp, WalburgAppProvider } from './src/context/WalburgAppContext';
import { AbsenceScreen } from './src/screens/AbsenceScreen';
import { ComposeMessageScreen } from './src/screens/ComposeMessageScreen';
import { FloorPlanScreen } from './src/screens/FloorPlanScreen';
import { GradesScreen } from './src/screens/GradesScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { InboxMessageScreen } from './src/screens/InboxMessageScreen';
import { InboxScreen } from './src/screens/InboxScreen';
import { LearningResourcesScreen } from './src/screens/LearningResourcesScreen';
import { NewsArticleScreen } from './src/screens/NewsArticleScreen';
import { ActivityDetailsScreen } from './src/screens/ActivityDetailsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { SchoolPageScreen } from './src/screens/SchoolPageScreen';
import { SchoolStaffDirectoryScreen } from './src/screens/SchoolStaffDirectoryScreen';
import { SchoolStaffMemberScreen } from './src/screens/SchoolStaffMemberScreen';
import { ScheduleScreen } from './src/screens/ScheduleScreen';
import {
  HomeStackParamList,
  ProfileStackParamList,
  RootTabParamList,
  ScheduleStackParamList,
} from './src/types/navigation';

const Tab = createBottomTabNavigator<RootTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const ScheduleStack = createNativeStackNavigator<ScheduleStackParamList>();
const loadingImage = require('./assets/loading.png');
const navigationRef = createNavigationContainerRef<RootTabParamList>();

const navigationTheme: NavigationTheme = {
  dark: false,
  colors: {
    primary: theme.colors.brandGreen,
    background: theme.colors.background,
    card: theme.colors.brandBlue,
    text: theme.colors.text,
    border: 'transparent',
    notification: theme.colors.brandGreen,
  },
  fonts: {
    regular: { fontFamily: theme.fonts.regular, fontWeight: '500' },
    medium: { fontFamily: theme.fonts.medium, fontWeight: '600' },
    bold: { fontFamily: theme.fonts.bold, fontWeight: '700' },
    heavy: { fontFamily: theme.fonts.heavy, fontWeight: '800' },
  },
};

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator
      screenOptions={{
        animation: 'slide_from_right',
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
        headerShown: false,
      }}
    >
      <HomeStack.Screen component={HomeScreen} name="HomeIndex" />
      <HomeStack.Screen component={FloorPlanScreen} name="FloorPlan" />
      <HomeStack.Screen component={NewsArticleScreen} name="NewsArticle" />
      <HomeStack.Screen component={SchoolPageScreen} name="SchoolPage" />
      <HomeStack.Screen component={SchoolStaffDirectoryScreen} name="SchoolStaffDirectory" />
      <HomeStack.Screen component={SchoolStaffMemberScreen} name="SchoolStaffMember" />
    </HomeStack.Navigator>
  );
}

function ScheduleStackNavigator() {
  return (
    <ScheduleStack.Navigator
      screenOptions={{
        animation: 'slide_from_right',
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
        headerShown: false,
      }}
    >
      <ScheduleStack.Screen component={ScheduleScreen} name="ScheduleIndex" />
      <ScheduleStack.Screen component={ActivityDetailsScreen} name="ActivityDetails" />
    </ScheduleStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        animation: 'slide_from_right',
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
        headerShown: false,
      }}
    >
      <ProfileStack.Screen component={ProfileScreen} name="ProfileIndex" />
      <ProfileStack.Screen component={InboxScreen} name="Inbox" />
      <ProfileStack.Screen component={InboxMessageScreen} name="InboxMessage" />
      <ProfileStack.Screen component={ComposeMessageScreen} name="ComposeMessage" />
      <ProfileStack.Screen component={AbsenceScreen} name="AbsenceOverview" />
      <ProfileStack.Screen component={LearningResourcesScreen} name="LearningResources" />
    </ProfileStack.Navigator>
  );
}

function getStringValue(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function navigateFromNotificationData(data?: Record<string, unknown>) {
  if (!data || !navigationRef.isReady()) {
    return false;
  }

  const messageId = Number(getStringValue(data.messageId));

  if (Number.isFinite(messageId) && messageId > 0) {
    navigationRef.navigate('Profiel', {
      screen: 'InboxMessage',
      params: {
        messageId,
      },
    });
    return true;
  }

  const appointmentId = getStringValue(data.appointmentId);

  if (appointmentId) {
    navigationRef.navigate('Rooster', {
      screen: 'ScheduleIndex',
      params: {
        focusAppointmentId: appointmentId,
        focusDate: getStringValue(data.appointmentStart),
        focusNonce: String(Date.now()),
      },
    });
    return true;
  }

  const gradeId = getStringValue(data.gradeId);

  if (gradeId) {
    navigationRef.navigate('Cijfers', {
      focusGradeId: gradeId,
      focusNonce: String(Date.now()),
    });
    return true;
  }

  return false;
}

function RootNavigator({ onReady }: { onReady?: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { unreadInboxCount } = useWalburgApp();
  const isWideLayout = width >= appConfig.layout.landscapeWidth;
  const horizontalInset = isWideLayout ? Math.max(28, width * 0.12) : 0;

  return (
    <NavigationContainer onReady={onReady} ref={navigationRef} theme={navigationTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarShowLabel: true,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: theme.colors.inkOnDark,
          tabBarInactiveTintColor: theme.colors.tabInactive,
          tabBarStyle: {
            position: 'absolute',
            left: horizontalInset,
            right: horizontalInset,
            bottom: 0,
            height: 70 + Math.max(insets.bottom, 10),
            paddingBottom: Math.max(insets.bottom, 12),
            paddingTop: 10,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            backgroundColor: theme.colors.brandBlue,
            borderTopWidth: 0,
            elevation: 0,
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.22,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
          },
          tabBarItemStyle: {
            paddingVertical: 2,
          },
          tabBarLabelStyle: {
            fontFamily: theme.fonts.bold,
            fontSize: 12,
          },
          tabBarBadgeStyle: {
            backgroundColor: theme.colors.brandCyan,
            color: theme.colors.brandBlueDeep,
            fontFamily: theme.fonts.heavy,
            fontSize: 11,
          },
          tabBarIcon: ({ color, size, focused }) => {
            const iconName =
              route.name === 'Home'
                ? focused
                  ? 'home'
                  : 'home-outline'
                : route.name === 'Rooster'
                  ? focused
                    ? 'create'
                    : 'create-outline'
                  : route.name === 'Cijfers'
                    ? focused
                      ? 'stats-chart'
                      : 'stats-chart-outline'
                    : focused
                      ? 'person'
                      : 'person-outline';

            return <Ionicons color={color} name={iconName} size={size + 1} />;
          },
          sceneStyle: {
            backgroundColor: theme.colors.background,
          },
        })}
      >
        <Tab.Screen component={HomeStackNavigator} name="Home" options={{ title: 'Home' }} />
        <Tab.Screen component={ScheduleStackNavigator} name="Rooster" options={{ title: 'Rooster' }} />
        <Tab.Screen component={GradesScreen} name="Cijfers" options={{ title: 'Cijfers' }} />
        <Tab.Screen
          component={ProfileStackNavigator}
          name="Profiel"
          options={{
            title: 'Profiel',
            tabBarBadge: unreadInboxCount > 0 ? (unreadInboxCount > 9 ? '9+' : unreadInboxCount) : undefined,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function StartupOverlay({ opacity = 1 }: { opacity?: Animated.Value | number }) {
  return (
    <Animated.View style={[styles.startupOverlay, { opacity }]}>
      <Image resizeMode="cover" source={loadingImage} style={styles.startupImage} />
      <View style={styles.startupShade} />
    </Animated.View>
  );
}

function OnboardingModal({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const steps = useMemo(
    () => [
      {
        title: 'Welkom bij Walburg',
        text: 'Bekijk je rooster, cijfers, activiteiten en schoolinformatie in een rustiger en sneller overzicht.',
      },
      {
        title: 'Lessen en lokalen',
        text: 'Open je rooster, tik op een les en gebruik de plattegrond om meteen te zien waar je moet zijn.',
      },
      {
        title: 'Meldingen en demo',
        text: 'Zet lesmeldingen aan voor 5 minuten van tevoren en gebruik demo mode als je nette screenshots wilt maken.',
      },
    ],
    [],
  );
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  return (
    <Modal animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent transparent visible>
      <View style={styles.onboardingScrim}>
        <View style={styles.onboardingCard}>
          <Text style={styles.onboardingEyebrow}>Eerste keer</Text>
          <Text style={styles.onboardingTitle}>{step.title}</Text>
          <Text style={styles.onboardingText}>{step.text}</Text>

          <View style={styles.onboardingDots}>
            {steps.map((entry, index) => (
              <View
                key={entry.title}
                style={[styles.onboardingDot, index === stepIndex ? styles.onboardingDotActive : null]}
              />
            ))}
          </View>

          <View style={styles.onboardingActions}>
            {stepIndex > 0 ? (
              <Pressable onPress={() => setStepIndex((current) => current - 1)} style={styles.onboardingSecondary}>
                <Text style={styles.onboardingSecondaryText}>Vorige</Text>
              </Pressable>
            ) : (
              <View style={styles.onboardingGhost} />
            )}

            <Pressable
              onPress={() => {
                if (isLastStep) {
                  onComplete();
                  return;
                }

                setStepIndex((current) => current + 1);
              }}
              style={styles.onboardingPrimary}
            >
              <Text style={styles.onboardingPrimaryText}>{isLastStep ? 'Start app' : 'Volgende'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AppShell() {
  const { isBusy, isHydrating, preferences, updatePreferences } = useWalburgApp();
  const [minimumStartupElapsed, setMinimumStartupElapsed] = useState(false);
  const [showStartupOverlay, setShowStartupOverlay] = useState(true);
  const [hasEvaluatedOnboarding, setHasEvaluatedOnboarding] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const startupOpacity = useRef(new Animated.Value(1)).current;
  const startupFadeStartedRef = useRef(false);
  const handledNotificationIdsRef = useRef<Set<string>>(new Set());
  const pendingNotificationDataRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    function handleNotificationResponse(response: Notifications.NotificationResponse | null) {
      if (!response) {
        return;
      }

      const identifier = response.notification.request.identifier;

      if (handledNotificationIdsRef.current.has(identifier)) {
        return;
      }

      handledNotificationIdsRef.current.add(identifier);

      const nextData = response.notification.request.content.data as Record<string, unknown> | undefined;

      if (!navigateFromNotificationData(nextData)) {
        pendingNotificationDataRef.current = nextData ?? null;
      }
    }

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        handleNotificationResponse(response);
      })
      .catch(() => {
        return;
      });

    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!navigationReady || !pendingNotificationDataRef.current) {
      return;
    }

    if (navigateFromNotificationData(pendingNotificationDataRef.current)) {
      pendingNotificationDataRef.current = null;
    }
  }, [navigationReady]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setMinimumStartupElapsed(true);
    }, 3000);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!showStartupOverlay) {
      return;
    }

    if (!minimumStartupElapsed || isHydrating || isBusy) {
      return;
    }

    if (startupFadeStartedRef.current) {
      return;
    }

    startupFadeStartedRef.current = true;
    Animated.timing(startupOpacity, {
      duration: 300,
      toValue: 0,
      useNativeDriver: true,
    }).start(() => {
      setShowStartupOverlay(false);
    });
  }, [isBusy, isHydrating, minimumStartupElapsed, showStartupOverlay, startupOpacity]);

  useEffect(() => {
    if (showStartupOverlay || hasEvaluatedOnboarding) {
      return;
    }

    setShowOnboarding(!preferences.onboardingCompleted);
    setHasEvaluatedOnboarding(true);
  }, [hasEvaluatedOnboarding, preferences.onboardingCompleted, showStartupOverlay]);

  return (
    <View style={styles.appShell}>
      <RootNavigator onReady={() => setNavigationReady(true)} />
      {showStartupOverlay ? <StartupOverlay opacity={startupOpacity} /> : null}
      {showOnboarding ? (
        <OnboardingModal
          onComplete={() => {
            setShowOnboarding(false);
            updatePreferences({ onboardingCompleted: true }).catch(() => {
              return;
            });
          }}
        />
      ) : null}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });

  if (!fontsLoaded) {
    return <StartupOverlay />;
  }

  return (
    <SafeAreaProvider>
      <WalburgAppProvider>
        <AppShell />
      </WalburgAppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  startupOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.brandBlueDeep,
    zIndex: 20,
  },
  startupImage: {
    height: '100%',
    width: '100%',
  },
  startupShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 35, 68, 0.08)',
  },
  onboardingScrim: {
    alignItems: 'center',
    backgroundColor: 'rgba(14, 27, 51, 0.48)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  onboardingCard: {
    backgroundColor: theme.colors.paper,
    borderRadius: 28,
    maxWidth: 520,
    paddingHorizontal: 22,
    paddingVertical: 24,
    width: '100%',
  },
  onboardingEyebrow: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  onboardingTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 30,
    lineHeight: 36,
    marginTop: 10,
  },
  onboardingText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
  },
  onboardingDots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
  },
  onboardingDot: {
    backgroundColor: '#D7E2F0',
    borderRadius: theme.radius.pill,
    height: 8,
    width: 8,
  },
  onboardingDotActive: {
    backgroundColor: theme.colors.brandBlue,
    width: 24,
  },
  onboardingActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  onboardingGhost: {
    flex: 1,
  },
  onboardingSecondary: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  onboardingSecondaryText: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 15,
  },
  onboardingPrimary: {
    alignItems: 'center',
    backgroundColor: theme.colors.brandBlue,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  onboardingPrimaryText: {
    color: theme.colors.inkOnDark,
    fontFamily: theme.fonts.heavy,
    fontSize: 15,
  },
});
