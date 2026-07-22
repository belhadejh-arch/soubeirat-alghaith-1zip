import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { roleLabel } from '@/utils/helpers';

const MENU_ITEMS = [
  { icon: 'shopping-cart' as const, label: 'وصل الطلب', route: '/orders', gradient: ['#0EA5E9', '#0369A1'] as [string,string], desc: 'إدارة وصلات الموردين' },
  { icon: 'users' as const, label: 'حالة الموردين', route: '/suppliers', gradient: ['#22C55E', '#16A34A'] as [string,string], desc: 'متابعة ديون الموردين' },
  { icon: 'bell' as const, label: 'الإشعارات', route: '/notifications', gradient: ['#8B5CF6', '#7C3AED'] as [string,string], desc: 'مركز الإشعارات' },
  { icon: 'user-plus' as const, label: 'المستخدمون', route: '/users', gradient: ['#F59E0B', '#D97706'] as [string,string], desc: 'إدارة فريق العمل', adminOnly: true },
  { icon: 'settings' as const, label: 'الإعدادات', route: '/settings', gradient: ['#64748B', '#475569'] as [string,string], desc: 'إعدادات التطبيق' },
];

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const { unreadCount, products, tasks } = useData();

  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + 60 + insets.bottom : 60 + insets.bottom;
  const isAdmin = currentUser?.role === 'admin';

  async function handleLogout() {
    await logout();
    // Navigation handled by TabLayout useEffect watching currentUser
  }

  const ROLE_COLORS: Record<string, [string,string]> = {
    admin: ['#7C3AED', '#5B21B6'],
    supervisor: ['#0EA5E9', '#0369A1'],
    worker: ['#22C55E', '#15803D'],
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={styles.headerTitle}>المزيد</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }} showsVerticalScrollIndicator={false}>
        {/* User Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient colors={ROLE_COLORS[currentUser?.role ?? 'worker']} style={styles.avatar}>
            <Text style={styles.avatarText}>{currentUser?.name?.charAt(0) ?? '؟'}</Text>
          </LinearGradient>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>{currentUser?.name}</Text>
            <Text style={[styles.profileRole, { color: colors.mutedForeground }]}>{roleLabel(currentUser?.role ?? 'worker')}</Text>
            <Text style={[styles.profilePhone, { color: colors.mutedForeground }]}>{currentUser?.phone}</Text>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.quickStats}>
          <View style={[styles.statItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statVal, { color: colors.primary }]}>{products.filter(p => p.status === 'pending').length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>سلع ناقصة</Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statVal, { color: '#8B5CF6' }]}>{tasks.filter(t => t.status === 'pending').length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>مهام معلقة</Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statVal, { color: '#EF4444' }]}>{unreadCount}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>إشعارات</Text>
          </View>
        </View>

        {/* Menu Grid */}
        <View style={styles.menuGrid}>
          {MENU_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item => (
            <TouchableOpacity
              key={item.route}
              style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.8}
            >
              <LinearGradient colors={item.gradient} style={styles.menuIcon}>
                <Feather name={item.icon} size={24} color="#fff" />
              </LinearGradient>
              {item.label === 'الإشعارات' && unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount}</Text>
                </View>
              )}
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text>
              <Text style={[styles.menuDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity style={[styles.logoutBtn, { borderColor: '#EF4444' }]} onPress={handleLogout}>
          <Feather name="log-out" size={18} color="#EF4444" />
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>سوبيرات الغيث v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 22, fontFamily: 'Changa_700Bold', color: '#fff', textAlign: 'right' },
  profileCard: { flexDirection: 'row', alignItems: 'center', margin: 16, padding: 16, borderRadius: 16, borderWidth: 1, gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontFamily: 'Changa_700Bold', color: '#fff' },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 18, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  profileRole: { fontSize: 14, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  profilePhone: { fontSize: 13, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  quickStats: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  statItem: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1 },
  statVal: { fontSize: 24, fontFamily: 'Changa_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Changa_400Regular', textAlign: 'center' },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 },
  menuCard: { width: '47%', borderRadius: 16, padding: 16, borderWidth: 1, gap: 10, position: 'relative' },
  menuIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  notifBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  notifBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Changa_700Bold' },
  menuLabel: { fontSize: 16, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  menuDesc: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, margin: 16, marginTop: 24, padding: 16, borderRadius: 14, borderWidth: 1.5 },
  logoutText: { fontSize: 16, fontFamily: 'Changa_600SemiBold', color: '#EF4444' },
  version: { textAlign: 'center', fontSize: 12, fontFamily: 'Changa_400Regular', marginBottom: 8 },
});
