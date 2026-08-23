import React, { useState, useCallback, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, Stack } from 'expo-router';

import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { dailyAccountingApi } from '@/utils/api';

// Types used only inside this screen — kept local to avoid duplicate declarations
type ApiDailyStatus = {
  state: 'not_open' | 'open' | 'closed_today';
  day?: { date: string; openingCash: string };
};

type StatDay = {
  date: string;
  rossat: string;
  totalExpenses: string;
  totalIncome: string;
  net: string;
  actualCash: string | null;
  tillExpenses: string;
  fundExpenses: string;
};

type ApiDailyStatistics = {
  summary: { fundBalance: number; totalExpenses: number; totalIncome: number };
  days: StatDay[];
};

const FETCH_DEBOUNCE_MS = 8_000; // Minimum ms between automatic refetches on focus

// ─── Memoised detail row ──────────────────────────────────────────────────────
const DetailRow = memo(function DetailRow({
  label, value, colors,
}: { label: string; value: string | number; colors: ReturnType<typeof useColors> }) {
  const fmt = (v: string | number) => Number(v).toLocaleString() + ' دج';
  return (
    <View style={detailStyles.row}>
      <Text style={[detailStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[detailStyles.value, { color: colors.foreground }]}>{fmt(value)}</Text>
    </View>
  );
});

// ─── Memoised closed-day card ─────────────────────────────────────────────────
type DayCardProps = {
  day: StatDay;
  expanded: boolean;
  onToggle: (date: string) => void;
  colors: ReturnType<typeof useColors>;
};
const DayCard = memo(function DayCard({ day, expanded, onToggle, colors }: DayCardProps) {
  const fmt = (v: string | number) => Number(v).toLocaleString() + ' دج';
  const net = Number(day.net);
  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TouchableOpacity
        style={cardStyles.header}
        onPress={() => onToggle(day.date)}
        activeOpacity={0.7}
      >
        <View style={cardStyles.headerLeft}>
          <View style={[cardStyles.calIcon, { backgroundColor: colors.muted }]}>
            <Feather name="calendar" size={16} color={colors.foreground} />
          </View>
          <Text style={[cardStyles.date, { color: colors.foreground }]}>{day.date}</Text>
        </View>
        <View style={cardStyles.headerRight}>
          <View style={[cardStyles.netBadge, { backgroundColor: (net >= 0 ? colors.success : colors.destructive) + '20' }]}>
            <Text style={[cardStyles.netText, { color: net >= 0 ? colors.success : colors.destructive }]}>
              {fmt(day.net)}
            </Text>
          </View>
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={[cardStyles.details, { borderTopColor: colors.border }]}>
          <DetailRow label="الروسات (المبيعات المحسوبة)" value={day.rossat} colors={colors} />
          <DetailRow label="إجمالي المداخيل" value={day.totalIncome} colors={colors} />
          <DetailRow label="إجمالي المصاريف" value={day.totalExpenses} colors={colors} />
          <DetailRow label="النقد الفعلي (لاكاس)" value={day.actualCash ?? '0'} colors={colors} />
          <DetailRow label="مصاريف لاكاس" value={day.tillExpenses} colors={colors} />
          <DetailRow label="مصاريف الصندوق" value={day.fundExpenses} colors={colors} />
        </View>
      )}
    </View>
  );
});

export default function DailyAccountingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [status, setStatus] = useState<ApiDailyStatus | null>(null);
  const [stats, setStats] = useState<ApiDailyStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [openingCashInput, setOpeningCashInput] = useState('');
  const [actualCashInput, setActualCashInput] = useState('');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  // Tracks when we last fetched so focus events don't re-fetch unnecessarily
  const lastFetchRef = useRef<number>(0);

  const fetchState = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchRef.current < FETCH_DEBOUNCE_MS) return;
    lastFetchRef.current = now;
    try {
      setError(null);
      const [resStatus, resStats] = await Promise.all([
        dailyAccountingApi.status(),
        isAdmin ? dailyAccountingApi.statistics() : Promise.resolve(null),
      ]);
      setStatus(resStatus as ApiDailyStatus);
      if (resStats) setStats(resStats as ApiDailyStatistics);
    } catch (err: any) {
      console.log('Daily accounting fetch error:', err);
      setError('تعذر تحميل بيانات الدورة اليومية.');
      showToast('خطأ في تحميل البيانات', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, showToast]);

  useFocusEffect(
    useCallback(() => {
      fetchState();
    }, [fetchState])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchState(true);
  }, [fetchState]);

  const handleOpenDay = async () => {
    const val = Number(openingCashInput);
    if (isNaN(val) || val < 0 || openingCashInput.trim() === '') {
      showToast('أدخل مبلغ الافتتاح بشكل صحيح', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await dailyAccountingApi.open(val);
      showToast('تم افتتاح اليوم بنجاح', 'success');
      setOpeningCashInput('');
      await fetchState(true);
    } catch {
      showToast('تعذر افتتاح اليوم', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseDay = async () => {
    const val = Number(actualCashInput);
    if (isNaN(val) || val < 0 || actualCashInput.trim() === '') {
      showToast('أدخل النقد الفعلي بشكل صحيح', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await dailyAccountingApi.close(val);
      showToast('تم إغلاق اليوم بنجاح', 'success');
      setActualCashInput('');
      await fetchState(true);
    } catch {
      showToast('تعذر إغلاق اليوم', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDay = useCallback((date: string) => {
    setExpandedDay(prev => (prev === date ? null : date));
  }, []);

  // ── These hooks MUST come before any conditional return ──
  const renderDayCard = useCallback(({ item }: { item: StatDay }) => (
    <DayCard
      day={item}
      expanded={expandedDay === item.date}
      onToggle={toggleDay}
      colors={colors}
    />
  ), [expandedDay, toggleDay, colors]);

  const keyExtractor = useCallback((item: StatDay) => item.date, []);
  // ─────────────────────────────────────────────────────────

  const fmt = (val: string | number) => Number(val).toLocaleString() + ' دج';

  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + 60 + insets.bottom : 60 + insets.bottom;

  if (loading) {
    return (
      <View style={[pageStyles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'المحاسبة اليومية' }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isOpen      = status?.state === 'open';
  const isClosed    = status?.state === 'closed_today';
  const isUnopened  = !isOpen && !isClosed;

  // FlatList data for closed days history — only rendered for admin
  const closedDays = stats?.days ?? [];

  // ListHeader for the FlatList contains the day-state card + summary stats
  const ListHeaderComponent = (
    <>
      {/* ── Current day state ── */}
      {isUnopened && (
        <View style={[pageStyles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[pageStyles.iconCircle, { backgroundColor: colors.primary + '20' }]}>
            <Feather name="sun" size={28} color={colors.primary} />
          </View>
          <Text style={[pageStyles.cardTitle, { color: colors.foreground }]}>افتتاح اليوم</Text>
          <Text style={[pageStyles.cardDesc, { color: colors.mutedForeground }]}>
            يرجى إدخال مبلغ الصندوق (لاكاس) المتوفر حالياً لبدء دورة العمل الجديدة.
          </Text>
          <View style={[pageStyles.inputWrapper, { backgroundColor: colors.input }]}>
            <TextInput
              style={[pageStyles.input, { color: colors.foreground }]}
              placeholder="مبلغ الافتتاح (دج)"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              value={openingCashInput}
              onChangeText={setOpeningCashInput}
              testID="opening-cash-input"
            />
            <Text style={[pageStyles.inputSuffix, { color: colors.mutedForeground }]}>دج</Text>
          </View>
          <TouchableOpacity
            style={[pageStyles.actionBtn, { backgroundColor: colors.primary }, submitting && pageStyles.disabled]}
            onPress={handleOpenDay}
            disabled={submitting}
            testID="open-day-button"
          >
            <Text style={pageStyles.actionBtnText}>{submitting ? 'جارٍ الحفظ...' : 'تأكيد الافتتاح'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {isOpen && (
        <View style={[pageStyles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[pageStyles.iconCircle, { backgroundColor: colors.warning + '20' }]}>
            <Feather name="moon" size={28} color={colors.warning} />
          </View>
          <Text style={[pageStyles.cardTitle, { color: colors.foreground }]}>إغلاق اليوم</Text>
          <Text style={[pageStyles.cardDesc, { color: colors.mutedForeground }]}>
            أدخل مبلغ النقد الفعلي الموجود في الصندوق (لاكاس) لإنهاء الدورة اليومية.
          </Text>
          <View style={[pageStyles.inputWrapper, { backgroundColor: colors.input }]}>
            <TextInput
              style={[pageStyles.input, { color: colors.foreground }]}
              placeholder="النقد الفعلي (دج)"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              value={actualCashInput}
              onChangeText={setActualCashInput}
              testID="actual-cash-input"
            />
            <Text style={[pageStyles.inputSuffix, { color: colors.mutedForeground }]}>دج</Text>
          </View>
          <TouchableOpacity
            style={[pageStyles.actionBtn, { backgroundColor: colors.warning }, submitting && pageStyles.disabled]}
            onPress={handleCloseDay}
            disabled={submitting}
            testID="close-day-button"
          >
            <Text style={pageStyles.actionBtnText}>{submitting ? 'جارٍ الحفظ...' : 'تأكيد الإغلاق'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {isClosed && (
        <View style={[pageStyles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[pageStyles.iconCircle, { backgroundColor: colors.success + '20' }]}>
            <Feather name="check-circle" size={28} color={colors.success} />
          </View>
          <Text style={[pageStyles.cardTitle, { color: colors.foreground }]}>اليوم مغلق</Text>
          <Text style={[pageStyles.cardDesc, { color: colors.mutedForeground }]}>
            تم إنهاء جميع العمليات وإغلاق الدورة المحاسبية لهذا اليوم بنجاح.
          </Text>
        </View>
      )}

      {/* ── Manager summary ── */}
      {isAdmin && stats && (
        <View style={pageStyles.statsWrap}>
          <Text style={[pageStyles.sectionTitle, { color: colors.foreground }]}>الخلاصة المالية</Text>
          <View style={pageStyles.summaryGrid}>
            <View style={[pageStyles.summaryBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[pageStyles.summaryIcon, { backgroundColor: colors.primary + '20' }]}>
                <Feather name="briefcase" size={16} color={colors.primary} />
              </View>
              <Text style={[pageStyles.summaryLabel, { color: colors.mutedForeground }]}>رصيد الصندوق</Text>
              <Text style={[pageStyles.summaryValue, { color: colors.foreground }]}>{fmt(stats.summary.fundBalance)}</Text>
            </View>
            <View style={[pageStyles.summaryBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[pageStyles.summaryIcon, { backgroundColor: colors.success + '20' }]}>
                <Feather name="arrow-down-left" size={16} color={colors.success} />
              </View>
              <Text style={[pageStyles.summaryLabel, { color: colors.mutedForeground }]}>إجمالي المداخيل</Text>
              <Text style={[pageStyles.summaryValue, { color: colors.success }]}>{fmt(stats.summary.totalIncome)}</Text>
            </View>
            <View style={[pageStyles.summaryBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[pageStyles.summaryIcon, { backgroundColor: colors.destructive + '20' }]}>
                <Feather name="arrow-up-right" size={16} color={colors.destructive} />
              </View>
              <Text style={[pageStyles.summaryLabel, { color: colors.mutedForeground }]}>إجمالي المصاريف</Text>
              <Text style={[pageStyles.summaryValue, { color: colors.destructive }]}>{fmt(stats.summary.totalExpenses)}</Text>
            </View>
          </View>
          <Text style={[pageStyles.sectionTitle, { color: colors.foreground, marginTop: 4 }]}>سجل الأيام المغلقة</Text>
          {closedDays.length === 0 && (
            <View style={[pageStyles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="calendar" size={32} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
              <Text style={[pageStyles.emptyText, { color: colors.mutedForeground }]}>لا توجد أيام مغلقة مسجلة بعد</Text>
            </View>
          )}
        </View>
      )}
    </>
  );

  return (
    <View style={[pageStyles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'المحاسبة اليومية' }} />
      {error ? (
        <View style={pageStyles.center}>
          <Feather name="alert-triangle" size={32} color={colors.destructive} />
          <Text style={[pageStyles.errorText, { color: colors.destructive }]}>{error}</Text>
          <TouchableOpacity style={[pageStyles.retryBtn, { backgroundColor: colors.primary }]} onPress={onRefresh}>
            <Text style={pageStyles.retryBtnText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          // If not admin or no closed days, show only the header (day-state + summary)
          data={isAdmin ? closedDays : []}
          keyExtractor={keyExtractor}
          renderItem={renderDayCard}
          ListHeaderComponent={ListHeaderComponent}
          contentContainerStyle={[pageStyles.listContent, { paddingTop: topPad + 16, paddingBottom: bottomPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={5}
          maxToRenderPerBatch={6}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const detailStyles = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: 'Changa_500Medium', fontSize: 14 },
  value: { fontFamily: 'Changa_600SemiBold', fontSize: 15 },
});

const cardStyles = StyleSheet.create({
  card:        { borderRadius: 12, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  calIcon:     { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  date:        { fontFamily: 'Changa_600SemiBold', fontSize: 16 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  netBadge:    { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 },
  netText:     { fontFamily: 'Changa_700Bold', fontSize: 13 },
  details:     { borderTopWidth: 1, padding: 16, gap: 12 },
});

const pageStyles = StyleSheet.create({
  container:    { flex: 1 },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent:  { paddingHorizontal: 16 },
  actionCard:   { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  iconCircle:   { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  cardTitle:    { fontFamily: 'Changa_700Bold', fontSize: 22, marginBottom: 8 },
  cardDesc:     { fontFamily: 'Changa_400Regular', fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 16, width: '100%', height: 56, marginBottom: 20, gap: 12 },
  input:        { flex: 1, fontFamily: 'Changa_600SemiBold', fontSize: 18, textAlign: 'right' },
  inputSuffix:  { fontFamily: 'Changa_500Medium', fontSize: 16 },
  actionBtn:    { width: '100%', height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  actionBtnText:{ fontFamily: 'Changa_700Bold', fontSize: 16, color: '#FFFFFF' },
  disabled:     { opacity: 0.6 },
  statsWrap:    { marginTop: 8, marginBottom: 16 },
  sectionTitle: { fontFamily: 'Changa_700Bold', fontSize: 18, marginBottom: 16 },
  summaryGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  summaryBox:   { flex: 1, minWidth: '45%', borderRadius: 12, borderWidth: 1, padding: 16 },
  summaryIcon:  { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  summaryLabel: { fontFamily: 'Changa_500Medium', fontSize: 13, marginBottom: 4 },
  summaryValue: { fontFamily: 'Changa_700Bold', fontSize: 18 },
  emptyState:   { borderRadius: 12, borderWidth: 1, padding: 32, alignItems: 'center', justifyContent: 'center' },
  emptyText:    { fontFamily: 'Changa_500Medium', fontSize: 14 },
  errorText:    { fontFamily: 'Changa_500Medium', fontSize: 16, textAlign: 'center', marginTop: 16, marginBottom: 24 },
  retryBtn:     { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryBtnText: { fontFamily: 'Changa_600SemiBold', fontSize: 14, color: '#FFFFFF' },
});
