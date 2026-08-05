import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, ActivityIndicator, RefreshControl, ScrollView, TextInput,
} from 'react-native';
import { router, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { supplierTransactionsApi } from '@/utils/api';
import { formatTime } from '@/utils/helpers';
import type { SupplierTransaction } from '@/types';

function fmt(n: number) { return n.toLocaleString('fr-DZ') + ' دج'; }
function toDisplayDate(d: string) { const p = d.split('-'); return `${p[2]}-${p[1]}-${p[0]}`; }

const MONTH_AR: Record<string, string> = {
  '01': 'جانفي', '02': 'فيفري', '03': 'مارس', '04': 'أفريل',
  '05': 'ماي', '06': 'جوان', '07': 'جويلية', '08': 'أوت',
  '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر',
};

type FilterType = 'all' | 'this-month' | 'last-month' | 'custom';

function SummaryCard({ label, value, color, bg, icon }: {
  label: string; value: string; color: string; bg: string; icon: keyof typeof Feather.glyphMap;
}) {
  return (
    <View style={[sc.card, { backgroundColor: bg, borderColor: color + '40' }]}>
      <Feather name={icon} size={18} color={color} />
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card: { flex: 1, minWidth: '45%', borderRadius: 14, padding: 14, gap: 5, borderWidth: 1, alignItems: 'flex-end' },
  value: { fontSize: 16, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  label: { fontSize: 11, fontFamily: 'Changa_400Regular', color: '#64748B', textAlign: 'right' },
});

export default function SupplierStatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ supplierId: string; supplierName: string }>();
  const { supplierId, supplierName } = params;

  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;

  const [transactions, setTransactions] = useState<SupplierTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const loadTransactions = useCallback(async () => {
    try {
      const rows = await supplierTransactionsApi.list(supplierId);
      setTransactions(rows.map(r => ({
        ...r,
        amount: Number(r.amount),
        type: r.type as 'debt' | 'payment',
        balanceBefore: Number(r.balanceBefore ?? 0),
        balanceAfter: Number(r.balanceAfter ?? 0),
      })));
    } catch {
      showToast('تعذّر تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  // Refresh whenever screen gains focus
  useFocusEffect(useCallback(() => { loadTransactions(); }, [loadTransactions]));

  async function handleRefresh() {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  }

  // ─── Computed stats ──────────────────────────────────────────────────────────
  const totalDebt = useMemo(
    () => transactions.filter(t => t.type === 'debt').reduce((a, t) => a + t.amount, 0),
    [transactions],
  );
  const totalPayment = useMemo(
    () => transactions.filter(t => t.type === 'payment').reduce((a, t) => a + t.amount, 0),
    [transactions],
  );
  const debtCount = useMemo(() => transactions.filter(t => t.type === 'debt').length, [transactions]);
  const paymentCount = useMemo(() => transactions.filter(t => t.type === 'payment').length, [transactions]);
  const lastTx = transactions[0] ?? null;

  // ─── Filter logic ─────────────────────────────────────────────────────────────
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const filteredTx = useMemo(() => {
    if (filter === 'this-month') return transactions.filter(t => t.date.startsWith(thisMonth));
    if (filter === 'last-month') return transactions.filter(t => t.date.startsWith(lastMonth));
    if (filter === 'custom') {
      return transactions.filter(t => {
        const from = customFrom.trim();
        const to = customTo.trim();
        if (from && to) return t.date >= from && t.date <= to;
        if (from) return t.date >= from;
        if (to) return t.date <= to;
        return true;
      });
    }
    return transactions;
  }, [transactions, filter, customFrom, customTo]);

  // ─── Monthly breakdown (for 'all' view) ───────────────────────────────────────
  const monthlyGroups = useMemo(() => {
    const map: Record<string, { debt: number; payment: number; debtCount: number; paymentCount: number }> = {};
    transactions.forEach(t => {
      const month = t.date.slice(0, 7); // YYYY-MM
      if (!map[month]) map[month] = { debt: 0, payment: 0, debtCount: 0, paymentCount: 0 };
      if (t.type === 'debt') { map[month].debt += t.amount; map[month].debtCount++; }
      else { map[month].payment += t.amount; map[month].paymentCount++; }
    });
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, stats]) => ({ month, ...stats }));
  }, [transactions]);

  // ─── Daily breakdown (for month filters) ──────────────────────────────────────
  const dailyGroups = useMemo(() => {
    const map: Record<string, { debt: number; payment: number; count: number }> = {};
    filteredTx.forEach(t => {
      if (!map[t.date]) map[t.date] = { debt: 0, payment: 0, count: 0 };
      if (t.type === 'debt') map[t.date].debt += t.amount;
      else map[t.date].payment += t.amount;
      map[t.date].count++;
    });
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, stats]) => ({ date, ...stats }));
  }, [filteredTx]);

  // ─── Filtered summary ─────────────────────────────────────────────────────────
  const filteredDebt = useMemo(() => filteredTx.filter(t => t.type === 'debt').reduce((a, t) => a + t.amount, 0), [filteredTx]);
  const filteredPayment = useMemo(() => filteredTx.filter(t => t.type === 'payment').reduce((a, t) => a + t.amount, 0), [filteredTx]);

  function monthLabel(ym: string) {
    const [year, month] = ym.split('-');
    return `${MONTH_AR[month] ?? month} ${year}`;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-right" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>📊 إحصائيات المورد</Text>
        <Text style={styles.headerSub}>{supplierName}</Text>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color="#0EA5E9" style={{ marginTop: 60 }} size="large" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40, gap: 16 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#0EA5E9']} tintColor="#0EA5E9" />
          }
        >
          {/* Overall Summary */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>📋 ملخص إجمالي</Text>
          <View style={styles.grid}>
            <SummaryCard label="إجمالي الديون" value={fmt(totalDebt)} color="#DC2626" bg="#FEE2E2" icon="trending-up" />
            <SummaryCard label="إجمالي السدادات" value={fmt(totalPayment)} color="#16A34A" bg="#DCFCE7" icon="check-circle" />
            <SummaryCard label="عدد عمليات الدين" value={String(debtCount)} color="#7C3AED" bg="#EDE9FE" icon="hash" />
            <SummaryCard label="عدد عمليات السداد" value={String(paymentCount)} color="#0369A1" bg="#E0F2FE" icon="hash" />
          </View>

          {/* Last transaction */}
          {lastTx && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>🕐 آخر عملية</Text>
              <View style={[styles.lastTxCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.lastTxBar, { backgroundColor: lastTx.type === 'debt' ? '#EF4444' : '#22C55E' }]} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.lastTxAmount, { color: lastTx.type === 'debt' ? '#DC2626' : '#16A34A' }]}>
                      {lastTx.type === 'debt' ? '+' : '-'}{fmt(lastTx.amount)}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: lastTx.type === 'debt' ? '#FEE2E2' : '#DCFCE7' }]}>
                      <Text style={[styles.badgeText, { color: lastTx.type === 'debt' ? '#DC2626' : '#16A34A' }]}>
                        {lastTx.type === 'debt' ? '📈 دين' : '✅ سداد'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.lastTxMeta, { color: colors.mutedForeground }]}>
                    📅 {toDisplayDate(lastTx.date)}  🕐 {formatTime(lastTx.time)}
                  </Text>
                  {!!lastTx.userName && (
                    <Text style={[styles.lastTxMeta, { color: colors.mutedForeground }]}>👤 {lastTx.userName}</Text>
                  )}
                  {!!lastTx.note && (
                    <Text style={[styles.lastTxMeta, { color: colors.foreground }]}>📝 {lastTx.note}</Text>
                  )}
                </View>
              </View>
            </>
          )}

          {/* Filter tabs */}
          <View style={styles.filterRow}>
            {([
              { key: 'all', label: 'الكل' },
              { key: 'this-month', label: 'هذا الشهر' },
              { key: 'last-month', label: 'الشهر الماضي' },
              { key: 'custom', label: '📅 تاريخ' },
            ] as { key: FilterType; label: string }[]).map(f => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
                onPress={() => setFilter(f.key)}
              >
                <Text style={[styles.filterBtnText, filter === f.key && styles.filterBtnTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom date range inputs */}
          {filter === 'custom' && (
            <View style={styles.customDateRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>من</Text>
                <TextInput
                  style={[styles.dateInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  value={customFrom}
                  onChangeText={setCustomFrom}
                  textAlign="center"
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>إلى</Text>
                <TextInput
                  style={[styles.dateInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  value={customTo}
                  onChangeText={setCustomTo}
                  textAlign="center"
                  keyboardType="numeric"
                />
              </View>
            </View>
          )}

          {/* Period summary (for month filters and custom) */}
          {filter !== 'all' && (
            <>
              <View style={styles.grid}>
                <SummaryCard label="ديون الفترة" value={fmt(filteredDebt)} color="#DC2626" bg="#FEE2E2" icon="trending-up" />
                <SummaryCard label="سدادات الفترة" value={fmt(filteredPayment)} color="#16A34A" bg="#DCFCE7" icon="check-circle" />
              </View>

              {/* Daily breakdown */}
              {dailyGroups.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>📆 تفاصيل يومية</Text>
                  {dailyGroups.map(d => (
                    <View key={d.date} style={[styles.dayRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[styles.dayDate, { color: colors.foreground }]}>{toDisplayDate(d.date)}</Text>
                      <View style={styles.dayStats}>
                        {d.debt > 0 && (
                          <Text style={styles.dayDebt}>+{fmt(d.debt)}</Text>
                        )}
                        {d.payment > 0 && (
                          <Text style={styles.dayPayment}>-{fmt(d.payment)}</Text>
                        )}
                        <Text style={[styles.dayCount, { color: colors.mutedForeground }]}>{d.count} عملية</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          {/* Monthly breakdown (for 'all' view) */}
          {filter === 'all' && monthlyGroups.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>📅 تفاصيل شهرية</Text>
              {monthlyGroups.map(m => (
                <View key={m.month} style={[styles.monthCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.monthTitle, { color: colors.foreground }]}>{monthLabel(m.month)}</Text>
                  <View style={styles.monthStats}>
                    <View style={styles.monthStat}>
                      <Text style={styles.monthDebt}>{fmt(m.debt)}</Text>
                      <Text style={[styles.monthStatLabel, { color: colors.mutedForeground }]}>ديون ({m.debtCount})</Text>
                    </View>
                    <View style={[styles.monthDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.monthStat}>
                      <Text style={styles.monthPayment}>{fmt(m.payment)}</Text>
                      <Text style={[styles.monthStatLabel, { color: colors.mutedForeground }]}>سدادات ({m.paymentCount})</Text>
                    </View>
                    <View style={[styles.monthDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.monthStat}>
                      <Text style={[styles.monthNet, { color: m.debt - m.payment > 0 ? '#DC2626' : '#16A34A' }]}>
                        {fmt(Math.abs(m.debt - m.payment))}
                      </Text>
                      <Text style={[styles.monthStatLabel, { color: colors.mutedForeground }]}>
                        {m.debt - m.payment > 0 ? 'صافي دين' : 'صافي سداد'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Full transaction list */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            📋 قائمة العمليات ({filteredTx.length})
          </Text>
          {filteredTx.length === 0 ? (
            <EmptyState icon="file-text" title="لا توجد عمليات" subtitle="لا توجد عمليات في هذه الفترة" />
          ) : (
            filteredTx.map(tx => {
              const isDebt = tx.type === 'debt';
              return (
                <View key={tx.id} style={[styles.txRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <View style={[styles.txBar, { backgroundColor: isDebt ? '#EF4444' : '#22C55E' }]} />
                  <View style={{ flex: 1, gap: 5 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.txAmount, { color: isDebt ? '#DC2626' : '#16A34A' }]}>
                        {isDebt ? '+' : '-'}{fmt(tx.amount)}
                      </Text>
                      <View style={[styles.badge, { backgroundColor: isDebt ? '#FEE2E2' : '#DCFCE7' }]}>
                        <Text style={[styles.badgeText, { color: isDebt ? '#DC2626' : '#16A34A' }]}>
                          {isDebt ? '📈 دين' : '✅ سداد'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
                      📅 {toDisplayDate(tx.date)}  🕐 {formatTime(tx.time)}
                    </Text>
                    {!!tx.userName && (
                      <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>👤 {tx.userName}</Text>
                    )}
                    {!!tx.note && (
                      <Text style={[styles.txMeta, { color: colors.foreground }]}>📝 {tx.note}</Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
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
  headerSub: { fontSize: 14, fontFamily: 'Changa_400Regular', color: 'rgba(255,255,255,0.8)', textAlign: 'right', marginTop: 2 },

  sectionTitle: { fontSize: 15, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  lastTxCard: { borderRadius: 14, padding: 14, flexDirection: 'row', gap: 10, borderWidth: StyleSheet.hairlineWidth },
  lastTxBar: { width: 4, borderRadius: 2, alignSelf: 'stretch', minHeight: 50, flexShrink: 0 },
  lastTxAmount: { fontSize: 20, fontFamily: 'Changa_700Bold' },
  lastTxMeta: { fontSize: 13, fontFamily: 'Changa_400Regular' },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontFamily: 'Changa_600SemiBold' },

  filterRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  filterBtn: { flex: 1, minWidth: '22%', paddingVertical: 9, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' },
  filterBtnActive: { backgroundColor: '#0EA5E9' },
  filterBtnText: { fontSize: 12, fontFamily: 'Changa_500Medium', color: '#64748B' },
  filterBtnTextActive: { color: '#fff' },

  customDateRow: { flexDirection: 'row', gap: 10 },
  dateLabel: { fontSize: 12, fontFamily: 'Changa_500Medium', textAlign: 'center', marginBottom: 4 },
  dateInput: { borderRadius: 10, borderWidth: 1, padding: 10, fontSize: 13, fontFamily: 'Changa_400Regular' },

  dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  dayDate: { fontSize: 14, fontFamily: 'Changa_600SemiBold' },
  dayStats: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  dayDebt: { fontSize: 13, fontFamily: 'Changa_600SemiBold', color: '#DC2626' },
  dayPayment: { fontSize: 13, fontFamily: 'Changa_600SemiBold', color: '#16A34A' },
  dayCount: { fontSize: 12, fontFamily: 'Changa_400Regular' },

  monthCard: { borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
  monthTitle: { fontSize: 15, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  monthStats: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  monthStat: { alignItems: 'center', gap: 3 },
  monthDebt: { fontSize: 14, fontFamily: 'Changa_700Bold', color: '#DC2626' },
  monthPayment: { fontSize: 14, fontFamily: 'Changa_700Bold', color: '#16A34A' },
  monthNet: { fontSize: 14, fontFamily: 'Changa_700Bold' },
  monthStatLabel: { fontSize: 11, fontFamily: 'Changa_400Regular' },
  monthDivider: { width: 1, height: 40 },

  txRow: { borderRadius: 12, padding: 12, flexDirection: 'row', gap: 10, borderWidth: StyleSheet.hairlineWidth },
  txBar: { width: 4, borderRadius: 2, alignSelf: 'stretch', minHeight: 50, flexShrink: 0 },
  txAmount: { fontSize: 16, fontFamily: 'Changa_700Bold' },
  txMeta: { fontSize: 12, fontFamily: 'Changa_400Regular' },
});
