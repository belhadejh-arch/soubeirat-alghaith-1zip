import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal,
  TextInput, Platform, KeyboardAvoidingView, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import ConfirmModal from '@/components/ConfirmModal';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { supplierTransactionsApi } from '@/utils/api';
import { getCurrentDate, getCurrentTime, formatTime } from '@/utils/helpers';
import type { SupplierTransaction } from '@/types';

function fmt(n: number) { return n.toLocaleString('fr-DZ') + ' دج'; }
function toDisplayDate(dateStr: string) {
  const p = dateStr.split('-');
  return `${p[2]}-${p[1]}-${p[0]}`;
}

export default function SupplierDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { updateSupplier, deleteSupplier, setBalances } = useData();
  const { showToast } = useToast();

  const params = useLocalSearchParams<{
    supplierId: string;
    supplierName: string;
    supplierPhone: string;
  }>();
  const supplierId = params.supplierId;

  const isAdmin = currentUser?.role === 'admin';
  const isAdminOrSupervisor = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;

  const [supplierName, setSupplierName] = useState(params.supplierName ?? '');
  const [supplierPhone, setSupplierPhone] = useState(params.supplierPhone ?? '');

  const [transactions, setTransactions] = useState<SupplierTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showAddTx, setShowAddTx] = useState<'debt' | 'payment' | null>(null);
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [txSaving, setTxSaving] = useState(false);

  const [showEditSupplier, setShowEditSupplier] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const [confirmDeleteSupplier, setConfirmDeleteSupplier] = useState(false);
  const [deleteTx, setDeleteTx] = useState<SupplierTransaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<string | null>(null);

  const currentBalance = useMemo(() => {
    if (transactions.length === 0) return 0;
    return transactions[0].balanceAfter;
  }, [transactions]);

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
      showToast('تعذّر تحميل العمليات', 'error');
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  }

  async function handleAddTransaction() {
    if (!showAddTx) return;
    const amount = parseFloat(txAmount);
    if (!amount || amount <= 0) { showToast('أدخل مبلغاً صحيحاً', 'error'); return; }
    setTxSaving(true);
    try {
      const row = await supplierTransactionsApi.create(supplierId, {
        supplierName,
        type: showAddTx,
        amount: String(amount),
        note: txNote.trim(),
        date: getCurrentDate(),
        time: getCurrentTime(),
        userId: currentUser?.id ?? null,
        userName: currentUser?.name ?? '',
      });
      const newTx: SupplierTransaction = {
        ...row,
        amount: Number(row.amount),
        type: row.type as 'debt' | 'payment',
        balanceBefore: Number(row.balanceBefore ?? 0),
        balanceAfter: Number(row.balanceAfter ?? 0),
      };
      setTransactions(prev => [newTx, ...prev]);
      setBalances(prev => {
        const delta = showAddTx === 'debt' ? amount : -amount;
        return { ...prev, [supplierId]: (prev[supplierId] ?? 0) + delta };
      });
      showToast(showAddTx === 'debt' ? 'تم تسجيل الدين' : 'تم تسجيل السداد', 'success');
      setTxAmount('');
      setTxNote('');
      setShowAddTx(null);
    } catch {
      showToast('حدث خطأ', 'error');
    } finally {
      setTxSaving(false);
    }
  }

  async function handleDeleteTransaction() {
    if (!deleteTx) return;
    const tx = deleteTx;
    setDeleteTx(null);
    setDeletingTx(tx.id);
    try {
      await supplierTransactionsApi.remove(supplierId, tx.id);
      const rows = await supplierTransactionsApi.list(supplierId);
      const updated = rows.map(r => ({
        ...r,
        amount: Number(r.amount),
        type: r.type as 'debt' | 'payment',
        balanceBefore: Number(r.balanceBefore ?? 0),
        balanceAfter: Number(r.balanceAfter ?? 0),
      }));
      setTransactions(updated);
      const newBalance = updated.length > 0 ? updated[0].balanceAfter : 0;
      setBalances(prev => ({ ...prev, [supplierId]: newBalance }));
      showToast('تم حذف العملية وإعادة احتساب الرصيد', 'success');
    } catch (err: any) {
      if (err?.code === 'admin_only') {
        showToast('فقط المدير يمكنه حذف العمليات', 'error');
      } else {
        showToast('حدث خطأ أثناء الحذف', 'error');
      }
    } finally {
      setDeletingTx(null);
    }
  }

  async function handleEditSupplier() {
    if (!editName.trim()) { showToast('أدخل اسم المورد', 'error'); return; }
    try {
      await updateSupplier(supplierId, { name: editName.trim(), phone: editPhone.trim() });
      setSupplierName(editName.trim());
      setSupplierPhone(editPhone.trim());
      showToast('تم تحديث بيانات المورد', 'success');
      setShowEditSupplier(false);
    } catch (err: any) {
      if (err?.code === 'duplicate_supplier') {
        showToast('يوجد مورد بنفس الاسم مسبقاً', 'error');
      } else {
        showToast('حدث خطأ', 'error');
      }
    }
  }

  async function handleDeleteSupplier() {
    setConfirmDeleteSupplier(false);
    try {
      await deleteSupplier(supplierId);
      showToast('تم حذف المورد', 'success');
      router.back();
    } catch {
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }

  const renderTx = ({ item: tx }: { item: SupplierTransaction }) => {
    const isDebt = tx.type === 'debt';
    const isDeleting = deletingTx === tx.id;
    return (
      <View style={[styles.txRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={[styles.txBar, { backgroundColor: isDebt ? '#EF4444' : '#22C55E' }]} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.txTopRow}>
            <Text style={[styles.txAmount, { color: isDebt ? '#DC2626' : '#16A34A' }]}>
              {isDebt ? '+' : '-'}{fmt(tx.amount)}
            </Text>
            <View style={[styles.txTypeBadge, { backgroundColor: isDebt ? '#FEE2E2' : '#DCFCE7' }]}>
              <Text style={[styles.txTypeText, { color: isDebt ? '#DC2626' : '#16A34A' }]}>
                {isDebt ? '📈 دين' : '✅ سداد'}
              </Text>
            </View>
          </View>
          <View style={styles.txMidRow}>
            <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
              🕐 {tx.time ? formatTime(tx.time) : ''}
            </Text>
            <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
              📅 {toDisplayDate(tx.date)}
            </Text>
          </View>
          {!!tx.userName && (
            <Text style={[styles.txEmployee, { color: colors.mutedForeground }]}>
              👤 {tx.userName}
            </Text>
          )}
          {!!tx.note && (
            <Text style={[styles.txNote, { color: colors.foreground }]}>📝 {tx.note}</Text>
          )}
          <View style={styles.txBalanceRow}>
            <Text style={[styles.txBalancePart, { color: colors.mutedForeground }]}>
              بعد: <Text style={{ color: colors.foreground, fontFamily: 'Changa_600SemiBold' }}>{fmt(tx.balanceAfter)}</Text>
            </Text>
            <Text style={[styles.txBalancePart, { color: colors.mutedForeground }]}>
              قبل: <Text style={{ color: colors.foreground }}>{fmt(tx.balanceBefore)}</Text>
            </Text>
          </View>
        </View>
        {isAdmin && (
          isDeleting ? (
            <ActivityIndicator size="small" color="#EF4444" style={{ marginLeft: 8 }} />
          ) : (
            <TouchableOpacity
              style={styles.deleteTxBtn}
              onPress={() => setDeleteTx(tx)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="trash-2" size={16} color="#EF4444" />
            </TouchableOpacity>
          )
        )}
      </View>
    );
  };

  const balanceColor = currentBalance > 0 ? '#DC2626' : currentBalance < 0 ? '#16A34A' : '#64748B';
  const balanceBg = currentBalance > 0 ? '#FEF2F2' : currentBalance < 0 ? '#F0FDF4' : '#F8FAFC';
  const balanceLabel = currentBalance > 0 ? 'مستحق للمورد' : currentBalance < 0 ? 'زائد (دفعت أكثر)' : 'الحساب مسوّى';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-right" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            {/* Stats button */}
            <TouchableOpacity
              style={[styles.headerIconBtn, styles.statsBtn]}
              onPress={() => router.push({
                pathname: '/suppliers/[supplierId]/stats',
                params: { supplierId, supplierName },
              })}
            >
              <Feather name="bar-chart-2" size={16} color="#fff" />
              <Text style={styles.statsBtnText}>إحصائيات</Text>
            </TouchableOpacity>
            {isAdminOrSupervisor && (
              <>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={() => { setEditName(supplierName); setEditPhone(supplierPhone); setShowEditSupplier(true); }}
                >
                  <Feather name="edit-2" size={18} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={() => setConfirmDeleteSupplier(true)}
                >
                  <Feather name="trash-2" size={18} color="rgba(255,160,160,0.9)" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        <Text style={styles.headerTitle}>{supplierName}</Text>
        {!!supplierPhone && (
          <Text style={styles.headerPhone}>{supplierPhone}</Text>
        )}
      </LinearGradient>

      {/* Big Balance Card */}
      {!loading && (
        <View style={[styles.balanceCard, { backgroundColor: balanceBg, borderColor: balanceColor + '30' }]}>
          <Text style={[styles.balanceCardLabel, { color: balanceColor + 'CC' }]}>الرصيد الحالي</Text>
          <Text style={[styles.balanceCardAmount, { color: balanceColor }]}>
            {fmt(Math.abs(currentBalance))}
          </Text>
          <Text style={[styles.balanceCardStatus, { color: balanceColor + 'AA' }]}>{balanceLabel}</Text>
        </View>
      )}

      {/* Action buttons */}
      {isAdminOrSupervisor && (
        <View style={styles.actionBtns}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => setShowAddTx('debt')}>
            <Feather name="trending-up" size={18} color="#DC2626" />
            <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>إضافة دين</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#DCFCE7' }]} onPress={() => setShowAddTx('payment')}>
            <Feather name="check-circle" size={18} color="#16A34A" />
            <Text style={[styles.actionBtnText, { color: '#16A34A' }]}>تسجيل سداد</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Transaction list */}
      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: colors.foreground }]}>
          سجل العمليات ({transactions.length})
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#0EA5E9" style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={i => i.id}
          renderItem={renderTx}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40, gap: 10 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#0EA5E9']} tintColor="#0EA5E9" />
          }
          ListEmptyComponent={
            <EmptyState icon="file-text" title="لا توجد عمليات" subtitle="أضف دين أو سداد للبدء" />
          }
        />
      )}

      {/* Confirm delete transaction */}
      <ConfirmModal
        visible={!!deleteTx}
        title="حذف العملية"
        message={`هل تريد حذف هذه العملية؟\n${deleteTx?.type === 'debt' ? 'دين' : 'سداد'}: ${deleteTx ? fmt(deleteTx.amount) : ''}\nسيتم إعادة احتساب جميع الأرصدة تلقائياً.`}
        confirmLabel="حذف"
        onConfirm={handleDeleteTransaction}
        onCancel={() => setDeleteTx(null)}
      />

      {/* Confirm delete supplier */}
      <ConfirmModal
        visible={confirmDeleteSupplier}
        title="حذف المورد"
        message={`هل أنت متأكد من حذف "${supplierName}" وجميع معاملاته؟`}
        confirmLabel="حذف"
        onConfirm={handleDeleteSupplier}
        onCancel={() => setConfirmDeleteSupplier(false)}
      />

      {/* Add transaction modal */}
      <Modal visible={!!showAddTx} transparent animationType="slide" onRequestClose={() => setShowAddTx(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={() => setShowAddTx(null)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              {showAddTx === 'debt' ? '📈 إضافة دين' : '✅ تسجيل سداد'}
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>المبلغ (دج) *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              value={txAmount}
              onChangeText={setTxAmount}
              keyboardType="numeric"
              textAlign="right"
              autoFocus
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ملاحظة (اختياري)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="مثال: بضاعة رمضان..."
              placeholderTextColor={colors.mutedForeground}
              value={txNote}
              onChangeText={setTxNote}
              textAlign="right"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddTransaction} disabled={txSaving}>
              <LinearGradient
                colors={showAddTx === 'debt' ? ['#EF4444', '#DC2626'] : ['#22C55E', '#16A34A']}
                style={styles.saveBtnGrad}
              >
                {txSaving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>{showAddTx === 'debt' ? 'تسجيل الدين' : 'تسجيل السداد'}</Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit supplier modal */}
      <Modal visible={showEditSupplier} transparent animationType="slide" onRequestClose={() => setShowEditSupplier(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={() => setShowEditSupplier(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>تعديل بيانات المورد</Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>الاسم *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="اسم المورد"
              placeholderTextColor={colors.mutedForeground}
              value={editName}
              onChangeText={setEditName}
              textAlign="right"
              autoFocus
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>رقم الهاتف (اختياري)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="05XXXXXXXX"
              placeholderTextColor={colors.mutedForeground}
              value={editPhone}
              onChangeText={setEditPhone}
              textAlign="right"
              keyboardType="phone-pad"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleEditSupplier}>
              <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.saveBtnGrad}>
                <Text style={styles.saveBtnText}>حفظ التعديلات</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn: { padding: 4 },
  headerActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  headerIconBtn: { padding: 4 },
  statsBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statsBtnText: { fontSize: 12, fontFamily: 'Changa_500Medium', color: '#fff' },
  headerTitle: { fontSize: 24, fontFamily: 'Changa_700Bold', color: '#fff', textAlign: 'right' },
  headerPhone: { fontSize: 13, fontFamily: 'Changa_400Regular', color: 'rgba(255,255,255,0.75)', textAlign: 'right', marginTop: 2 },

  balanceCard: {
    marginHorizontal: 16, marginTop: 14, borderRadius: 18, padding: 20,
    alignItems: 'center', borderWidth: 1.5, gap: 4,
  },
  balanceCardLabel: { fontSize: 13, fontFamily: 'Changa_500Medium' },
  balanceCardAmount: { fontSize: 34, fontFamily: 'Changa_700Bold' },
  balanceCardStatus: { fontSize: 13, fontFamily: 'Changa_400Regular' },

  actionBtns: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14 },
  actionBtnText: { fontSize: 15, fontFamily: 'Changa_600SemiBold' },

  listHeader: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  listTitle: { fontSize: 15, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },

  txRow: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  txBar: { width: 4, borderRadius: 2, alignSelf: 'stretch', minHeight: 60, flexShrink: 0 },
  txTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  txAmount: { fontSize: 18, fontFamily: 'Changa_700Bold' },
  txTypeBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  txTypeText: { fontSize: 13, fontFamily: 'Changa_600SemiBold' },
  txMidRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 14 },
  txMeta: { fontSize: 12, fontFamily: 'Changa_400Regular' },
  txEmployee: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  txNote: { fontSize: 13, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  txBalanceRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 2 },
  txBalancePart: { fontSize: 12, fontFamily: 'Changa_400Regular' },
  deleteTxBtn: { padding: 6, marginTop: 4, flexShrink: 0 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  fieldLabel: { fontSize: 13, fontFamily: 'Changa_500Medium', textAlign: 'right' },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15, fontFamily: 'Changa_400Regular' },
  saveBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  saveBtnGrad: { padding: 16, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontFamily: 'Changa_600SemiBold', color: '#fff' },
});
