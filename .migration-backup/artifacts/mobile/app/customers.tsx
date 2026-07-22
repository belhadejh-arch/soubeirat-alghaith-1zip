import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal,
  TextInput, Platform, KeyboardAvoidingView, ScrollView,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import ConfirmModal from '@/components/ConfirmModal';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import {
  customerFamiliesApi, customersApi, customerTransactionsApi,
} from '@/utils/api';
import { getCurrentDate, getCurrentTime } from '@/utils/helpers';
import type {
  CustomerFamily, Customer, CustomerTransaction, CustomerStats,
} from '@/types';

const DEBT_LIMIT = 10000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysSince(dateStr: string | null): number {
  if (!dateStr) return Infinity;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86400000);
}

function fmt(n: number) {
  return n.toLocaleString('fr-DZ') + ' دج';
}

function toDisplay(dateStr: string) {
  const p = dateStr.split('-');
  return `${p[2]}-${p[1]}-${p[0]}`;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CustomersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const bottomPad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;
  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;

  // ─── State ────────────────────────────────────────────────────────────────
  const [families, setFamilies] = useState<CustomerFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'families' | 'stats'>('families');

  // Family management
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [showEditFamily, setShowEditFamily] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [deleteFamily, setDeleteFamily] = useState<CustomerFamily | null>(null);

  // Customer list view
  const [selectedFamily, setSelectedFamily] = useState<CustomerFamily | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '' });
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);

  // Customer detail view
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [showAddTx, setShowAddTx] = useState<'debt' | 'payment' | null>(null);
  const [txAmount, setTxAmount] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [deleteTx, setDeleteTx] = useState<CustomerTransaction | null>(null);

  // Stats
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // ─── Load ─────────────────────────────────────────────────────────────────
  const loadFamilies = useCallback(async () => {
    try {
      const rows = await customerFamiliesApi.list();
      setFamilies(rows.map(r => ({
        ...r,
        memberCount: Number(r.memberCount),
        totalBalance: Number(r.totalBalance),
      })));
    } catch {
      showToast('تعذّر تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFamilies(); }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await loadFamilies();
    setRefreshing(false);
  }

  const loadCustomers = useCallback(async (familyId: string) => {
    setCustomersLoading(true);
    try {
      const rows = await customersApi.list(familyId);
      setCustomers(rows.map(r => ({
        ...r,
        status: r.status as 'active' | 'blocked',
        balance: Number(r.balance),
      })));
    } catch {
      showToast('تعذّر تحميل الزبائن', 'error');
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async (customerId: string) => {
    setTxLoading(true);
    try {
      const rows = await customerTransactionsApi.list(customerId);
      setTransactions(rows.map(r => ({
        ...r,
        type: r.type as 'debt' | 'payment',
        amount: Number(r.amount),
        balanceBefore: Number(r.balanceBefore),
        balanceAfter: Number(r.balanceAfter),
        userId: r.userId ?? null,
      })));
    } catch {
      showToast('تعذّر تحميل السجل', 'error');
    } finally {
      setTxLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await customersApi.getStats();
      setStats(s);
    } catch {
      showToast('تعذّر تحميل الإحصائيات', 'error');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeView === 'stats') loadStats();
  }, [activeView]);

  // ─── Filtered families ────────────────────────────────────────────────────
  const filteredFamilies = useMemo(() => {
    if (!searchQuery.trim()) return families;
    const q = searchQuery.toLowerCase();
    return families.filter(f => f.name.toLowerCase().includes(q));
  }, [families, searchQuery]);

  // ─── Family operations ────────────────────────────────────────────────────
  async function handleAddFamily() {
    if (!familyName.trim()) { showToast('أدخل اسم العائلة', 'error'); return; }
    try {
      const row = await customerFamiliesApi.create({ name: familyName.trim() });
      setFamilies(prev => [...prev, { ...row, memberCount: 0, totalBalance: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      showToast('تم إضافة العائلة', 'success');
      setFamilyName('');
      setShowAddFamily(false);
    } catch (err: any) {
      showToast(err?.code === 'duplicate_family' ? 'العائلة موجودة مسبقاً' : 'حدث خطأ', 'error');
    }
  }

  async function handleEditFamily() {
    if (!selectedFamily || !familyName.trim()) { showToast('أدخل اسم العائلة', 'error'); return; }
    try {
      const row = await customerFamiliesApi.update(selectedFamily.id, { name: familyName.trim() });
      setFamilies(prev => prev.map(f => f.id === selectedFamily.id
        ? { ...f, name: row.name } : f));
      setSelectedFamily(prev => prev ? { ...prev, name: row.name } : null);
      showToast('تم تحديث اسم العائلة', 'success');
      setFamilyName('');
      setShowEditFamily(false);
    } catch (err: any) {
      showToast(err?.code === 'duplicate_family' ? 'العائلة موجودة مسبقاً' : 'حدث خطأ', 'error');
    }
  }

  async function handleDeleteFamily() {
    if (!deleteFamily) return;
    const f = deleteFamily;
    setDeleteFamily(null);
    try {
      await customerFamiliesApi.remove(f.id);
      setFamilies(prev => prev.filter(x => x.id !== f.id));
      showToast('تم حذف العائلة', 'success');
    } catch {
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }

  function openFamily(f: CustomerFamily) {
    setSelectedFamily(f);
    loadCustomers(f.id);
  }

  function closeFamily() {
    setSelectedFamily(null);
    setCustomers([]);
    loadFamilies(); // refresh balances
  }

  // ─── Customer operations ──────────────────────────────────────────────────
  async function handleAddCustomer() {
    if (!selectedFamily) return;
    if (!customerForm.name.trim()) { showToast('أدخل اسم الزبون', 'error'); return; }
    try {
      const row = await customersApi.create({
        familyId: selectedFamily.id,
        familyName: selectedFamily.name,
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim(),
      });
      setCustomers(prev => [...prev, { ...row, status: row.status as 'active' | 'blocked', balance: Number(row.balance) }]);
      setFamilies(prev => prev.map(f => f.id === selectedFamily.id
        ? { ...f, memberCount: f.memberCount + 1 } : f));
      showToast('تم إضافة الزبون', 'success');
      setCustomerForm({ name: '', phone: '' });
      setShowAddCustomer(false);
    } catch {
      showToast('حدث خطأ', 'error');
    }
  }

  async function handleEditCustomer() {
    if (!editingCustomer) return;
    if (!customerForm.name.trim()) { showToast('أدخل اسم الزبون', 'error'); return; }
    try {
      const row = await customersApi.update(editingCustomer.id, {
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim(),
      });
      setCustomers(prev => prev.map(c => c.id === editingCustomer.id
        ? { ...c, name: row.name, phone: row.phone } : c));
      showToast('تم تحديث بيانات الزبون', 'success');
      setCustomerForm({ name: '', phone: '' });
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
      setFamilies(prev => prev.map(f => f.id === selectedFamily?.id
        ? { ...f, memberCount: Math.max(0, f.memberCount - 1), totalBalance: f.totalBalance - c.balance } : f));
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
      setSelectedCustomer(prev => prev?.id === c.id ? { ...prev, status: newStatus } : prev);
      showToast(newStatus === 'blocked' ? 'تم حظر الزبون' : 'تم إلغاء الحظر', 'success');
    } catch {
      showToast('حدث خطأ', 'error');
    }
  }

  function openCustomer(c: Customer) {
    setSelectedCustomer(c);
    loadTransactions(c.id);
  }

  function closeCustomer() {
    setSelectedCustomer(null);
    setTransactions([]);
    // Refresh customers to get updated balance
    if (selectedFamily) loadCustomers(selectedFamily.id);
  }

  // ─── Transaction operations ───────────────────────────────────────────────
  async function handleAddTransaction() {
    if (!showAddTx || !selectedCustomer) return;
    const amount = parseFloat(txAmount);
    if (!amount || amount <= 0) { showToast('أدخل مبلغاً صحيحاً', 'error'); return; }
    if (showAddTx === 'debt' && selectedCustomer.status === 'blocked') {
      showToast('الزبون محظور — لا يمكن إضافة دين', 'error');
      return;
    }

    try {
      const row = await customerTransactionsApi.create(selectedCustomer.id, {
        type: showAddTx,
        amount,
        description: txDesc.trim(),
        userId: currentUser?.id,
        userName: currentUser?.name ?? '',
        date: getCurrentDate(),
        time: getCurrentTime(),
      });

      const mapped: CustomerTransaction = {
        ...row,
        type: row.type as 'debt' | 'payment',
        amount: Number(row.amount),
        balanceBefore: Number(row.balanceBefore),
        balanceAfter: Number(row.balanceAfter),
        userId: row.userId ?? null,
      };
      setTransactions(prev => [mapped, ...prev]);

      // Update local customer balance
      const newBalance = mapped.balanceAfter;
      setSelectedCustomer(prev => prev ? { ...prev, balance: newBalance } : null);
      setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, balance: newBalance } : c));

      showToast(showAddTx === 'debt' ? 'تم تسجيل الدين' : 'تم تسجيل السداد', 'success');
      setTxAmount('');
      setTxDesc('');
      setShowAddTx(null);
    } catch (err: any) {
      showToast(err?.code === 'customer_blocked' ? 'الزبون محظور' : 'حدث خطأ', 'error');
    }
  }

  async function handleDeleteTransaction() {
    if (!deleteTx) return;
    const tx = deleteTx;
    setDeleteTx(null);
    try {
      await customerTransactionsApi.remove(tx.id);
      setTransactions(prev => prev.filter(t => t.id !== tx.id));
      // Refresh customer to get updated balance
      if (selectedCustomer) {
        const updatedCustomers = await customersApi.list(selectedFamily?.id);
        const updated = updatedCustomers.find(c => c.id === selectedCustomer.id);
        if (updated) {
          const newBal = Number(updated.balance);
          setSelectedCustomer(prev => prev ? { ...prev, balance: newBal } : null);
          setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, balance: newBal } : c));
        }
      }
      showToast('تم حذف العملية', 'success');
    } catch {
      showToast('حدث خطأ', 'error');
    }
  }

  // ─── PDF Export ───────────────────────────────────────────────────────────
  async function handleExportPDF() {
    if (!selectedCustomer) return;
    const c = selectedCustomer;
    const totalDebt = transactions.filter(t => t.type === 'debt').reduce((s, t) => s + t.amount, 0);
    const totalPaid = transactions.filter(t => t.type === 'payment').reduce((s, t) => s + t.amount, 0);

    const rows = transactions.map(t => `
      <tr>
        <td>${toDisplay(t.date)} ${t.time}</td>
        <td style="color:${t.type === 'debt' ? '#DC2626' : '#16A34A'}">${t.type === 'debt' ? 'دين' : 'سداد'}</td>
        <td>${t.description || '-'}</td>
        <td style="font-weight:bold;color:${t.type === 'debt' ? '#DC2626' : '#16A34A'}">${t.amount.toLocaleString()} دج</td>
        <td>${t.userName || '-'}</td>
        <td>${t.balanceAfter.toLocaleString()} دج</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; margin: 24px; direction: rtl; color: #111; }
  h1 { color: #0C4A6E; text-align: center; font-size: 22px; margin-bottom: 4px; }
  .subtitle { text-align: center; color: #64748B; margin-bottom: 20px; font-size: 13px; }
  .info-grid { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
  .info-box { background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 8px; padding: 12px 16px; flex: 1; min-width: 130px; }
  .info-label { font-size: 11px; color: #0369A1; margin-bottom: 4px; }
  .info-value { font-size: 18px; font-weight: bold; color: #0C4A6E; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 12px; }
  .active { background: #DCFCE7; color: #16A34A; }
  .blocked { background: #FEE2E2; color: #DC2626; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
  th { background: #0C4A6E; color: #fff; padding: 10px 8px; text-align: right; }
  td { padding: 8px; border-bottom: 1px solid #E2E8F0; }
  tr:nth-child(even) td { background: #F8FAFC; }
  .totals { margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap; }
  .total-card { border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 16px; flex: 1; min-width: 130px; }
  .footer { margin-top: 24px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #E2E8F0; padding-top: 12px; }
  @page { size: A4; margin: 20mm; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>🛒 سوبيرات الغيث — كشف حساب</h1>
<p class="subtitle">تاريخ الإصدار: ${toDisplay(getCurrentDate())}</p>
<div class="info-grid">
  <div class="info-box"><div class="info-label">اسم الزبون</div><div class="info-value">${c.name}</div></div>
  <div class="info-box"><div class="info-label">العائلة</div><div class="info-value">${c.familyName}</div></div>
  <div class="info-box"><div class="info-label">الرصيد الحالي</div><div class="info-value" style="color:${c.balance > 0 ? '#DC2626' : '#16A34A'}">${c.balance.toLocaleString()} دج</div></div>
  <div class="info-box"><div class="info-label">الحالة</div><div class="info-value"><span class="status-badge ${c.status}">${c.status === 'active' ? 'نشط' : 'محظور'}</span></div></div>
  <div class="info-box"><div class="info-label">رقم الهاتف</div><div class="info-value">${c.phone || '-'}</div></div>
  <div class="info-box"><div class="info-label">عدد العمليات</div><div class="info-value">${transactions.length}</div></div>
</div>
<table>
  <thead>
    <tr>
      <th>التاريخ والوقت</th>
      <th>النوع</th>
      <th>الوصف</th>
      <th>المبلغ</th>
      <th>الموظف</th>
      <th>الرصيد بعد العملية</th>
    </tr>
  </thead>
  <tbody>
    ${rows || '<tr><td colspan="6" style="text-align:center;color:#888">لا توجد عمليات</td></tr>'}
  </tbody>
</table>
<div class="totals">
  <div class="total-card"><div class="info-label">إجمالي الديون</div><div class="info-value" style="color:#DC2626">${totalDebt.toLocaleString()} دج</div></div>
  <div class="total-card"><div class="info-label">إجمالي المسدد</div><div class="info-value" style="color:#16A34A">${totalPaid.toLocaleString()} دج</div></div>
  <div class="total-card"><div class="info-label">الرصيد النهائي</div><div class="info-value" style="color:${c.balance > 0 ? '#DC2626' : '#16A34A'}">${c.balance.toLocaleString()} دج</div></div>
</div>
<p class="footer">سوبيرات الغيث — نظام إدارة الديون | صفحة 1</p>
</body>
</html>`;

    try {
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank', 'width=900,height=700');
        if (win) { win.document.write(html); win.document.close(); setTimeout(() => { win.focus(); win.print(); }, 500); }
        else {
          const a = document.createElement('a');
          a.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
          a.download = `كشف-حساب-${c.name}.html`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'كشف الحساب', UTI: 'com.adobe.pdf' });
      }
    } catch {
      showToast('تعذّر إنشاء ملف PDF', 'error');
    }
  }

  // ─── Customer card color ──────────────────────────────────────────────────
  function getCustomerCardStyle(c: Customer) {
    if (c.balance > DEBT_LIMIT) return { borderColor: '#EF4444', borderWidth: 1.5 };
    if (daysSince(c.lastPaymentDate) > 30 && c.balance > 0) return { borderColor: '#F59E0B', borderWidth: 1.5 };
    return {};
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={['#F97316', '#EA580C']} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>💳 ديون الزبائن</Text>
          <View style={styles.headerTabs}>
            <TouchableOpacity
              style={[styles.headerTab, activeView === 'families' && styles.headerTabActive]}
              onPress={() => setActiveView('families')}
            >
              <Text style={[styles.headerTabText, activeView === 'families' && styles.headerTabTextActive]}>العائلات</Text>
            </TouchableOpacity>
            {isAdmin && (
              <TouchableOpacity
                style={[styles.headerTab, activeView === 'stats' && styles.headerTabActive]}
                onPress={() => setActiveView('stats')}
              >
                <Text style={[styles.headerTabText, activeView === 'stats' && styles.headerTabTextActive]}>إحصائيات</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </LinearGradient>

      {/* ── Families View ─────────────────────────────────────────────────── */}
      {activeView === 'families' && (
        <>
          {/* Search */}
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="بحث عن عائلة..."
              placeholderTextColor={colors.mutedForeground}
              value={searchQuery}
              onChangeText={setSearchQuery}
              textAlign="right"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : null}
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredFamilies}
              keyExtractor={i => i.id}
              contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 100, gap: 10 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#F97316']} tintColor="#F97316" />}
              ListEmptyComponent={
                <EmptyState icon="users" title="لا توجد عائلات" subtitle="اضغط + لإضافة عائلة جديدة" />
              }
              renderItem={({ item: f }) => (
                <TouchableOpacity
                  style={[styles.familyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => openFamily(f)}
                  activeOpacity={0.8}
                >
                  <LinearGradient colors={['#F97316', '#EA580C']} style={styles.familyAvatar}>
                    <Text style={styles.familyAvatarText}>{f.name.charAt(0)}</Text>
                  </LinearGradient>
                  <View style={styles.familyInfo}>
                    <Text style={[styles.familyName, { color: colors.foreground }]}>{f.name}</Text>
                    <View style={styles.familyMeta}>
                      <Text style={[styles.familyMetaText, { color: colors.mutedForeground }]}>
                        <Feather name="users" size={11} /> {f.memberCount} فرد
                      </Text>
                      <Text style={[styles.familyBalance, { color: f.totalBalance > 0 ? '#DC2626' : '#16A34A' }]}>
                        {f.totalBalance > 0 ? fmt(f.totalBalance) : 'لا ديون'}
                      </Text>
                    </View>
                  </View>
                  {isAdmin && (
                    <View style={styles.familyActions}>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => { setFamilyName(f.name); setSelectedFamily(f); setShowEditFamily(true); }}
                      >
                        <Feather name="edit-2" size={15} color={colors.mutedForeground} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconBtn} onPress={() => setDeleteFamily(f)}>
                        <Feather name="trash-2" size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  )}
                  <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            />
          )}

          {isAdmin && (
            <TouchableOpacity style={[styles.fab, { bottom: bottomPad + 20 }]} onPress={() => { setFamilyName(''); setShowAddFamily(true); }}>
              <LinearGradient colors={['#F97316', '#EA580C']} style={styles.fabGrad}>
                <Feather name="plus" size={26} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ── Stats View ────────────────────────────────────────────────────── */}
      {activeView === 'stats' && isAdmin && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40, gap: 12 }}>
          {statsLoading ? (
            <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
          ) : stats ? (
            <>
              <View style={styles.statsGrid}>
                <StatsCard label="إجمالي الديون" value={fmt(stats.totalDebt)} color="#DC2626" bg="#FEE2E2" icon="trending-up" />
                <StatsCard label="عدد العائلات" value={String(stats.familyCount)} color="#0369A1" bg="#E0F2FE" icon="home" />
                <StatsCard label="عدد الزبائن" value={String(stats.customerCount)} color="#7C3AED" bg="#EDE9FE" icon="users" />
                <StatsCard label="المحظورون" value={String(stats.blockedCount)} color="#DC2626" bg="#FEE2E2" icon="slash" />
              </View>

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>🏆 أعلى 10 زبائن مديونية</Text>
              {stats.topCustomers.filter(c => c.balance > 0).map((c, i) => (
                <View key={c.customerId} style={[styles.rankRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.rankNum, { color: colors.mutedForeground }]}>#{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rankName, { color: colors.foreground }]}>{c.customerName}</Text>
                    <Text style={[styles.rankSub, { color: colors.mutedForeground }]}>{c.familyName}</Text>
                  </View>
                  <Text style={styles.rankBalance}>{fmt(c.balance)}</Text>
                </View>
              ))}

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>🏆 أعلى 10 عائلات مديونية</Text>
              {stats.topFamilies.filter(f => f.balance > 0).map((f, i) => (
                <View key={f.familyId} style={[styles.rankRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.rankNum, { color: colors.mutedForeground }]}>#{i + 1}</Text>
                  <Text style={[styles.rankName, { color: colors.foreground, flex: 1 }]}>{f.familyName}</Text>
                  <Text style={styles.rankBalance}>{fmt(f.balance)}</Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}

      {/* ── Customer List Modal ────────────────────────────────────────────── */}
      <Modal visible={!!selectedFamily && !selectedCustomer} transparent animationType="slide" onRequestClose={closeFamily}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={closeFamily} />
          <View style={[styles.sheetFull, { backgroundColor: colors.background, paddingBottom: bottomPad + 24 }]}>
            {/* Header */}
            <LinearGradient colors={['#F97316', '#EA580C']} style={styles.sheetHeader}>
              <View style={styles.sheetHeaderRow}>
                <TouchableOpacity onPress={closeFamily}><Feather name="x" size={22} color="#fff" /></TouchableOpacity>
                <Text style={styles.sheetHeaderTitle}>{selectedFamily?.name}</Text>
                {isAdmin && (
                  <TouchableOpacity onPress={() => { setCustomerForm({ name: '', phone: '' }); setShowAddCustomer(true); }}>
                    <Feather name="plus" size={22} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.sheetHeaderSub}>
                {selectedFamily?.memberCount} فرد • إجمالي الديون: {fmt(selectedFamily?.totalBalance ?? 0)}
              </Text>
            </LinearGradient>

            {customersLoading ? (
              <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
            ) : customers.length === 0 ? (
              <EmptyState icon="user" title="لا يوجد زبائن" subtitle="اضغط + لإضافة زبون" />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={{ padding: 16, gap: 10 }}>
                  {customers.map(c => {
                    const overLimit = c.balance > DEBT_LIMIT;
                    const overdue = daysSince(c.lastPaymentDate) > 30 && c.balance > 0;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.customerCard, { backgroundColor: colors.card, borderColor: colors.border }, getCustomerCardStyle(c)]}
                        onPress={() => openCustomer(c)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.customerCardLeft}>
                          <View style={[styles.customerAvatar, { backgroundColor: c.status === 'blocked' ? '#EF4444' : '#F97316' }]}>
                            <Text style={styles.customerAvatarText}>{c.name.charAt(0)}</Text>
                          </View>
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <View style={styles.customerNameRow}>
                            <Text style={[styles.customerName, { color: colors.foreground }]}>{c.name}</Text>
                            {c.status === 'blocked' && (
                              <View style={styles.blockedBadge}><Text style={styles.blockedBadgeText}>محظور</Text></View>
                            )}
                            {overLimit && <Feather name="alert-triangle" size={14} color="#EF4444" />}
                            {overdue && !overLimit && <Feather name="clock" size={14} color="#F59E0B" />}
                          </View>
                          {c.phone ? <Text style={[styles.customerPhone, { color: colors.mutedForeground }]}>{c.phone}</Text> : null}
                          {c.lastPaymentDate && (
                            <Text style={[styles.customerPhone, { color: colors.mutedForeground }]}>
                              آخر سداد: {toDisplay(c.lastPaymentDate)}
                            </Text>
                          )}
                        </View>
                        <View style={styles.customerRight}>
                          <Text style={[styles.customerBalance, { color: c.balance > 0 ? '#DC2626' : '#16A34A' }]}>
                            {c.balance > 0 ? fmt(c.balance) : '✅'}
                          </Text>
                          {isAdmin && (
                            <View style={styles.customerActions}>
                              <TouchableOpacity style={styles.iconBtn} onPress={() => {
                                setEditingCustomer(c);
                                setCustomerForm({ name: c.name, phone: c.phone });
                                setShowEditCustomer(true);
                              }}>
                                <Feather name="edit-2" size={13} color={colors.mutedForeground} />
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.iconBtn} onPress={() => handleToggleBlock(c)}>
                                <Feather name={c.status === 'blocked' ? 'unlock' : 'slash'} size={13} color={c.status === 'blocked' ? '#16A34A' : '#F59E0B'} />
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.iconBtn} onPress={() => setDeleteCustomer(c)}>
                                <Feather name="trash-2" size={13} color="#EF4444" />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Customer Detail Modal ─────────────────────────────────────────── */}
      <Modal visible={!!selectedCustomer} transparent animationType="slide" onRequestClose={closeCustomer}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={closeCustomer} />
          <View style={[styles.sheetFull, { backgroundColor: colors.background, paddingBottom: bottomPad + 24 }]}>
            {/* Header */}
            <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={styles.sheetHeader}>
              <View style={styles.sheetHeaderRow}>
                <TouchableOpacity onPress={closeCustomer}><Feather name="x" size={22} color="#fff" /></TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.sheetHeaderTitle}>{selectedCustomer?.name}</Text>
                  <Text style={styles.sheetHeaderSub}>{selectedCustomer?.familyName}</Text>
                </View>
                {isAdmin && selectedCustomer && (
                  <TouchableOpacity onPress={handleExportPDF} style={styles.pdfBtn}>
                    <Feather name="file-text" size={18} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.balanceRow}>
                <Text style={[styles.balanceLargeText, { color: (selectedCustomer?.balance ?? 0) > 0 ? '#FDE68A' : '#86EFAC' }]}>
                  {selectedCustomer ? fmt(selectedCustomer.balance) : '-'}
                </Text>
                <Text style={styles.balanceLabel}>
                  {(selectedCustomer?.balance ?? 0) === 0 ? '✅ مسوّى' : (selectedCustomer?.balance ?? 0) > 0 ? 'مستحق' : 'زائد'}
                </Text>
                {selectedCustomer?.status === 'blocked' && (
                  <View style={[styles.blockedBadge, { backgroundColor: '#EF444420', marginRight: 8 }]}>
                    <Text style={[styles.blockedBadgeText, { color: '#FCA5A5' }]}>محظور</Text>
                  </View>
                )}
              </View>
            </LinearGradient>

            {/* Action buttons */}
            <View style={styles.txBtns}>
              <TouchableOpacity
                style={[styles.txBtn, { backgroundColor: '#FEE2E2' }]}
                onPress={() => { setTxAmount(''); setTxDesc(''); setShowAddTx('debt'); }}
              >
                <Feather name="trending-up" size={18} color="#DC2626" />
                <Text style={[styles.txBtnText, { color: '#DC2626' }]}>إضافة دين</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.txBtn, { backgroundColor: '#DCFCE7' }]}
                onPress={() => { setTxAmount(''); setTxDesc(''); setShowAddTx('payment'); }}
              >
                <Feather name="check-circle" size={18} color="#16A34A" />
                <Text style={[styles.txBtnText, { color: '#16A34A' }]}>تسجيل سداد</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.historyTitle, { color: colors.foreground }]}>سجل العمليات ({transactions.length})</Text>

            {txLoading ? (
              <ActivityIndicator color="#0EA5E9" style={{ marginTop: 20 }} />
            ) : transactions.length === 0 ? (
              <Text style={[styles.emptyNote, { color: colors.mutedForeground }]}>لا توجد عمليات مسجلة</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {transactions.map(tx => (
                  <View key={tx.id} style={[styles.txRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <View style={[styles.txDot, { backgroundColor: tx.type === 'debt' ? '#EF4444' : '#22C55E' }]} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={styles.txTopRow}>
                        <Text style={[styles.txType, { color: tx.type === 'debt' ? '#DC2626' : '#16A34A' }]}>
                          {tx.type === 'debt' ? '➕ دين' : '💵 سداد'}
                        </Text>
                        <Text style={[styles.txAmount, { color: tx.type === 'debt' ? '#DC2626' : '#16A34A' }]}>
                          {tx.type === 'debt' ? '+' : '-'}{tx.amount.toLocaleString()} دج
                        </Text>
                      </View>
                      {tx.description ? <Text style={[styles.txDesc, { color: colors.foreground }]}>{tx.description}</Text> : null}
                      <View style={styles.txMetaRow}>
                        <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>{toDisplay(tx.date)} {tx.time}</Text>
                        {tx.userName ? <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>• {tx.userName}</Text> : null}
                      </View>
                      <View style={styles.txBalanceRow}>
                        <Text style={[styles.txBalanceMeta, { color: colors.mutedForeground }]}>
                          قبل: {tx.balanceBefore.toLocaleString()} → بعد: {tx.balanceAfter.toLocaleString()} دج
                        </Text>
                      </View>
                    </View>
                    {isAdmin && (
                      <TouchableOpacity style={styles.iconBtn} onPress={() => setDeleteTx(tx)}>
                        <Feather name="trash-2" size={14} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Add Transaction Modal ─────────────────────────────────────────── */}
      <Modal visible={!!showAddTx} transparent animationType="slide" onRequestClose={() => setShowAddTx(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={() => setShowAddTx(null)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              {showAddTx === 'debt' ? '➕ إضافة دين' : '💵 تسجيل سداد'}
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>المبلغ (دج) *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="0.00" placeholderTextColor={colors.mutedForeground}
              value={txAmount} onChangeText={setTxAmount} keyboardType="numeric" textAlign="right" autoFocus
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              {showAddTx === 'debt' ? 'الوصف (المنتجات أو سبب الدين)' : 'ملاحظة (اختياري)'}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder={showAddTx === 'debt' ? 'طماطم، زيت، سكر...' : 'ملاحظة...'} placeholderTextColor={colors.mutedForeground}
              value={txDesc} onChangeText={setTxDesc} textAlign="right"
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

      {/* ── Add/Edit Family Modals ────────────────────────────────────────── */}
      {[
        { visible: showAddFamily, title: 'إضافة عائلة', onSave: handleAddFamily, onClose: () => setShowAddFamily(false) },
        { visible: showEditFamily, title: 'تعديل اسم العائلة', onSave: handleEditFamily, onClose: () => setShowEditFamily(false) },
      ].map(({ visible, title, onSave, onClose }) => (
        <Modal key={title} visible={visible} transparent animationType="slide" onRequestClose={onClose}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <TouchableOpacity style={styles.overlay} onPress={onClose} />
            <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{title}</Text>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>اسم العائلة *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="مثال: بلقاسمي" placeholderTextColor={colors.mutedForeground}
                value={familyName} onChangeText={setFamilyName} textAlign="right" autoFocus
              />
              <TouchableOpacity style={styles.saveBtn} onPress={onSave}>
                <LinearGradient colors={['#F97316', '#EA580C']} style={styles.saveBtnGrad}>
                  <Text style={styles.saveBtnText}>حفظ</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ))}

      {/* ── Add/Edit Customer Modals ──────────────────────────────────────── */}
      {[
        { visible: showAddCustomer, title: 'إضافة زبون', onSave: handleAddCustomer, onClose: () => setShowAddCustomer(false) },
        { visible: showEditCustomer, title: 'تعديل بيانات الزبون', onSave: handleEditCustomer, onClose: () => { setShowEditCustomer(false); setEditingCustomer(null); } },
      ].map(({ visible, title, onSave, onClose }) => (
        <Modal key={title} visible={visible} transparent animationType="slide" onRequestClose={onClose}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <TouchableOpacity style={styles.overlay} onPress={onClose} />
            <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{title}</Text>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>الاسم الكامل *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="مثال: بلخضر حليم" placeholderTextColor={colors.mutedForeground}
                value={customerForm.name} onChangeText={v => setCustomerForm(p => ({ ...p, name: v }))} textAlign="right" autoFocus
              />
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>رقم الهاتف (اختياري)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="05XXXXXXXX" placeholderTextColor={colors.mutedForeground}
                value={customerForm.phone} onChangeText={v => setCustomerForm(p => ({ ...p, phone: v }))} textAlign="right" keyboardType="phone-pad"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={onSave}>
                <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.saveBtnGrad}>
                  <Text style={styles.saveBtnText}>حفظ</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ))}

      {/* ── Confirm Modals ────────────────────────────────────────────────── */}
      <ConfirmModal
        visible={!!deleteFamily}
        title="حذف العائلة"
        message={`هل تريد حذف عائلة "${deleteFamily?.name}"؟ سيتم حذف جميع الزبائن وعملياتهم.`}
        confirmLabel="حذف"
        onConfirm={handleDeleteFamily}
        onCancel={() => setDeleteFamily(null)}
      />
      <ConfirmModal
        visible={!!deleteCustomer}
        title="حذف الزبون"
        message={`هل تريد حذف "${deleteCustomer?.name}"؟ سيتم حذف جميع عملياته.`}
        confirmLabel="حذف"
        onConfirm={handleDeleteCustomer}
        onCancel={() => setDeleteCustomer(null)}
      />
      <ConfirmModal
        visible={!!deleteTx}
        title="حذف العملية"
        message={`هل تريد حذف هذه العملية؟ سيتم تعديل رصيد الزبون تلقائياً.`}
        confirmLabel="حذف"
        onConfirm={handleDeleteTransaction}
        onCancel={() => setDeleteTx(null)}
      />
    </View>
  );
}

// ─── Stats Card Component ─────────────────────────────────────────────────────
function StatsCard({ label, value, color, bg, icon }: {
  label: string; value: string; color: string; bg: string;
  icon: keyof typeof Feather.glyphMap;
}) {
  return (
    <View style={[statsStyles.card, { backgroundColor: bg, borderColor: color + '40' }]}>
      <Feather name={icon} size={20} color={color} />
      <Text style={[statsStyles.value, { color }]}>{value}</Text>
      <Text style={statsStyles.label}>{label}</Text>
    </View>
  );
}

const statsStyles = StyleSheet.create({
  card: { flex: 1, minWidth: '45%', borderRadius: 12, padding: 14, gap: 4, borderWidth: 1, alignItems: 'flex-end' },
  value: { fontSize: 18, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  label: { fontSize: 11, fontFamily: 'Changa_400Regular', color: '#64748B', textAlign: 'right' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerTitle: { fontSize: 18, fontFamily: 'Changa_700Bold', color: '#fff' },
  headerTabs: { flexDirection: 'row', gap: 8 },
  headerTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerTabActive: { backgroundColor: '#fff' },
  headerTabText: { fontSize: 13, fontFamily: 'Changa_500Medium', color: 'rgba(255,255,255,0.85)' },
  headerTabTextActive: { color: '#F97316' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginVertical: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Changa_400Regular' },
  fab: { position: 'absolute', left: 20, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 4 },
  fabGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  familyCard: { borderRadius: 14, padding: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  familyAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  familyAvatarText: { fontSize: 20, fontFamily: 'Changa_700Bold', color: '#fff' },
  familyInfo: { flex: 1, gap: 3 },
  familyName: { fontSize: 16, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  familyMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  familyMetaText: { fontSize: 12, fontFamily: 'Changa_400Regular' },
  familyBalance: { fontSize: 13, fontFamily: 'Changa_600SemiBold' },
  familyActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetFull: { flex: 1, marginTop: 60, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheetHeader: { padding: 20, paddingTop: 24, gap: 4 },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetHeaderTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', color: '#fff', textAlign: 'right' },
  sheetHeaderSub: { fontSize: 13, fontFamily: 'Changa_400Regular', color: 'rgba(255,255,255,0.8)', textAlign: 'right' },
  pdfBtn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, justifyContent: 'flex-end' },
  balanceLargeText: { fontSize: 22, fontFamily: 'Changa_700Bold' },
  balanceLabel: { fontSize: 14, fontFamily: 'Changa_500Medium', color: 'rgba(255,255,255,0.75)' },
  customerCard: { borderRadius: 14, padding: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  customerCardLeft: { flexShrink: 0 },
  customerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  customerAvatarText: { fontSize: 16, fontFamily: 'Changa_700Bold', color: '#fff' },
  customerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  customerName: { fontSize: 15, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  customerPhone: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  customerRight: { alignItems: 'flex-end', gap: 4 },
  customerBalance: { fontSize: 14, fontFamily: 'Changa_700Bold' },
  customerActions: { flexDirection: 'row', gap: 4 },
  blockedBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  blockedBadgeText: { fontSize: 10, fontFamily: 'Changa_600SemiBold', color: '#DC2626' },
  txBtns: { flexDirection: 'row', gap: 12, padding: 16 },
  txBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14 },
  txBtnText: { fontSize: 15, fontFamily: 'Changa_600SemiBold' },
  historyTitle: { fontSize: 15, fontFamily: 'Changa_600SemiBold', textAlign: 'right', paddingHorizontal: 16, marginBottom: 4 },
  emptyNote: { textAlign: 'center', fontFamily: 'Changa_400Regular', fontSize: 14, paddingVertical: 30 },
  txRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 12, borderWidth: 1 },
  txDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  txTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txType: { fontSize: 14, fontFamily: 'Changa_500Medium' },
  txAmount: { fontSize: 15, fontFamily: 'Changa_700Bold' },
  txDesc: { fontSize: 13, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  txMetaRow: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end' },
  txMeta: { fontSize: 11, fontFamily: 'Changa_400Regular' },
  txBalanceRow: { justifyContent: 'flex-end' },
  txBalanceMeta: { fontSize: 10, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  sheetTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  fieldLabel: { fontSize: 13, fontFamily: 'Changa_500Medium', textAlign: 'right' },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15, fontFamily: 'Changa_400Regular' },
  saveBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  saveBtnGrad: { padding: 16, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontFamily: 'Changa_600SemiBold', color: '#fff' },
  sectionTitle: { fontSize: 16, fontFamily: 'Changa_700Bold', textAlign: 'right', marginTop: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  rankRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 10 },
  rankNum: { fontSize: 14, fontFamily: 'Changa_700Bold', width: 28 },
  rankName: { fontSize: 14, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  rankSub: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  rankBalance: { fontSize: 14, fontFamily: 'Changa_700Bold', color: '#DC2626' },
});
