import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Changa_400Regular,
  Changa_500Medium,
  Changa_600SemiBold,
  Changa_700Bold,
  useFonts,
} from '@expo-google-fonts/changa';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { I18nManager, Platform, StatusBar, StyleSheet } from 'react-native';
import { AuthProvider } from '@/context/AuthContext';
import { DataProvider } from '@/context/DataContext';
import { ToastProvider } from '@/components/Toast';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';

const isAndroid = Platform.OS === 'android';
const headerCommonOptions = {
  headerStyle: { backgroundColor: '#0C4A6E' },
  headerTintColor: '#FFFFFF',
  headerTitleAlign: 'center' as const,
  headerTitleStyle: { fontFamily: 'Changa_600SemiBold', fontSize: 17, color: '#FFFFFF' },
  headerBackTitle: isAndroid ? '' : 'رجوع',
  headerBackButtonDisplayMode: isAndroid ? 'minimal' as const : 'default' as const,
  headerElevation: isAndroid ? 4 : 0,
  headerShadowVisible: !isAndroid,
};

if (Platform.OS !== 'web') {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return (
    <StatusBar
      translucent
      backgroundColor="transparent"
      barStyle={isDark ? 'light-content' : 'light-content'}
    />
  );
}

function RootLayoutNav() {
  const { isDark } = useTheme();
  const headerBg = isDark ? '#1E293B' : '#0C4A6E';
  const headerCommonDynamic = {
    ...headerCommonOptions,
    headerStyle: { backgroundColor: headerBg },
  };
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="orders"
        options={{ ...headerCommonDynamic, headerShown: true, headerTitle: 'وصل الطلب' }}
      />
      <Stack.Screen
        name="suppliers"
        options={{ ...headerCommonDynamic, headerShown: true, headerTitle: 'حالة الموردين' }}
      />
      <Stack.Screen
        name="notifications"
        options={{ ...headerCommonDynamic, headerShown: true, headerTitle: 'الإشعارات' }}
      />
      <Stack.Screen
        name="users"
        options={{ ...headerCommonDynamic, headerShown: true, headerTitle: 'إدارة المستخدمين' }}
      />
      <Stack.Screen
        name="settings"
        options={{ ...headerCommonDynamic, headerShown: true, headerTitle: 'الإعدادات' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Changa_400Regular,
    Changa_500Medium,
    Changa_600SemiBold,
    Changa_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.setAttribute('lang', 'ar');
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedStatusBar />
        <AuthProvider>
          <DataProvider>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <ToastProvider>
                    <ErrorBoundary>
                      <RootLayoutNav />
                    </ErrorBoundary>
                  </ToastProvider>
                </KeyboardProvider>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </DataProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
