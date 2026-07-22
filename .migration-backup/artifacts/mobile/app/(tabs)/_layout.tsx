import React, { useEffect } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs, useRouter } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useTheme } from '@/context/ThemeContext';

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>لوحة التحكم</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="missing">
        <Icon sf={{ default: 'shippingbox', selected: 'shippingbox.fill' }} />
        <Label>الناقصات</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="expenses">
        <Icon sf={{ default: 'banknote', selected: 'banknote.fill' }} />
        <Label>المصاريف</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tasks">
        <Icon sf={{ default: 'checkmark.square', selected: 'checkmark.square.fill' }} />
        <Label>المهام</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <Icon sf={{ default: 'ellipsis.circle', selected: 'ellipsis.circle.fill' }} />
        <Label>المزيد</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const isAndroid = Platform.OS === 'android';
  const { unreadCount } = useData();

  // Android: add bottom inset for gesture nav bar
  const tabBarHeight = isWeb ? 84 : isAndroid ? 56 + insets.bottom : 60;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.tabBar,
          // Android: elevation provides the shadow; no hairline border needed
          borderTopWidth: isAndroid ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          elevation: isAndroid ? 12 : 0,
          shadowOpacity: isIOS ? 0 : 0,
          height: tabBarHeight,
          paddingBottom: isAndroid ? Math.max(insets.bottom, 8) : isIOS ? 0 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: 'Changa_500Medium', fontSize: 10 },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBar }]} />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'لوحة التحكم',
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="house" tintColor={color} size={22} /> : <Feather name="grid" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="missing"
        options={{
          title: 'الناقصات',
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="shippingbox" tintColor={color} size={22} /> : <Feather name="package" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'المصاريف',
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="banknote" tintColor={color} size={22} /> : <Feather name="dollar-sign" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'المهام',
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="checkmark.square" tintColor={color} size={22} /> : <Feather name="check-square" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'المزيد',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="ellipsis.circle" tintColor={color} size={22} /> : <Feather name="more-horizontal" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !currentUser) {
      router.replace('/login');
    }
  }, [currentUser, isLoading]);

  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
