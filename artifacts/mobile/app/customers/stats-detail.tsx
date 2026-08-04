import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { router, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { customersApi, customerFamiliesApi, customerTransactionsApi } from '@/utils/api';
import { formatTime } from '@/utils/helpers';
import type { Customer, CustomerFamily } from '@/types';
import type { ApiCustomerTransaction } from '@/utils/api';

function fmt(n: number) { return n.toLocaleString('fr-DZ') + ' دج'; }
function toDisplayDate(d: string) { const p = d.split('-'); return `${p[2]}-${p[1]}-${p[0]}`; }

type DetailType = 'today-debts' | 'today-payments' | 'blocked' | 'all-customers' | 'all-families' | 'total-debt';

export default function CustomerStatsDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ type: string; title: string; color: string }>();

  const type = (params.type ?? 'today-payments') as DetailType;
  const title = params.title ?? 'التفاصيل';
  const accentColor = params.color ?? '#F97316';

  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [todayTxs, setTodayTxs] = useState<ApiCustomerTransaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [families, setFamilies] = useState<CustomerFamily[]>([]);

  const loadData = useCallback(async () => {
    try {
      if (type === 'today-debts' || type === 'today-payments') {
        const rows = await customerTransactionsApi.listToday();
        setTodayTxs(rows);
      } else if (type === 'blocked' || type === 'all-customers' || type === 'total-debt') {
        const rows = await customersApi.list();
        setCustomers(rows.map(r => ({
          ...r,
          status: r.status as 'active' | 'blocked',
          balance: Number(r.balance),
        })));
      } else if (type === 'all-families') {
        const rows = await customerFamiliesApi.list();
        setFamilies(rows.map(r => ({
          ...r,
          memberCount: Number(r.memberCount),
          totalBalance: Number(r.totalBalance),
        })));
      }
    } catch {
      showToast('تعذّر تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  // ─── Filtered data ───────────────────────────────────────────────────────────
  const displayedTxs = useMemo(() => {
    if (type === 'today-debts') return todayTxs.filter(t => t.type === 'debt');
    if (type === 'today-payments') return todayTxs.filter(t => t.type === 'payment');
    return [];
  }, [todayTxs, type]);

  const displayedCustomers = useMemo(() => {
    if (type === 'blocked') return customers.filter(c => c.status === 'blocked').sort((a, b) => b.balance - a.balance);
    if (type === 'total-debt') return customers.filter(c => c.balance > 0).sort((a, b) => b.balance - a.balance);
    if (type === 'all-customers') return customers.sort((a, b) => b.balance - a.balance);
    return [];
  }, [customers, type]);

  // ─── Render items ─────────────────────────────────────────────────────────────

  function renderTodayTx({ item: tx, index }: { item: ApiCustomerTransaction; index: number }) {
    const isDebt = tx.type === 'debt';
    return (
      <View style={[styles.txRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.txBar, { backgroundColor: isDebt ? '#EF4444' : '#22C55E' }]} />
        <View style={{ flex: 1, gap: 5 }}>
          {/* Customer + family */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.txAmount, { color: isDebt ? '#DC2626' : '#16A34A' }]}>
              {isDebt ? '+' : '-'}{fmt(Number(tx.amount))}
            </Text>
            <View>
              <Text style={[styles.txCustomer, { color: colors.foreground }]}>{tx.customerName}</Text>
              <Text style={[styles.txFamily, { color: colors.mutedForeground }]}>عائلة {tx.familyName}</Text>
            </View>
          </View>
          {/* Time + employee */}
          <View style={styles.txMetaRow}>
            <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
              🕐 {tx.time ? formatTime(tx.time) : '--'}
            </Text>
            {!!tx.userName && (
              <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>👤 {tx.userName}</Text>
            )}
          </View>
          {!!tx.description && (
            <Text style={[styles.txMeta, { color: colors.foreground }]}>📝 {tx.description}</Text>
          )}
        </View>
      </View>
    );
  }

  function renderCustomer({ item: c }: { item: Customer }) {
    const isBlocked = c.status === 'blocked';
    return (
      <TouchableOpacity
        style={[styles.customerRow, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push({
          pathname: '/customers/[familyId]/[customerId]',
          params: {
            familyId: c.familyId,
            customerId: c.id,
            customerName: c.name,
            familyName: c.familyName,
            balance: String(c.balance),
            status: c.status,
            phone: c.phone ?? '',
          },
        })}
        activeOpacity={0.8}
      >
        <View style={[styles.customerAvatar, { backgroundColor: isBlocked ? '#EF4444' : accentColor }]}>
          <Text style={styles.avatarText}>{c.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.customerName, { color: colors.foreground }]}>{c.name}</Text>
          <Text style={[styles.customerSub, { color: colors.mutedForeground }]}>
            عائلة {c.familyName}{isBlocked ? ' • محظور' : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          {c.balance > 0 ? (
            <Text style={styles.debtAmount}>{fmt(c.balance)}</Text>
          ) : (
            <Text style={styles.clearedText}>✅ مسوّى</Text>
          )}
          <Feather name="chevron-left" size={16} color={colors.mutedForeground} />
        </View>
      </TouchableOpacity>
    );
  }

  function renderFamily({ item: f }: { item: CustomerFamily }) {
    return (
      <TouchableOpacity
        style={[styles.customerRow, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push({
          pathname: '/customers/[familyId]',
          params: {
            familyId: f.id,
            familyName: f.name,
            memberCount: String(f.memberCount),
            totalBalance: String(f.totalBalance),
          },
        })}
        activeOpacity={0.8}
      >
        <LinearGradient colors={['#F97316', '#EA580C']} style={styles.customerAvatar}>
          <Text style={styles.avatarText}>{f.name.charAt(0)}</Text>
        </LinearGradient>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.customerName, { color: colors.foreground }]}>{f.name}</Text>
          <Text style={[styles.customerSub, { color: colors.mutedForeground }]}>
            <Feather name="users" size={12} /> {f.memberCount} فرد
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          {f.totalBalance > 0 ? (
            <Text style={styles.debtAmount}>{fmt(f.totalBalance)}</Text>
          ) : (
            <Text style={styles.clearedText}>✅ لا ديون</Text>
          )}
          <Feather name="chevron-left" size={16} color={colors.mutedForeground} />
        </View>
      </TouchableOpacity>
    );
  }

  // ─── Summary row ─────────────────────────────────────────────────────────────
  function renderSummary() {
    if (type === 'today-payments' || type === 'today-debts') {
      const total = displayedTxs.reduce((s, t) => s + Number(t.amount), 0);
      const isDebt = type === 'today-debts';
      return (
        <View style={[styles.summaryCard, { backgroundColor: isDebt ? '#FEE2E2' : '#DCFCE7', borderColor: isDebt ? '#DC262640' : '#16A34A40' }]}>
          <Feather name={isDebt ? 'trending-up' : 'check-circle'} size={18} color={isDebt ? '#DC2626' : '#16A34A'} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.summaryLabel, { color: isDebt ? '#DC2626' : '#16A34A' }]}>{title}</Text>
            <Text style={[styles.summaryCount, { color: colors.mutedForeground }]}>{displayedTxs.length} عملية</Text>
          </View>
          <Text style={[styles.summaryAmount, { color: isDebt ? '#DC2626' : '#16A34A' }]}>{fmt(total)}</Text>
        </View>
      );
    }
    if (type === 'blocked') {
      return (
        <View style={[styles.summaryCard, { backgroundColor: '#FEE2E2', borderColor: '#DC262640' }]}>
          <Feather name="slash" size={18} color="#DC2626" />
          <Text style={[styles.summaryLabel, { color: '#DC2626', flex: 1 }]}>زبائن محظورون</Text>
          <Text style={[styles.summaryAmount, { color: '#DC2626' }]}>{displayedCustomers.length} زبون</Text>
        </View>
      );
    }
    if (type === 'total-debt') {
      const total = displayedCustomers.reduce((s, c) => s + c.balance, 0);
      return (
        <View style={[styles.summaryCard, { backgroundColor: '#FEE2E2', borderColor: '#DC262640' }]}>
          <Feather name="credit-card" size={18} color="#DC2626" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.summaryLabel, { color: '#DC2626' }]}>إجمالي الديون</Text>
            <Text style={[styles.summaryCount, { color: colors.mutedForeground }]}>{displayedCustomers.length} زبون مدين</Text>
          </View>
          <Text style={[styles.summaryAmount, { color: '#DC2626' }]}>{fmt(total)}</Text>
        </View>
      );
    }
    if (type === 'all-customers') {
      return (
        <View style={[styles.summaryCard, { backgroundColor: '#EDE9FE', borderColor: '#7C3AED40' }]}>
          <Feather name="users" size={18} color="#7C3AED" />
          <Text style={[styles.summaryLabel, { color: '#7C3AED', flex: 1 }]}>جميع الزبائن</Text>
          <Text style={[styles.summaryAmount, { color: '#7C3AED' }]}>{displayedCustomers.length} زبون</Text>
        </View>
      );
    }
    if (type === 'all-families') {
      return (
        <View style={[styles.summaryCard, { backgroundColor: '#E0F2FE', borderColor: '#036940' }]}>
          <Feather name="home" size={18} color="#0369A1" />
          <Text style={[styles.summaryLabel, { color: '#0369A1', flex: 1 }]}>جميع العائلات</Text>
          <Text style={[styles.summaryAmount, { color: '#0369A1' }]}>{families.length} عائلة</Text>
        </View>
      );
    }
    return null;
  }

  // ─── List data ────────────────────────────────────────────────────────────────
  const isTxType = type === 'today-debts' || type === 'today-payments';
  const isFamilyType = type === 'all-families';
  const listData = isTxType ? displayedTxs : isFamilyType ? families : displayedCustomers;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient colors={['#F97316', '#EA580C']} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-right" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSub}>💳 ديون الزبائن</Text>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 60 }} size="large" />
      ) : (
        <FlatList
          data={listData as any[]}
          keyExtractor={(item, i) => item.id ?? String(i)}
          renderItem={isTxType ? renderTodayTx as any : isFamilyType ? renderFamily as any : renderCustomer as any}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40, gap: 10 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#F97316']} tintColor="#F97316" />
          }
          ListHeaderComponent={
            <View style={{ marginBottom: 12 }}>
              {renderSummary()}
            </View>
          }
          ListEmptyComponent={
            <EmptyState icon="inbox" title="لا توجد بيانات" subtitle="لا توجد نتائج لعرضها" />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 22, fontFamily: 'Changa_700Bold', color: '#fff', textAlign: 'right' },
  headerSub: { fontSize: 13, fontFamily: 'Changa_400Regular', color: 'rgba(255,255,255,0.8)', textAlign: 'right', marginTop: 2 },

  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  summaryLabel: { fontSize: 14, fontFamily: 'Changa_600SemiBold' },
  summaryCount: { fontSize: 12, fontFamily: 'Changa_400Regular' },
  summaryAmount: { fontSize: 18, fontFamily: 'Changa_700Bold' },

  txRow: {
    borderRadius: 14, padding: 14, flexDirection: 'row', gap: 10,
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  txBar: { width: 4, borderRadius: 2, alignSelf: 'stretch', minHeight: 60, flexShrink: 0 },
  txAmount: { fontSize: 18, fontFamily: 'Changa_700Bold' },
  txCustomer: { fontSize: 15, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  txFamily: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  txMetaRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 14 },
  txMeta: { fontSize: 12, fontFamily: 'Changa_400Regular' },

  customerRow: {
    borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  customerAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 18, fontFamily: 'Changa_700Bold', color: '#fff' },
  customerName: { fontSize: 16, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  customerSub: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  debtAmount: { fontSize: 14, fontFamily: 'Changa_700Bold', color: '#DC2626' },
  clearedText: { fontSize: 13, fontFamily: 'Changa_500Medium', color: '#16A34A' },
});
