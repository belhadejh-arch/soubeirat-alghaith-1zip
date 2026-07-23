import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal,
  TextInput, Platform, KeyboardAvoidingView, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import ConfirmModal from '@/components/ConfirmModal';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { Supplier, SupplierTransaction } from '@/types';
import { supplierTransactionsApi, suppliersApi } from '@/utils/api';
import { getCurrentDate } from '@/utils/helpers';

export default function SuppliersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { suppliers, addSupplier, updateSupplier, deleteSupplier, refresh } = useData();
  const { showToast } = useToast();

  const [balances, setBalances] = useState<Record<string, number>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [transactions, setTransactions] = useState<SupplierTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showAddTx, setShowAddTx] = useState<'debt' | 'payment' | null>(null);
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [showEditSupplier, setShowEditSupplier] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [deleteConfirmSupplier, setDeleteConfirmSupplier] = useState<Supplier | null>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const bottomPad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;

  // Load aggregated balances for all suppliers
  const loadBalances = useCallback(async () => {
    setBalancesLoading(true);
    try {
      const rows = await suppliersApi.getBalances();
      const map: Record<string, number> = {};
      rows.forEach(r => { map[r.supplierId] = Number(r.balance); });
      setBalances(map);
    } catch {
      // silently ignore
    } finally {
      setBalancesLoading(false);
    }
  }, []);

  useEffect(() => { loadBalances(); }, [suppliers]);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    await loadBalances();
    setRefreshing(false);
  }

  async function openSupplier(s: Supplier) {
    setSelectedSupplier(s);
    setShowDetail(true);
    setTxLoading(true);
    try {
      const rows = await supplierTransactionsApi.list(s.id);
      // API returns newest-first (orderBy desc createdAt) — keep that order
      setTransactions(rows.map(r => ({ ...r, amount: Number(r.amount), type: r.type as 'debt' | 'payment' })));
    } catch {
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  }

  function closeDetail() {
    setShowDetail(false);
    setSelectedSupplier(null);
    setTransactions([]);
    loadBalances(); // refresh balances after closing detail
  }

  // Balance from live transactions (in detail modal)
  const detailBalance = transactions.reduce((acc, tx) => {
    return tx.type === 'debt' ? acc + tx.amount : acc - tx.amount;
  }, 0);

  async function handleAddTransaction() {
    if (!showAddTx || !selectedSupplier) return;
    const amount = parseFloat(txAmount);
    if (!amount || amount <= 0) { showToast('أدخل مبلغاً صحيحاً', 'error'); return; }
    try {
      const row = await supplierTransactionsApi.create(selectedSupplier.id, {
        supplierName: selectedSupplier.name,
        type: showAddTx,
        amount: String(amount),
        note: txNote.trim(),
        date: getCurrentDate(),
      });
      // Prepend so newest stays first
      setTransactions(prev => [{ ...row, amount: Number(row.amount), type: row.type as 'debt' | 'payment' }, ...prev]);
      // Update local balance cache
      setBalances(prev => {
        const current = prev[selectedSupplier.id] ?? 0;
        const delta = showAddTx === 'debt' ? amount : -amount;
        return { ...prev, [selectedSupplier.id]: current + delta };
      });
      showToast(showAddTx === 'debt' ? 'تم تسجيل الدين' : 'تم تسجيل السداد', 'success');
      setTxAmount('');
      setTxNote('');
      setShowAddTx(null);
    } catch {
      showToast('حدث خطأ', 'error');
    }
  }

  async function handleAddSupplier() {
    if (!newName.trim()) { showToast('أدخل اسم المورد', 'error'); return; }
    try {
      await addSupplier({ name: newName.trim(), phone: newPhone.trim(), address: '', notes: '' });
      showToast('تم إضافة المورد', 'success');
      setNewName('');
      setNewPhone('');
      setShowAddSupplier(false);
    } catch (err: any) {
      if (err?.code === 'duplicate_supplier') {
        showToast('يوجد مورد بنفس الاسم مسبقاً', 'error');
      } else {
        showToast('حدث خطأ', 'error');
      }
    }
  }

  async function handleEditSupplier() {
    if (!editName.trim() || !selectedSupplier) { showToast('أدخل اسم المورد', 'error'); return; }
    try {
      await updateSupplier(selectedSupplier.id, { name: editName.trim(), phone: editPhone.trim() });
      setSelectedSupplier(s => s ? { ...s, name: editName.trim(), phone: editPhone.trim() } : null);
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

  function confirmDeleteSupplier(supplier: Supplier) {
    setDeleteConfirmSupplier(supplier);
  }

  async function handleConfirmedDeleteSupplier() {
    if (!deleteConfirmSupplier) return;
    const supplier = deleteConfirmSupplier;
    setDeleteConfirmSupplier(null);
    try {
      await deleteSupplier(supplier.id);
      setShowDetail(false);
      setSelectedSupplier(null);
      setTransactions([]);
      showToast('تم حذف المورد', 'success');
    } catch {
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }

  const getBalanceLabel = (id: string) => {
    const b = balances[id] ?? 0;
    if (b === 0) return { text: 'لا ديون', color: '#64748B' };
    if (b > 0) return { text: `${b.toLocaleString()} دج مستحق`, color: '#DC2626' };
    return { text: `${Math.abs(b).toLocaleString()} دج زائد`, color: '#16A34A' };
  };

  const renderSupplier = ({ item }: { item: Supplier }) => {
    const bal = getBalanceLabel(item.id);
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => openSupplier(item)}
        activeOpacity={0.8}
      >
        <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
        </LinearGradient>
        <View style={styles.cardInfo}>
          <Text style={[styles.supplierName, { color: colors.foreground }]}>{item.name}</Text>
          <View style={styles.balanceRow}>
            {balancesLoading ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Text style={[styles.balanceText, { color: bal.color }]}>{bal.text}</Text>
            )}
            {!!item.phone && <Text style={[styles.supplierPhone, { color: colors.mutedForeground }]}>{item.phone}</Text>}
          </View>
        </View>
        <Feather name="chevron-left" size={20} color={colors.mutedForeground} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={suppliers}
        keyExtractor={i => i.id}
        renderItem={renderSupplier}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 90, gap: 10 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState icon="users" title="لا يوجد موردون" subtitle="اضغط + لإضافة مورد" />
        }
      />

      {isAdmin && (
        <TouchableOpacity style={[styles.fab, { bottom: bottomPad + 20 }]} onPress={() => setShowAddSupplier(true)}>
          <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.fabGrad}>
            <Feather name="plus" size={26} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* ── Supplier Detail Modal ── */}
      <Modal visible={showDetail} transparent animationType="slide" onRequestClose={closeDetail}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={closeDetail} />
          <View style={[styles.detailSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 24 }]}>
            <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={styles.detailHeader}>
              <View style={styles.detailHeaderRow}>
                <TouchableOpacity onPress={closeDetail}>
                  <Feather name="x" size={22} color="#fff" />
                </TouchableOpacity>
                {isAdmin && (
                  <View style={styles.detailHeaderActions}>
                    <TouchableOpacity
                      onPress={() => {
                        setEditName(selectedSupplier?.name ?? '');
                        setEditPhone(selectedSupplier?.phone ?? '');
                        setShowEditSupplier(true);
                      }}
                      style={styles.headerIconBtn}
                    >
                      <Feather name="edit-2" size={18} color="rgba(255,255,255,0.9)" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => selectedSupplier && confirmDeleteSupplier(selectedSupplier)}
                      style={styles.headerIconBtn}
                    >
                      <Feather name="trash-2" size={18} color="rgba(255,180,180,0.9)" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <Text style={styles.detailTitle}>{selectedSupplier?.name}</Text>
              <Text style={[
                styles.balanceDetailText,
                { color: detailBalance > 0 ? '#FDE68A' : detailBalance < 0 ? '#86EFAC' : 'rgba(255,255,255,0.75)' },
              ]}>
                الرصيد: {Math.abs(detailBalance).toLocaleString()} دج
                {detailBalance > 0 ? ' (مستحق)' : detailBalance < 0 ? ' (زائد)' : ' (مسوّى)'}
              </Text>
            </LinearGradient>

            {/* Action Buttons */}
            <View style={styles.txBtns}>
              <TouchableOpacity style={[styles.txBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => setShowAddTx('debt')}>
                <Feather name="trending-up" size={18} color="#DC2626" />
                <Text style={[styles.txBtnText, { color: '#DC2626' }]}>إضافة دين</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.txBtn, { backgroundColor: '#DCFCE7' }]} onPress={() => setShowAddTx('payment')}>
                <Feather name="check-circle" size={18} color="#16A34A" />
                <Text style={[styles.txBtnText, { color: '#16A34A' }]}>تسجيل سداد</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.historyTitle, { color: colors.foreground }]}>سجل العمليات</Text>
            {txLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : transactions.length === 0 ? (
              <Text style={[styles.emptyNote, { color: colors.mutedForeground }]}>لا توجد عمليات مسجلة بعد</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {transactions.map(tx => (
                  <View key={tx.id} style={[styles.txRow, { borderColor: colors.border }]}>
                    <View style={[styles.txDot, { backgroundColor: tx.type === 'debt' ? '#EF4444' : '#22C55E' }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.txType, { color: tx.type === 'debt' ? '#DC2626' : '#16A34A' }]}>
                        {tx.type === 'debt' ? 'دين' : 'سداد'}
                        {tx.note ? ` — ${tx.note}` : ''}
                      </Text>
                      <Text style={[styles.txDate, { color: colors.mutedForeground }]}>{tx.date}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color: tx.type === 'debt' ? '#DC2626' : '#16A34A' }]}>
                      {tx.type === 'debt' ? '+' : '-'}{Number(tx.amount).toLocaleString()} دج
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        visible={!!deleteConfirmSupplier}
        title="حذف المورد"
        message={`هل أنت متأكد من حذف "${deleteConfirmSupplier?.name ?? ''}" وجميع معاملاته؟`}
        confirmLabel="حذف"
        onConfirm={handleConfirmedDeleteSupplier}
        onCancel={() => setDeleteConfirmSupplier(null)}
      />

      {/* ── Add Transaction Modal ── */}
      <Modal visible={!!showAddTx} transparent animationType="slide" onRequestClose={() => setShowAddTx(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={() => setShowAddTx(null)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              {showAddTx === 'debt' ? 'إضافة دين' : 'تسجيل سداد'}
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>المبلغ (دج) *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="0.00" placeholderTextColor={colors.mutedForeground}
              value={txAmount} onChangeText={setTxAmount} keyboardType="numeric" textAlign="right" autoFocus
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ملاحظة (اختياري)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="مثال: بضاعة رمضان..." placeholderTextColor={colors.mutedForeground}
              value={txNote} onChangeText={setTxNote} textAlign="right"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddTransaction}>
              <LinearGradient
                colors={showAddTx === 'debt' ? ['#EF4444', '#DC2626'] : ['#22C55E', '#16A34A']}
                style={styles.saveBtnGrad}
              >
                <Text style={styles.saveBtnText}>{showAddTx === 'debt' ? 'تسجيل الدين' : 'تسجيل السداد'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit Supplier Modal ── */}
      <Modal visible={showEditSupplier} transparent animationType="slide" onRequestClose={() => setShowEditSupplier(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={() => setShowEditSupplier(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>تعديل بيانات المورد</Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>الاسم *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="اسم المورد" placeholderTextColor={colors.mutedForeground}
              value={editName} onChangeText={setEditName} textAlign="right" autoFocus
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>رقم الهاتف (اختياري)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="05XXXXXXXX" placeholderTextColor={colors.mutedForeground}
              value={editPhone} onChangeText={setEditPhone} textAlign="right" keyboardType="phone-pad"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleEditSupplier}>
              <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.saveBtnGrad}>
                <Text style={styles.saveBtnText}>حفظ التعديلات</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add Supplier Modal ── */}
      <Modal visible={showAddSupplier} transparent animationType="slide" onRequestClose={() => setShowAddSupplier(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={() => setShowAddSupplier(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>إضافة مورد</Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>الاسم *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="اسم المورد" placeholderTextColor={colors.mutedForeground}
              value={newName} onChangeText={setNewName} textAlign="right" autoFocus
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>رقم الهاتف (اختياري)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="05XXXXXXXX" placeholderTextColor={colors.mutedForeground}
              value={newPhone} onChangeText={setNewPhone} textAlign="right" keyboardType="phone-pad"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddSupplier}>
              <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.saveBtnGrad}>
                <Text style={styles.saveBtnText}>إضافة المورد</Text>
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
  card: { borderRadius: 14, padding: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 20, fontFamily: 'Changa_700Bold', color: '#fff' },
  cardInfo: { flex: 1, gap: 2 },
  supplierName: { fontSize: 16, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  balanceText: { fontSize: 13, fontFamily: 'Changa_600SemiBold' },
  supplierPhone: { fontSize: 12, fontFamily: 'Changa_400Regular' },
  fab: { position: 'absolute', left: 20, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', elevation: 8 },
  fabGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  detailSheet: { flex: 1, marginTop: 60, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  detailHeader: { padding: 20, paddingTop: 24, gap: 4 },
  detailHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  detailHeaderActions: { flexDirection: 'row', gap: 12 },
  headerIconBtn: { padding: 4 },
  detailTitle: { fontSize: 22, fontFamily: 'Changa_700Bold', color: '#fff', textAlign: 'right' },
  balanceDetailText: { fontSize: 15, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  txBtns: { flexDirection: 'row', gap: 12, padding: 16 },
  txBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14 },
  txBtnText: { fontSize: 15, fontFamily: 'Changa_600SemiBold' },
  historyTitle: { fontSize: 16, fontFamily: 'Changa_600SemiBold', textAlign: 'right', paddingHorizontal: 16, marginBottom: 8 },
  emptyNote: { textAlign: 'center', fontFamily: 'Changa_400Regular', fontSize: 14, paddingVertical: 20 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  txDot: { width: 10, height: 10, borderRadius: 5 },
  txType: { fontSize: 14, fontFamily: 'Changa_500Medium', textAlign: 'right' },
  txDate: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  txAmount: { fontSize: 15, fontFamily: 'Changa_700Bold' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  sheetTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  fieldLabel: { fontSize: 13, fontFamily: 'Changa_500Medium', textAlign: 'right' },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15, fontFamily: 'Changa_400Regular' },
  saveBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  saveBtnGrad: { padding: 16, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontFamily: 'Changa_600SemiBold', color: '#fff' },
});
