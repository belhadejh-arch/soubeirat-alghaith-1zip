import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal,
  TextInput, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import ConfirmModal from '@/components/ConfirmModal';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { customersApi } from '@/utils/api';
import type { Customer } from '@/types';

function fmt(n: number) { return n.toLocaleString('fr-DZ') + ' دج'; }
function toDisplay(dateStr: string) { const p = dateStr.split('-'); return `${p[2]}-${p[1]}-${p[0]}`; }
function daysSince(dateStr: string | null): number {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export default function FamilyMembersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{
    familyId: string; familyName: string; memberCount: string; totalBalance: string;
  }>();
  const familyId = params.familyId;
  const familyName = params.familyName ?? '';
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;

  // ─── State ────────────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(Number(params.totalBalance ?? 0));
  const [memberCount, setMemberCount] = useState(Number(params.memberCount ?? 0));

  // Customer form
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', maxCredit: '' });
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);

  // ─── Load ─────────────────────────────────────────────────────────────────
  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await customersApi.list(familyId);
      const mapped = rows.map(r => ({
        ...r,
        status: r.status as 'active' | 'blocked',
        balance: Number(r.balance),
      }));
      setCustomers(mapped);
      setTotalBalance(mapped.reduce((s, c) => s + c.balance, 0));
      setMemberCount(mapped.length);
    } catch {
      showToast('تعذّر تحميل الزبائن', 'error');
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => { loadCustomers(); }, []);

  // ─── Customer operations ──────────────────────────────────────────────────
  async function handleAddCustomer() {
    if (!customerForm.name.trim()) { showToast('أدخل اسم الزبون', 'error'); return; }
    const maxCredit = customerForm.maxCredit.trim() ? Number(customerForm.maxCredit.replace(',', '.')) : null;
    if (isAdmin && maxCredit !== null && (!Number.isFinite(maxCredit) || maxCredit < 0)) {
      showToast('أدخل سقفاً صحيحاً أو اتركه فارغاً', 'error'); return;
    }
    try {
      const row = await customersApi.create({
        familyId,
        familyName,
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim(),
        addedByUserId: currentUser?.id,
        addedByUserName: currentUser?.name ?? '',
        ...(isAdmin ? { maxCredit } : {}),
      });
      const mapped: Customer = {
        ...row,
        status: row.status as 'active' | 'blocked',
        balance: Number(row.balance),
        maxCredit: row.maxCredit == null ? null : Number(row.maxCredit),
      };
      setCustomers(prev => [...prev, mapped]);
      setMemberCount(prev => prev + 1);
      showToast('تم إضافة الزبون', 'success');
      setCustomerForm({ name: '', phone: '', maxCredit: '' });
      setShowAddCustomer(false);
    } catch {
      showToast('حدث خطأ', 'error');
    }
  }

  async function handleEditCustomer() {
    if (!editingCustomer) return;
    if (!customerForm.name.trim()) { showToast('أدخل اسم الزبون', 'error'); return; }
    const maxCredit = customerForm.maxCredit.trim() ? Number(customerForm.maxCredit.replace(',', '.')) : null;
    if (isAdmin && maxCredit !== null && (!Number.isFinite(maxCredit) || maxCredit < 0)) {
      showToast('أدخل سقفاً صحيحاً أو اتركه فارغاً', 'error'); return;
    }
    try {
      const row = await customersApi.update(editingCustomer.id, {
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim(),
        ...(isAdmin ? { maxCredit } : {}),
      });
      setCustomers(prev => prev.map(c => c.id === editingCustomer.id
        ? {
            ...c,
            name: row.name,
            phone: row.phone,
            maxCredit: row.maxCredit == null ? null : Number(row.maxCredit),
          } : c));
      showToast('تم تحديث بيانات الزبون', 'success');
      setCustomerForm({ name: '', phone: '', maxCredit: '' });
      setShowEditCustomer(false);
      setEditingCustomer(null);
    } catch {
      showToast('حدث خطأ', 'error');
    }
  }

  async function handleDeleteCustomer() {
    if (!deleteCustomer) return;
    const c = deleteCustomer;
    setDeleteCustomer(null);
    try {
      await customersApi.remove(c.id);
      setCustomers(prev => prev.filter(x => x.id !== c.id));
      setMemberCount(prev => Math.max(0, prev - 1));
      setTotalBalance(prev => prev - c.balance);
      showToast('تم حذف الزبون', 'success');
    } catch {
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }

  async function handleToggleBlock(c: Customer) {
    try {
      const row = await customersApi.toggleBlock(c.id);
      const newStatus = row.status as 'active' | 'blocked';
      setCustomers(prev => prev.map(x => x.id === c.id ? { ...x, status: newStatus } : x));
      showToast(newStatus === 'blocked' ? 'تم حظر الزبون' : 'تم إلغاء الحظر', 'success');
    } catch {
      showToast('حدث خطأ', 'error');
    }
  }

  function openCustomer(c: Customer) {
    router.push({
      pathname: '/customers/[familyId]/[customerId]',
      params: {
        familyId,
        customerId: c.id,
        customerName: c.name,
        familyName,
        balance: String(c.balance),
        status: c.status,
        phone: c.phone ?? '',
        maxCredit: c.maxCredit == null ? '' : String(c.maxCredit),
        lastPaymentDate: c.lastPaymentDate ?? '',
      },
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <LinearGradient colors={['#F97316', '#EA580C']} style={[s.header, { paddingTop: topPad + 8 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-right" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={s.headerTitle}>{familyName}</Text>
            <Text style={s.headerSub}>
              {memberCount} فرد • إجمالي: {fmt(totalBalance)}
            </Text>
          </View>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => { setCustomerForm({ name: '', phone: '', maxCredit: '' }); setShowAddCustomer(true); }}
          >
            <Feather name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 60 }} size="large" />
      ) : customers.length === 0 ? (
        <EmptyState icon="user" title="لا يوجد زبائن" subtitle="اضغط + لإضافة زبون" />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40, gap: 14 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: c }) => {
            const creditLimitReached = c.maxCredit !== null && c.balance >= c.maxCredit;
            const overdue = daysSince(c.lastPaymentDate) > 30 && c.balance > 0;
            return (
              <TouchableOpacity
                style={[
                  s.customerCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  creditLimitReached && s.cardDanger,
                  !creditLimitReached && overdue && s.cardWarning,
                ]}
                onPress={() => openCustomer(c)}
                activeOpacity={0.8}
              >
                {/* Left: Avatar */}
                <View style={[s.customerAvatar, { backgroundColor: c.status === 'blocked' ? '#EF4444' : '#F97316' }]}>
                  <Text style={s.avatarText}>{c.name.charAt(0)}</Text>
                </View>

                {/* Middle: Info */}
                <View style={{ flex: 1, gap: 5 }}>
                  <View style={s.nameRow}>
                    <Text style={[s.customerName, { color: colors.foreground }]}>{c.name}</Text>
                    {c.status === 'blocked' && (
                      <View style={s.blockedBadge}><Text style={s.blockedText}>محظور</Text></View>
                    )}
                    {creditLimitReached && <Feather name="alert-triangle" size={15} color="#EF4444" />}
                    {overdue && !creditLimitReached && <Feather name="clock" size={15} color="#F59E0B" />}
                  </View>
                  {c.phone ? (
                    <Text style={[s.customerMeta, { color: colors.mutedForeground }]}>📞 {c.phone}</Text>
                  ) : null}
                  {c.maxCredit !== null ? (
                    <Text style={[s.customerMeta, { color: creditLimitReached ? '#DC2626' : colors.mutedForeground }]}>
                      {creditLimitReached
                        ? 'بلغ سقف الكريدي'
                        : `السقف: ${fmt(c.maxCredit)} • المتبقي: ${fmt(Math.max(0, c.maxCredit - c.balance))}`}
                    </Text>
                  ) : null}
                  {c.lastPaymentDate ? (
                    <Text style={[s.customerMeta, { color: colors.mutedForeground }]}>
                      آخر سداد: {toDisplay(c.lastPaymentDate)}
                    </Text>
                  ) : null}
                </View>

                {/* Right: Balance + Actions */}
                <View style={s.rightCol}>
                  <Text style={[s.balanceText, { color: c.balance > 0 ? '#DC2626' : '#16A34A' }]}>
                    {c.balance > 0 ? fmt(c.balance) : '✅'}
                  </Text>
                  {isAdmin && (
                    <View style={s.actionRow}>
                      <TouchableOpacity style={s.iconBtn} onPress={() => {
                        setEditingCustomer(c);
                        setCustomerForm({
                          name: c.name,
                          phone: c.phone,
                          maxCredit: c.maxCredit == null ? '' : String(c.maxCredit),
                        });
                        setShowEditCustomer(true);
                      }}>
                        <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.iconBtn} onPress={() => handleToggleBlock(c)}>
                        <Feather name={c.status === 'blocked' ? 'unlock' : 'slash'} size={14} color={c.status === 'blocked' ? '#16A34A' : '#F59E0B'} />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.iconBtn} onPress={() => setDeleteCustomer(c)}>
                        <Feather name="trash-2" size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  )}
                  <Feather name="chevron-left" size={16} color={colors.mutedForeground} style={{ marginTop: 4 }} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── Add/Edit Customer Modals ──────────────────────────────────────── */}
      {[
        { visible: showAddCustomer, title: 'إضافة زبون', onSave: handleAddCustomer, onClose: () => setShowAddCustomer(false) },
        { visible: showEditCustomer, title: 'تعديل بيانات الزبون', onSave: handleEditCustomer, onClose: () => { setShowEditCustomer(false); setEditingCustomer(null); } },
      ].map(({ visible, title, onSave, onClose }) => (
        <Modal key={title} visible={visible} transparent animationType="slide" onRequestClose={onClose}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <TouchableOpacity style={s.overlay} onPress={onClose} />
            <View style={[s.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
              <View style={[s.handle, { backgroundColor: colors.border }]} />
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>{title}</Text>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>الاسم الكامل *</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="مثال: بلخضر حليم" placeholderTextColor={colors.mutedForeground}
                value={customerForm.name} onChangeText={v => setCustomerForm(p => ({ ...p, name: v }))}
                textAlign="right" autoFocus
              />
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>رقم الهاتف (اختياري)</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="05XXXXXXXX" placeholderTextColor={colors.mutedForeground}
                value={customerForm.phone} onChangeText={v => setCustomerForm(p => ({ ...p, phone: v }))}
                textAlign="right" keyboardType="phone-pad"
              />
              {isAdmin && (
                <>
                  <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>أقصى كريدي (دج) — اختياري</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="اتركه فارغاً للسماح بكريدي غير محدود"
                    placeholderTextColor={colors.mutedForeground}
                    value={customerForm.maxCredit}
                    onChangeText={v => setCustomerForm(p => ({ ...p, maxCredit: v }))}
                    textAlign="right"
                    keyboardType="decimal-pad"
                  />
                </>
              )}
              <TouchableOpacity style={s.saveBtn} onPress={onSave}>
                <LinearGradient colors={['#0EA5E9', '#0369A1']} style={s.saveBtnGrad}>
                  <Text style={s.saveBtnText}>حفظ</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ))}

      <ConfirmModal
        visible={!!deleteCustomer}
        title="حذف الزبون"
        message={`هل تريد حذف "${deleteCustomer?.name}"؟ سيتم حذف جميع عملياته.`}
        confirmLabel="حذف"
        onConfirm={handleDeleteCustomer}
        onCancel={() => setDeleteCustomer(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', color: '#fff', textAlign: 'right' },
  headerSub: { fontSize: 13, fontFamily: 'Changa_400Regular', color: 'rgba(255,255,255,0.85)', textAlign: 'right', marginTop: 2 },
  backBtn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10 },
  addBtn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10 },

  customerCard: { borderRadius: 16, padding: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardDanger: { borderColor: '#EF4444', borderWidth: 1.5 },
  cardWarning: { borderColor: '#F59E0B', borderWidth: 1.5 },
  customerAvatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 20, fontFamily: 'Changa_700Bold', color: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  customerName: { fontSize: 16, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  customerMeta: { fontSize: 13, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  blockedBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  blockedText: { fontSize: 11, fontFamily: 'Changa_600SemiBold', color: '#DC2626' },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  balanceText: { fontSize: 15, fontFamily: 'Changa_700Bold' },
  actionRow: { flexDirection: 'row', gap: 2 },
  iconBtn: { padding: 7 },

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
