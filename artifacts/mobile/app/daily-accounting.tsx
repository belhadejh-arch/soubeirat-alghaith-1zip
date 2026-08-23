import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';

import {
  dailyAccountingApi,
  type ApiDailyStatistics,
  type ApiDailyStatus,
} from '@/utils/api';

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

  const [openingCashInput, setOpeningCashInput] = useState('');
  const [actualCashInput, setActualCashInput] = useState('');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const fetchState = useCallback(async () => {
    try {
      setError(null);
      const resStatus = await dailyAccountingApi.status();
      setStatus(resStatus);

      if (isAdmin) {
        const resStats = await dailyAccountingApi.statistics();
        setStats(resStats);
      }
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
    fetchState();
  }, [fetchState]);

  const handleOpenDay = async () => {
    const val = Number(openingCashInput);
    if (isNaN(val) || val < 0 || openingCashInput.trim() === '') {
      showToast('أدخل مبلغ الافتتاح بشكل صحيح', 'error');
      return;
    }
    try {
      setSubmitting(true);
      await dailyAccountingApi.open(val);
      showToast('تم افتتاح اليوم بنجاح', 'success');
      setOpeningCashInput('');
      await fetchState();
    } catch (error) {
      const code = (error as { code?: string }).code;
      showToast(code === 'day_already_open' ? 'يوجد يوم مفتوح بالفعل' : code === 'day_already_closed' ? 'تم إغلاق حساب اليوم بالفعل' : 'تعذر افتتاح اليوم', 'error');
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
    try {
      setSubmitting(true);
      await dailyAccountingApi.close(val);
      showToast('تم إغلاق اليوم بنجاح', 'success');
      setActualCashInput('');
      await fetchState();
    } catch (error) {
      const code = (error as { code?: string }).code;
      showToast(code === 'no_active_day' ? 'لا يوجد يوم مفتوح' : 'تعذر إغلاق اليوم', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (val: string | number) => Number(val).toLocaleString() + ' دج';

  const bottomPad = Platform.OS === 'web' ? 34 + 60 + insets.bottom : 60 + insets.bottom;

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isOpen = status?.state === 'open';
  const isClosed = status?.state === 'closed_today';
  const isUnopened = status?.state === 'not_open';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: 16, paddingBottom: bottomPad }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-triangle" size={32} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={onRefresh}>
              <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {isUnopened && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
                  <Feather name="sun" size={28} color={colors.primary} />
                </View>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>افتتاح اليوم</Text>
                <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                  أدخل المبلغ الابتدائي الموجود فعليًا في لاكاس لبدء دورة العمل الجديدة.
                </Text>
                <View style={[styles.inputWrapper, { backgroundColor: colors.input }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="مبلغ الافتتاح (دج)"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    value={openingCashInput}
                    onChangeText={setOpeningCashInput}
                    testID="opening-cash-input"
                  />
                  <Text style={[styles.inputSuffix, { color: colors.mutedForeground }]}>دج</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: colors.primary }]}
                  onPress={handleOpenDay}
                  disabled={submitting}
                  testID="open-day-button"
                >
                  <Text style={styles.actionButtonText}>{submitting ? 'جارٍ الحفظ...' : 'تأكيد الافتتاح'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {isOpen && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.iconContainer, { backgroundColor: colors.warning + '20' }]}>
                  <Feather name="moon" size={28} color={colors.warning} />
                </View>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>إغلاق اليوم</Text>
                <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                  أدخل مبلغ النقد الفعلي الموجود في لاكاس لإنهاء الدورة اليومية. سيحسب التطبيق كل القيم تلقائيًا.
                </Text>
                <View style={[styles.inputWrapper, { backgroundColor: colors.input }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="النقد الفعلي (دج)"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    value={actualCashInput}
                    onChangeText={setActualCashInput}
                    testID="actual-cash-input"
                  />
                  <Text style={[styles.inputSuffix, { color: colors.mutedForeground }]}>دج</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: colors.warning }]}
                  onPress={handleCloseDay}
                  disabled={submitting}
                  testID="close-day-button"
                >
                  <Text style={styles.actionButtonText}>{submitting ? 'جارٍ الحفظ...' : 'تأكيد الإغلاق'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {isClosed && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.iconContainer, { backgroundColor: colors.success + '20' }]}>
                  <Feather name="check-circle" size={28} color={colors.success} />
                </View>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>اليوم مغلق</Text>
                <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                  تم إنهاء جميع العمليات وإغلاق الدورة المحاسبية لهذا اليوم بنجاح.
                </Text>
              </View>
            )}

            {isAdmin && stats && (
              <View style={styles.statsContainer}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>الخلاصة المالية</Text>
                
                <View style={styles.summaryGrid}>
                  <View style={[styles.summaryBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.summaryIcon, { backgroundColor: colors.primary + '20' }]}>
                      <Feather name="briefcase" size={16} color={colors.primary} />
                    </View>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>رصيد الصندوق</Text>
                    <Text style={[styles.summaryValue, { color: colors.foreground }]}>{fmt(stats.summary.fundBalance)}</Text>
                  </View>
                  
                  <View style={[styles.summaryBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.summaryIcon, { backgroundColor: colors.destructive + '20' }]}>
                      <Feather name="arrow-up-right" size={16} color={colors.destructive} />
                    </View>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>إجمالي المصاريف</Text>
                    <Text style={[styles.summaryValue, { color: colors.destructive }]}>{fmt(stats.summary.totalExpenses)}</Text>
                  </View>
                  
                  <View style={[styles.summaryBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.summaryIcon, { backgroundColor: colors.success + '20' }]}>
                      <Feather name="arrow-down-left" size={16} color={colors.success} />
                    </View>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>إجمالي المداخيل</Text>
                    <Text style={[styles.summaryValue, { color: colors.success }]}>{fmt(stats.summary.totalIncome)}</Text>
                  </View>
                </View>

                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 12 }]}>سجل الأيام المغلقة</Text>
                {stats.days.length === 0 ? (
                  <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Feather name="calendar" size={32} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
                    <Text style={[styles.emptyStateText, { color: colors.mutedForeground }]}>لا توجد أيام مغلقة مسجلة بعد</Text>
                  </View>
                ) : (
                  stats.days.map((day, index) => (
                    <View key={`${day.date}-${index}`} style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <TouchableOpacity 
                        style={styles.dayHeader} 
                        onPress={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.dayHeaderLeft}>
                          <View style={[styles.calendarIcon, { backgroundColor: colors.muted }]}>
                            <Feather name="calendar" size={16} color={colors.foreground} />
                          </View>
                          <Text style={[styles.dayDate, { color: colors.foreground }]}>{day.date}</Text>
                        </View>
                        
                        <View style={styles.dayHeaderRight}>
                          <View style={[
                            styles.dayNetBadge, 
                            { backgroundColor: Number(day.net) >= 0 ? colors.success + '20' : colors.destructive + '20' }
                          ]}>
                            <Text style={[
                              styles.dayNetText, 
                              { color: Number(day.net) >= 0 ? colors.success : colors.destructive }
                            ]}>
                              {fmt(day.net)}
                            </Text>
                          </View>
                          <Feather 
                            name={expandedDay === day.date ? 'chevron-up' : 'chevron-down'} 
                            size={20} 
                            color={colors.mutedForeground} 
                          />
                        </View>
                      </TouchableOpacity>

                      <View style={[styles.daySummary, { borderTopColor: colors.border }]}>
                        <DayMetric label="لاروسات" value={day.rossat} color={colors.foreground} />
                        <DayMetric label="المصاريف" value={day.totalExpenses} color={colors.destructive} />
                        <DayMetric label="المداخيل" value={day.totalIncome} color={colors.success} />
                        <DayMetric
                          label="الصافي"
                          value={day.net}
                          color={Number(day.net) >= 0 ? colors.success : colors.destructive}
                        />
                      </View>

                      {expandedDay === day.date && (
                        <View style={[styles.dayDetails, { borderTopColor: colors.border }]}>
                           <DetailRow label="النقد الفعلي (لاكاس)" value={day.actualCash ?? 0} colors={colors} />
                           <DetailRow label="مصاريف لاكاس" value={day.tillExpenses} colors={colors} />
                           <DetailRow label="مصاريف الصندوق" value={day.fundExpenses} colors={colors} />
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DayMetric({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={styles.dayMetric}>
      <Text style={styles.dayMetricLabel}>{label}</Text>
      <Text style={[styles.dayMetricValue, { color }]}>{Number(value).toLocaleString()} دج</Text>
    </View>
  );
}

function DetailRow({ label, value, colors }: { label: string, value: string | number, colors: any }) {
  const fmt = (val: string | number) => Number(val).toLocaleString() + ' دج';
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]}>{fmt(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 32,
    marginTop: 40,
  },
  errorText: {
    fontFamily: 'Changa_500Medium',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    fontFamily: 'Changa_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: 'Changa_700Bold',
    fontSize: 22,
    marginBottom: 8,
  },
  cardDesc: {
    fontFamily: 'Changa_400Regular',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    width: '100%',
    height: 56,
    marginBottom: 20,
    gap: 12,
  },
  input: {
    flex: 1,
    fontFamily: 'Changa_600SemiBold',
    fontSize: 18,
    textAlign: 'right',
  },
  inputSuffix: {
    fontFamily: 'Changa_500Medium',
    fontSize: 16,
  },
  actionButton: {
    width: '100%',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    fontFamily: 'Changa_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  statsContainer: {
    marginTop: 8,
  },
  sectionTitle: {
    fontFamily: 'Changa_700Bold',
    fontSize: 18,
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  summaryBox: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontFamily: 'Changa_500Medium',
    fontSize: 13,
    marginBottom: 4,
  },
  summaryValue: {
    fontFamily: 'Changa_700Bold',
    fontSize: 18,
  },
  emptyState: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontFamily: 'Changa_500Medium',
    fontSize: 14,
  },
  dayCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  dayHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  calendarIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayDate: {
    fontFamily: 'Changa_600SemiBold',
    fontSize: 16,
  },
  dayHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dayNetBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  dayNetText: {
    fontFamily: 'Changa_700Bold',
    fontSize: 13,
  },
  daySummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 8,
  },
  dayMetric: {
    width: '48%',
    padding: 9,
    borderRadius: 9,
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  dayMetricLabel: {
    color: '#64748B',
    fontFamily: 'Changa_400Regular',
    fontSize: 11,
    textAlign: 'right',
  },
  dayMetricValue: {
    fontFamily: 'Changa_700Bold',
    fontSize: 13,
    textAlign: 'right',
    marginTop: 2,
  },
  dayDetails: {
    borderTopWidth: 1,
    padding: 16,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontFamily: 'Changa_500Medium',
    fontSize: 14,
  },
  detailValue: {
    fontFamily: 'Changa_600SemiBold',
    fontSize: 15,
  },
});
