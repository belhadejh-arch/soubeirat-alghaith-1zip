import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useColors } from '@/hooks/useColors';
import { useToast } from '@/components/Toast';
import ConfirmModal from '@/components/ConfirmModal';
import EmptyState from '@/components/EmptyState';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { dailyAccountingApi, type ApiDailyStatus } from '@/utils/api';
import { getCurrentDate, getCurrentTime } from '@/utils/helpers';

type ExpenseSource = 'cash' | 'fund';

function displayDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}-${month}-${year}`;
}

export default function ExpensesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { expenses, suppliers, addExpense, deleteExpense, refresh } = useData();
  const { showToast } = useToast();
  const [status, setStatus] = useState<ApiDailyStatus | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showOpenDayPrompt, setShowOpenDayPrompt] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    amount: '',
    source: 'cash' as ExpenseSource,
    description: '',
    supplierId: '',
    supplierName: '',
  });

  const isAdmin = currentUser?.role === 'admin';
  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + 60 + insets.bottom : 60 + insets.bottom;

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await dailyAccountingApi.status());
    } catch {
      setStatus(null);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadStatus();
  }, [loadStatus]));

  const groupedExpenses = useMemo(() => {
    const groups = new Map<string, typeof expenses>();
    for (const expense of expenses) {
      const current = groups.get(expense.date) ?? [];
      current.push(expense);
      groups.set(expense.date, current);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [expenses]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refresh(), loadStatus()]);
    setRefreshing(false);
  }

  function openExpenseForm() {
    if (status?.state !== 'open') {
      setShowOpenDayPrompt(true);
      return;
    }
    setForm({
      amount: '',
      source: 'cash',
      description: '',
      supplierId: '',
      supplierName: '',
    });
    setShowAdd(true);
  }

  async function handleAddExpense() {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('أدخل مبلغًا صحيحًا', 'error');
      return;
    }
    if (!form.description.trim()) {
      showToast('أدخل سبب المصروف', 'error');
      return;
    }

    setSaving(true);
    try {
      const supplierDebt = form.supplierId
        ? { supplierId: form.supplierId, supplierName: form.supplierName }
        : undefined;
      await addExpense({
        amount,
        source: form.source,
        description: form.description.trim(),
        date: getCurrentDate(),
        time: getCurrentTime(),
        userId: currentUser?.id ?? '',
        userName: currentUser?.name ?? '',
      }, supplierDebt);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      showToast('تم تسجيل المصروف', 'success');
      setShowAdd(false);
      await loadStatus();
    } catch (error) {
      const code = (error as { code?: string }).code;
      showToast(code === 'no_active_day' ? 'يجب افتتاح اليوم أولًا' : 'تعذّر تسجيل المصروف', 'error');
      if (code === 'no_active_day') setShowAdd(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    try {
      await deleteExpense(id);
      showToast('تم حذف المصروف', 'success');
      await loadStatus();
    } catch {
      showToast('لا يمكن حذف مصروف من يوم مغلق', 'error');
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={['#0C4A6E', '#0EA5E9']}
        style={[styles.header, { paddingTop: topPad + 16 }]}
      >
        <Text style={styles.headerTitle}>المصاريف</Text>
        <Text style={styles.headerSubtitle}>تسجيل مصاريف لاكاس أو الصندوق</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 88, gap: 14 }}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        )}
        showsVerticalScrollIndicator={false}
      >
        {status?.state !== 'open' && (
          <TouchableOpacity
            style={[styles.openDayBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/daily-accounting')}
            testID="expenses-open-day-link"
          >
            <View style={[styles.bannerIcon, { backgroundColor: '#FEF3C7' }]}>
              <Feather name="clock" size={20} color="#B45309" />
            </View>
            <View style={styles.bannerText}>
              <Text style={[styles.bannerTitle, { color: colors.foreground }]}>
                {status?.state === 'closed_today' ? 'تم إغلاق حساب اليوم' : 'اليوم غير مفتوح'}
              </Text>
              <Text style={[styles.bannerSubtitle, { color: colors.mutedForeground }]}>
                {status?.state === 'closed_today'
                  ? 'لا يمكن تسجيل مصاريف جديدة حتى افتتاح اليوم التالي'
                  : 'انتقل إلى الحساب اليومي لافتتاح اليوم'}
              </Text>
            </View>
            <Feather name="chevron-left" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}

        {groupedExpenses.length === 0 ? (
          <EmptyState
            icon="credit-card"
            title="لا توجد مصاريف مسجلة"
            subtitle="بعد افتتاح اليوم يمكنك تسجيل أول مصروف"
          />
        ) : groupedExpenses.map(([date, dayExpenses]) => (
          <View key={date} style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.dayHeader, { borderBottomColor: colors.border }]}>
              <Feather name="calendar" size={16} color={colors.primary} />
              <Text style={[styles.dayTitle, { color: colors.foreground }]}>{displayDate(date)}</Text>
            </View>
            {dayExpenses.map((expense) => (
              <View key={expense.id} style={[styles.expenseRow, { borderBottomColor: colors.border }]}>
                <View style={styles.expenseInfo}>
                  <Text style={[styles.expenseDescription, { color: colors.foreground }]}>
                    {expense.description}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.sourceBadge, {
                      backgroundColor: expense.source === 'fund' ? '#FEF3C7' : '#E0F2FE',
                    }]}>
                      <Text style={[styles.sourceText, {
                        color: expense.source === 'fund' ? '#92400E' : '#075985',
                      }]}>
                        {expense.source === 'fund' ? 'الصندوق' : expense.source === 'cash' ? 'لاكاس' : 'غير محدد'}
                      </Text>
                    </View>
                    <Text style={[styles.expenseMeta, { color: colors.mutedForeground }]}>
                      {expense.time} · {expense.userName}
                    </Text>
                  </View>
                </View>
                <View style={styles.amountArea}>
                  <Text style={styles.expenseAmount}>{expense.amount.toLocaleString('ar-DZ')} دج</Text>
                  {isAdmin && status?.state === 'open' && status.day?.date === expense.date && (
                    <TouchableOpacity
                      onPress={() => setDeleteId(expense.id)}
                      hitSlop={10}
                      testID={`delete-expense-${expense.id}`}
                    >
                      <Feather name="trash-2" size={17} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: bottomPad + 16 }]}
        onPress={openExpenseForm}
        activeOpacity={0.85}
        testID="add-expense-button"
      >
        <LinearGradient colors={['#EF4444', '#DC2626']} style={styles.fabGradient}>
          <Feather name="plus" size={26} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>

      <ConfirmModal
        visible={!!deleteId}
        title="حذف المصروف"
        message="هل تريد حذف هذا المصروف؟ لا يمكن حذف مصاريف الأيام المغلقة."
        confirmLabel="حذف"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      <Modal
        visible={showOpenDayPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOpenDayPrompt(false)}
      >
        <View style={styles.promptRoot}>
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setShowOpenDayPrompt(false)}
          />
          <View style={[styles.promptCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.promptIcon}>
              <Feather name="clock" size={24} color="#B45309" />
            </View>
            <Text style={[styles.promptTitle, { color: colors.foreground }]}>اليوم غير مفتوح</Text>
            <Text style={[styles.promptMessage, { color: colors.mutedForeground }]}>
              يجب افتتاح اليوم من قسم الحساب اليومي قبل تسجيل المصاريف.
            </Text>
            <TouchableOpacity
              style={styles.promptPrimary}
              onPress={() => {
                setShowOpenDayPrompt(false);
                router.push('/daily-accounting');
              }}
              testID="go-to-daily-accounting-button"
            >
              <Text style={styles.promptPrimaryText}>الانتقال إلى الحساب اليومي</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.promptSecondary, { borderColor: colors.border }]}
              onPress={() => setShowOpenDayPrompt(false)}
              testID="cancel-open-day-prompt"
            >
              <Text style={[styles.promptSecondaryText, { color: colors.foreground }]}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setShowAdd(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 18 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <KeyboardAwareScrollViewCompat
              bottomOffset={20}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.formContent}
            >
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>إضافة مصروف</Text>

              <Text style={[styles.label, { color: colors.mutedForeground }]}>المبلغ (دج)</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                value={form.amount}
                onChangeText={(amount) => setForm((current) => ({ ...current, amount }))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
                textAlign="right"
                autoFocus
                testID="expense-amount-input"
              />

              <Text style={[styles.label, { color: colors.mutedForeground }]}>مصدر المصروف</Text>
              <View style={styles.sourceChoices}>
                {([
                  { value: 'cash' as const, label: 'لاكاس', icon: 'shopping-bag' as const },
                  { value: 'fund' as const, label: 'الصندوق', icon: 'archive' as const },
                ]).map((option) => {
                  const selected = form.source === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.sourceChoice, {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : colors.background,
                      }]}
                      onPress={() => setForm((current) => ({ ...current, source: option.value }))}
                      testID={`expense-source-${option.value}`}
                    >
                      <Feather name={option.icon} size={18} color={selected ? '#FFFFFF' : colors.foreground} />
                      <Text style={[styles.sourceChoiceText, { color: selected ? '#FFFFFF' : colors.foreground }]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: colors.mutedForeground }]}>السبب أو الوصف</Text>
              <TextInput
                style={[styles.input, styles.descriptionInput, {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                }]}
                value={form.description}
                onChangeText={(description) => setForm((current) => ({ ...current, description }))}
                placeholder="مثال: نقل البضاعة"
                placeholderTextColor={colors.mutedForeground}
                textAlign="right"
                multiline
                testID="expense-description-input"
              />

              <Text style={[styles.label, { color: colors.mutedForeground }]}>المورد (اختياري)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.supplierChoices}>
                <TouchableOpacity
                  style={[styles.supplierChip, {
                    borderColor: !form.supplierId ? colors.primary : colors.border,
                    backgroundColor: !form.supplierId ? colors.primary : colors.background,
                  }]}
                  onPress={() => setForm((current) => ({ ...current, supplierId: '', supplierName: '' }))}
                >
                  <Text style={[styles.supplierText, { color: !form.supplierId ? '#FFFFFF' : colors.foreground }]}>
                    بدون مورد
                  </Text>
                </TouchableOpacity>
                {suppliers.map((supplier) => {
                  const selected = form.supplierId === supplier.id;
                  return (
                    <TouchableOpacity
                      key={supplier.id}
                      style={[styles.supplierChip, {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : colors.background,
                      }]}
                      onPress={() => setForm((current) => ({
                        ...current,
                        supplierId: supplier.id,
                        supplierName: supplier.name,
                      }))}
                    >
                      <Text style={[styles.supplierText, { color: selected ? '#FFFFFF' : colors.foreground }]}>
                        {supplier.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.disabled]}
                onPress={handleAddExpense}
                disabled={saving}
                testID="save-expense-button"
              >
                <Text style={styles.saveButtonText}>{saving ? 'جارٍ الحفظ...' : 'حفظ المصروف'}</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 18 },
  headerTitle: { color: '#FFFFFF', fontSize: 23, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  headerSubtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  openDayBanner: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 15, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  bannerSubtitle: { fontSize: 11, fontFamily: 'Changa_400Regular', textAlign: 'right', marginTop: 2 },
  dayCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dayTitle: { fontSize: 14, fontFamily: 'Changa_600SemiBold' },
  expenseRow: { padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  expenseInfo: { flex: 1 },
  expenseDescription: { fontSize: 14, fontFamily: 'Changa_500Medium', textAlign: 'right' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  sourceBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  sourceText: { fontSize: 10, fontFamily: 'Changa_600SemiBold' },
  expenseMeta: { fontSize: 10, fontFamily: 'Changa_400Regular' },
  amountArea: { alignItems: 'flex-end', gap: 7 },
  expenseAmount: { color: '#DC2626', fontSize: 14, fontFamily: 'Changa_700Bold' },
  fab: { position: 'absolute', left: 20, width: 58, height: 58, borderRadius: 29, elevation: 8, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  fabGradient: { flex: 1, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.48)' },
  promptRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  promptCard: { width: '100%', maxWidth: 380, borderRadius: 20, borderWidth: 1, padding: 22, alignItems: 'center' },
  promptIcon: { width: 50, height: 50, borderRadius: 15, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  promptTitle: { fontSize: 19, fontFamily: 'Changa_700Bold', textAlign: 'center' },
  promptMessage: { fontSize: 13, fontFamily: 'Changa_400Regular', textAlign: 'center', lineHeight: 22, marginTop: 5, marginBottom: 18 },
  promptPrimary: { width: '100%', minHeight: 50, borderRadius: 13, backgroundColor: '#0C4A6E', alignItems: 'center', justifyContent: 'center' },
  promptPrimaryText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Changa_700Bold' },
  promptSecondary: { width: '100%', minHeight: 46, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  promptSecondaryText: { fontSize: 14, fontFamily: 'Changa_600SemiBold' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  handle: { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10 },
  formContent: { padding: 20, gap: 9 },
  sheetTitle: { fontSize: 21, fontFamily: 'Changa_700Bold', textAlign: 'right', marginBottom: 3 },
  label: { fontSize: 12, fontFamily: 'Changa_500Medium', textAlign: 'right', marginTop: 5 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: 15, fontFamily: 'Changa_400Regular' },
  descriptionInput: { minHeight: 76, paddingTop: 12, textAlignVertical: 'top' },
  sourceChoices: { flexDirection: 'row', gap: 10 },
  sourceChoice: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sourceChoiceText: { fontSize: 14, fontFamily: 'Changa_600SemiBold' },
  supplierChoices: { gap: 8, paddingVertical: 3 },
  supplierChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 8 },
  supplierText: { fontSize: 12, fontFamily: 'Changa_500Medium' },
  saveButton: { marginTop: 12, minHeight: 52, borderRadius: 14, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Changa_700Bold' },
  disabled: { opacity: 0.6 },
});