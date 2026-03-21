import { Ionicons } from '@expo/vector-icons';
import {
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/montserrat';
import { NavigationContainer, Theme as NavigationTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { appConfig } from './src/constants/appConfig';
import { theme } from './src/constants/theme';
import { WalburgAppProvider } from './src/context/WalburgAppContext';
import { GradesScreen } from './src/screens/GradesScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { NewsArticleScreen } from './src/screens/NewsArticleScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ScheduleScreen } from './src/screens/ScheduleScreen';
import { HomeStackParamList } from './src/types/navigation';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();

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
      <HomeStack.Screen component={NewsArticleScreen} name="NewsArticle" />
    </HomeStack.Navigator>
  );
}

function RootNavigator() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWideLayout = width >= appConfig.layout.landscapeWidth;
  const horizontalInset = isWideLayout ? Math.max(28, width * 0.12) : 0;

  return (
    <NavigationContainer theme={navigationTheme}>
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
        <Tab.Screen component={ScheduleScreen} name="Rooster" options={{ title: 'Rooster' }} />
        <Tab.Screen component={GradesScreen} name="Cijfers" options={{ title: 'Cijfers' }} />
        <Tab.Screen component={ProfileScreen} name="Profiel" options={{ title: 'Profiel' }} />
      </Tab.Navigator>
    </NavigationContainer>
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
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.brandBlue,
          flex: 1,
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={theme.colors.inkOnDark} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <WalburgAppProvider>
        <RootNavigator />
      </WalburgAppProvider>
    </SafeAreaProvider>
  );
}
