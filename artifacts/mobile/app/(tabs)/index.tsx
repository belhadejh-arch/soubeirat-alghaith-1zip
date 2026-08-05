import React, { useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform,
  RefreshControl,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { formatDate, getCurrentDate } from '@/utils/helpers';

interface DashCard {
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  gradient: [string, string];
  route: string;
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { products, tasks, orders, suppliers, unreadCount, isLoading } = useData();
  const [refreshing, setRefreshing] = React.useState(false);

  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + 60 + insets.bottom : 60 + insets.bottom;

  const pendingProducts = products.filter(p => p.status === 'pending').length;
  const pendingTasks = tasks.filter(t => t.status === 'pending').length;
  const pendingOrders = orders.filter(o => o.status === 'draft').length;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const today = getCurrentDate();

  const cards: DashCard[] = [
    {
      title: 'السلع الناقصة',
      subtitle: pendingProducts > 0 ? `${pendingProducts} سلعة معلقة` : 'لا توجد سلع ناقصة',
      icon: 'package',
      gradient: ['#F59E0B', '#D97706'],
      route: '/(tabs)/missing',
    },
    {
      title: currentUser?.role === 'worker' ? 'المصاريف' : 'المصاريف والروسات',
      subtitle: currentUser?.role === 'worker' ? 'تسجيل المصاريف اليومية' : 'تسجيل المصاريف اليومية والروسات',
      icon: 'dollar-sign',
      gradient: ['#0EA5E9', '#0369A1'],
      route: '/(tabs)/expenses',
    },
    {
      title: 'وصل الطلب',
      subtitle: pendingOrders > 0 ? `${pendingOrders} وصل قيد الانتظار` : 'إدارة الوصلات',
      icon: 'shopping-cart',
      gradient: ['#8B5CF6', '#7C3AED'],
      route: '/orders',
    },
    {
      title: 'المهام المعلقة',
      subtitle: pendingTasks > 0 ? `${pendingTasks} مهمة معلقة` : 'لا توجد مهام معلقة',
      icon: 'check-square',
      gradient: ['#EC4899', '#DB2777'],
      route: '/(tabs)/tasks',
    },
    {
      title: 'حالة الموردين',
      subtitle: suppliers.length > 0 ? `${suppliers.length} مورد مسجل` : 'إدارة ديون الموردين',
      icon: 'users',
      gradient: ['#22C55E', '#16A34A'],
      route: '/suppliers',
    },
    {
      title: 'ديون الزبائن',
      subtitle: 'إدارة ديون العائلات والزبائن',
      icon: 'credit-card',
      gradient: ['#F97316', '#EA580C'],
      route: '/customers',
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.storeName}>سوبيرات الغيث</Text>
            <Text style={styles.greeting}>مرحباً، {currentUser?.name?.split(' ')[0]} · {formatDate(today)}</Text>
          </View>
          <TouchableOpacity style={styles.notifBtn} onPress={() => router.push('/notifications')}>
            <Feather name="bell" size={20} color="#fff" />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 12, paddingBottom: bottomPad, gap: 8 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {cards.map((card) => (
          <TouchableOpacity
            key={card.route}
            activeOpacity={0.85}
            onPress={() => router.push(card.route as any)}
          >
            <LinearGradient
              colors={card.gradient}
              style={styles.card}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.cardContent}>
                <View style={styles.cardIcon}>
                  <Feather name={card.icon} size={28} color="#fff" />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
                </View>
              </View>
              <Feather name="chevron-left" size={22} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 18, paddingBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flex: 1 },
  storeName: { fontSize: 18, fontFamily: 'Changa_700Bold', color: '#fff', textAlign: 'right' },
  greeting: { fontSize: 12, fontFamily: 'Changa_400Regular', color: 'rgba(255,255,255,0.8)', textAlign: 'right' },
  notifBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  badge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontFamily: 'Changa_700Bold' },
  scroll: { flex: 1 },
  card: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  cardContent: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontFamily: 'Changa_700Bold', color: '#fff', textAlign: 'right' },
  cardSubtitle: { fontSize: 12, fontFamily: 'Changa_400Regular', color: 'rgba(255,255,255,0.85)', textAlign: 'right', marginTop: 1 },
});
