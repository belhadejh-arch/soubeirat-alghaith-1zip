import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, Platform, KeyboardAvoidingView, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import ConfirmModal from '@/components/ConfirmModal';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { customersApi, customerTransactionsApi } from '@/utils/api';
import { getCurrentDate, getCurrentTime } from '@/utils/helpers';
import type { CustomerTransaction } from '@/types';

function fmt(n: number) { return n.toLocaleString('fr-DZ') + ' دج'; }
function toDisplay(dateStr: string) { const p = dateStr.split('-'); return `${p[2]}-${p[1]}-${p[0]}`; }

export default function CustomerDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{
    familyId: string; customerId: string; customerName: string; familyName: string;
    balance: string; status: string; phone: string;
  }>();

  const customerId = params.customerId;
  const familyId = params.familyId;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;

  // ─── Local state (reflects live updates) ──────────────────────────────────
  const [customerName, setCustomerName] = useState(params.customerName ?? '');
  const [familyName] = useState(params.familyName ?? '');
  const [balance, setBalance] = useState(Number(params.balance ?? 0));
  const [status, setStatus] = useState<'active' | 'blocked'>((params.status as 'active' | 'blocked') ?? 'active');

  // Transactions
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [showAddTx, setShowAddTx] = useState<'debt' | 'payment' | null>(null);
  const [txAmount, setTxAmount] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [deleteTx, setDeleteTx] = useState<CustomerTransaction | null>(null);

  // ─── Load ─────────────────────────────────────────────────────────────────
  const loadTransactions = useCallback(async () => {
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
  }, [customerId]);

  useEffect(() => { loadTransactions(); }, []);

  // ─── Add transaction ──────────────────────────────────────────────────────
  async function handleAddTransaction() {
    if (!showAddTx) return;
    const amount = parseFloat(txAmount);
    if (!amount || amount <= 0) { showToast('أدخل مبلغاً صحيحاً', 'error'); return; }
    if (showAddTx === 'debt' && status === 'blocked') {
      showToast('الزبون محظور — لا يمكن إضافة دين', 'error'); return;
    }
    try {
      const row = await customerTransactionsApi.create(customerId, {
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
      setBalance(mapped.balanceAfter);
      showToast(showAddTx === 'debt' ? 'تم تسجيل الدين' : 'تم تسجيل السداد', 'success');
      setTxAmount('');
      setTxDesc('');
      setShowAddTx(null);
    } catch (err: any) {
      showToast(err?.code === 'customer_blocked' ? 'الزبون محظور' : 'حدث خطأ', 'error');
    }
  }

  // ─── Delete transaction ───────────────────────────────────────────────────
  async function handleDeleteTransaction() {
    if (!deleteTx) return;
    const tx = deleteTx;
    setDeleteTx(null);
    try {
      await customerTransactionsApi.remove(tx.id);
      setTransactions(prev => prev.filter(t => t.id !== tx.id));
      // Refresh balance from server
      const rows = await customersApi.list(familyId);
      const updated = rows.find(c => c.id === customerId);
      if (updated) setBalance(Number(updated.balance));
      showToast('تم حذف العملية', 'success');
    } catch {
      showToast('حدث خطأ', 'error');
    }
  }

  // ─── Toggle block ─────────────────────────────────────────────────────────
  async function handleToggleBlock() {
    try {
      const row = await customersApi.toggleBlock(customerId);
      const newStatus = row.status as 'active' | 'blocked';
      setStatus(newStatus);
      showToast(newStatus === 'blocked' ? 'تم حظر الزبون' : 'تم إلغاء الحظر', 'success');
    } catch {
      showToast('حدث خطأ', 'error');
    }
  }

  // ─── PDF Export ───────────────────────────────────────────────────────────
  async function handleExportPDF() {
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
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
<style>
  body{font-family:Arial,sans-serif;margin:24px;direction:rtl;color:#111}
  h1{color:#0C4A6E;text-align:center;font-size:22px;margin-bottom:4px}
  .sub{text-align:center;color:#64748B;margin-bottom:20px;font-size:13px}
  .grid{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px}
  .box{background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:12px 16px;flex:1;min-width:130px}
  .lbl{font-size:11px;color:#0369A1;margin-bottom:4px}
  .val{font-size:18px;font-weight:bold;color:#0C4A6E}
  table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
  th{background:#0C4A6E;color:#fff;padding:10px 8px;text-align:right}
  td{padding:8px;border-bottom:1px solid #E2E8F0}
  tr:nth-child(even) td{background:#F8FAFC}
  .totals{margin-top:20px;display:flex;gap:12px;flex-wrap:wrap}
  .tc{border:1px solid #E2E8F0;border-radius:8px;padding:12px 16px;flex:1;min-width:130px}
  .footer{margin-top:24px;text-align:center;font-size:11px;color:#999;border-top:1px solid #E2E8F0;padding-top:12px}
  @page{size:A4;margin:20mm}
</style></head><body>
<h1>🛒 سوبيرات الغيث — كشف حساب</h1>
<p class="sub">تاريخ الإصدار: ${toDisplay(getCurrentDate())}</p>
<div class="grid">
  <div class="box"><div class="lbl">اسم الزبون</div><div class="val">${customerName}</div></div>
  <div class="box"><div class="lbl">العائلة</div><div class="val">${familyName}</div></div>
  <div class="box"><div class="lbl">الرصيد الحالي</div><div class="val" style="color:${balance>0?'#DC2626':'#16A34A'}">${balance.toLocaleString()} دج</div></div>
  <div class="box"><div class="lbl">الحالة</div><div class="val">${status === 'active' ? 'نشط' : 'محظور'}</div></div>
</div>
<table>
  <thead><tr><th>التاريخ والوقت</th><th>النوع</th><th>الوصف</th><th>المبلغ</th><th>الموظف</th><th>الرصيد بعد</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#888">لا توجد عمليات</td></tr>'}</tbody>
</table>
<div class="totals">
  <div class="tc"><div class="lbl">إجمالي الديون</div><div class="val" style="color:#DC2626">${totalDebt.toLocaleString()} دج</div></div>
  <div class="tc"><div class="lbl">إجمالي المسدد</div><div class="val" style="color:#16A34A">${totalPaid.toLocaleString()} دج</div></div>
  <div class="tc"><div class="lbl">الرصيد النهائي</div><div class="val" style="color:${balance>0?'#DC2626':'#16A34A'}">${balance.toLocaleString()} دج</div></div>
</div>
<p class="footer">سوبيرات الغيث — نظام إدارة الديون</p>
</body></html>`;
    try {
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank', 'width=900,height=700');
        if (win) { win.document.write(html); win.document.close(); setTimeout(() => { win.focus(); win.print(); }, 500); }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'كشف الحساب', UTI: 'com.adobe.pdf' });
      }
    } catch { showToast('تعذّر إنشاء ملف PDF', 'error'); }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={[s.header, { paddingTop: topPad + 8 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-right" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={s.headerTitle}>{customerName}</Text>
            <Text style={s.headerSub}>{familyName}</Text>
          </View>
          <View style={s.headerActions}>
            {isAdmin && (
              <TouchableOpacity style={s.iconHeaderBtn} onPress={handleToggleBlock}>
                <Feather name={status === 'blocked' ? 'unlock' : 'slash'} size={18} color="#fff" />
              </TouchableOpacity>
            )}
            {isAdmin && (
              <TouchableOpacity style={s.iconHeaderBtn} onPress={handleExportPDF}>
                <Feather name="file-text" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Balance */}
        <View style={s.balanceRow}>
          {status === 'blocked' && (
            <View style={s.blockedBadge}><Text style={s.blockedText}>محظور</Text></View>
          )}
          <Text style={s.balanceLabel}>
            {balance === 0 ? '✅ مسوّى' : balance > 0 ? 'مستحق' : 'زائد'}
          </Text>
          <Text style={[s.balanceAmount, { color: balance > 0 ? '#FDE68A' : '#86EFAC' }]}>
            {fmt(balance)}
          </Text>
        </View>
      </LinearGradient>

      {/* Action Buttons */}
      <View style={s.actionBtns}>
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: '#FEE2E2' }]}
          onPress={() => { setTxAmount(''); setTxDesc(''); setShowAddTx('debt'); }}
        >
          <Feather name="trending-up" size={20} color="#DC2626" />
          <Text style={[s.actionBtnText, { color: '#DC2626' }]}>إضافة دين</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: '#DCFCE7' }]}
          onPress={() => { setTxAmount(''); setTxDesc(''); setShowAddTx('payment'); }}
        >
          <Feather name="check-circle" size={20} color="#16A34A" />
          <Text style={[s.actionBtnText, { color: '#16A34A' }]}>تسجيل سداد</Text>
        </TouchableOpacity>
      </View>

      {/* Transaction History */}
      <View style={s.historyHeader}>
        <Text style={[s.historyTitle, { color: colors.foreground }]}>
          سجل العمليات ({transactions.length})
        </Text>
      </View>

      {txLoading ? (
        <ActivityIndicator color="#0EA5E9" style={{ marginTop: 40 }} size="large" />
      ) : transactions.length === 0 ? (
        <View style={{ alignItems: 'center', marginTop: 60 }}>
          <Feather name="inbox" size={48} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>لا توجد عمليات مسجلة</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40, gap: 12 }}
        >
          {transactions.map(tx => (
            <View
              key={tx.id}
              style={[s.txCard, { backgroundColor: colors.card, borderColor: tx.type === 'debt' ? '#FCA5A520' : '#86EFAC20' }]}
            >
              {/* Type dot */}
              <View style={[s.txDot, { backgroundColor: tx.type === 'debt' ? '#EF4444' : '#22C55E' }]} />

              <View style={{ flex: 1, gap: 6 }}>
                {/* Top row */}
                <View style={s.txTopRow}>
                  <Text style={[s.txType, { color: tx.type === 'debt' ? '#DC2626' : '#16A34A' }]}>
                    {tx.type === 'debt' ? '➕ دين' : '💵 سداد'}
                  </Text>
                  <Text style={[s.txAmount, { color: tx.type === 'debt' ? '#DC2626' : '#16A34A' }]}>
                    {tx.type === 'debt' ? '+' : '−'}{tx.amount.toLocaleString()} دج
                  </Text>
                </View>

                {/* Description */}
                {tx.description ? (
                  <Text style={[s.txDesc, { color: colors.foreground }]}>{tx.description}</Text>
                ) : null}

                {/* Meta */}
                <View style={s.txMetaRow}>
                  <Text style={[s.txMeta, { color: colors.mutedForeground }]}>
                    {toDisplay(tx.date)} • {tx.time}
                  </Text>
                  {tx.userName ? (
                    <Text style={[s.txMeta, { color: colors.mutedForeground }]}>• {tx.userName}</Text>
                  ) : null}
                </View>

                {/* Balance change */}
                <View style={[s.txBalanceWrap, { backgroundColor: colors.background }]}>
                  <Text style={[s.txBalanceMeta, { color: colors.mutedForeground }]}>
                    قبل: {tx.balanceBefore.toLocaleString()} دج ← بعد: {tx.balanceAfter.toLocaleString()} دج
                  </Text>
                </View>
              </View>

              {isAdmin && (
                <TouchableOpacity style={s.deleteTxBtn} onPress={() => setDeleteTx(tx)}>
                  <Feather name="trash-2" size={15} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Add Transaction Modal ─────────────────────────────────────────── */}
      <Modal visible={!!showAddTx} transparent animationType="slide" onRequestClose={() => setShowAddTx(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={s.overlay} onPress={() => setShowAddTx(null)} />
          <View style={[s.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />
            <Text style={[s.sheetTitle, { color: colors.foreground }]}>
              {showAddTx === 'debt' ? '➕ إضافة دين' : '💵 تسجيل سداد'}
            </Text>
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>المبلغ (دج) *</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="0.00" placeholderTextColor={colors.mutedForeground}
              value={txAmount} onChangeText={setTxAmount} keyboardType="numeric" textAlign="right" autoFocus
            />
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>
              {showAddTx === 'debt' ? 'الوصف (المنتجات أو سبب الدين)' : 'ملاحظة (اختياري)'}
            </Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder={showAddTx === 'debt' ? 'طماطم، زيت، سكر...' : 'ملاحظة...'}
              placeholderTextColor={colors.mutedForeground}
              value={txDesc} onChangeText={setTxDesc} textAlign="right"
            />
            <TouchableOpacity style={s.saveBtn} onPress={handleAddTransaction}>
              <LinearGradient
                colors={showAddTx === 'debt' ? ['#EF4444', '#DC2626'] : ['#22C55E', '#16A34A']}
                style={s.saveBtnGrad}
              >
                <Text style={s.saveBtnText}>
                  {showAddTx === 'debt' ? 'تسجيل الدين' : 'تسجيل السداد'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        visible={!!deleteTx}
        title="حذف العملية"
        message="هل تريد حذف هذه العملية؟ سيتم تعديل رصيد الزبون تلقائياً."
        confirmLabel="حذف"
        onConfirm={handleDeleteTransaction}
        onCancel={() => setDeleteTx(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', color: '#fff', textAlign: 'right' },
  headerSub: { fontSize: 13, fontFamily: 'Changa_400Regular', color: 'rgba(255,255,255,0.8)', textAlign: 'right', marginTop: 2 },
  backBtn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconHeaderBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  balanceAmount: { fontSize: 26, fontFamily: 'Changa_700Bold' },
  balanceLabel: { fontSize: 14, fontFamily: 'Changa_500Medium', color: 'rgba(255,255,255,0.75)' },
  blockedBadge: { backgroundColor: 'rgba(239,68,68,0.25)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  blockedText: { fontSize: 12, fontFamily: 'Changa_600SemiBold', color: '#FCA5A5' },

  actionBtns: { flexDirection: 'row', gap: 12, padding: 16 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14 },
  actionBtnText: { fontSize: 15, fontFamily: 'Changa_600SemiBold' },

  historyHeader: { paddingHorizontal: 16, paddingBottom: 8 },
  historyTitle: { fontSize: 15, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  emptyText: { fontSize: 15, fontFamily: 'Changa_400Regular', marginTop: 12 },

  txCard: { borderRadius: 14, padding: 14, borderWidth: 1.5, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  txDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, flexShrink: 0 },
  txTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txType: { fontSize: 14, fontFamily: 'Changa_600SemiBold' },
  txAmount: { fontSize: 16, fontFamily: 'Changa_700Bold' },
  txDesc: { fontSize: 14, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  txMetaRow: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end' },
  txMeta: { fontSize: 12, fontFamily: 'Changa_400Regular' },
  txBalanceWrap: { borderRadius: 8, padding: 8, marginTop: 2 },
  txBalanceMeta: { fontSize: 11, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  deleteTxBtn: { padding: 8, flexShrink: 0 },

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
