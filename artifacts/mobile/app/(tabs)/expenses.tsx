import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal,
  TextInput, Platform, KeyboardAvoidingView, RefreshControl, Alert,
} from 'react-native';
import ConfirmModal from '@/components/ConfirmModal';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { Supplier } from '@/types';
import { getCurrentDate, getCurrentTime } from '@/utils/helpers';

// ─── Constants ────────────────────────────────────────────────────────────────
type PeriodKey =
  | 'today' | 'yesterday' | '7days' | '30days'
  | 'thisMonth' | 'lastMonth' | 'thisYear' | 'all' | 'custom';

const PERIOD_LABELS: Record<PeriodKey, string> = {
  today:     'اليوم',
  yesterday: 'أمس',
  '7days':   'آخر 7 أيام',
  '30days':  'آخر 30 يوماً',
  thisMonth: 'هذا الشهر',
  lastMonth: 'الشهر الماضي',
  thisYear:  'هذه السنة',
  all:       'جميع البيانات',
  custom:    'تاريخ مخصص',
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toDisplay(date: string): string {
  const parts = date.split('-');
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getPeriodRange(key: PeriodKey, customFrom?: string, customTo?: string): { from: string; to: string } {
  const now = new Date();
  const today = isoDate(now);

  if (key === 'today')     return { from: today, to: today };
  if (key === 'custom')    return { from: customFrom ?? today, to: customTo ?? today };

  if (key === 'yesterday') {
    const d = new Date(now); d.setDate(d.getDate() - 1);
    const y = isoDate(d);
    return { from: y, to: y };
  }
  if (key === '7days') {
    const d = new Date(now); d.setDate(d.getDate() - 6);
    return { from: isoDate(d), to: today };
  }
  if (key === '30days') {
    const d = new Date(now); d.setDate(d.getDate() - 29);
    return { from: isoDate(d), to: today };
  }
  if (key === 'thisMonth') {
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: today };
  }
  if (key === 'lastMonth') {
    const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const m = now.getMonth() === 0 ? 12 : now.getMonth();
    const lastDay = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, '0');
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${lastDay}` };
  }
  if (key === 'thisYear') {
    return { from: `${now.getFullYear()}-01-01`, to: today };
  }
  // all
  return { from: '2000-01-01', to: '2099-12-31' };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ExpensesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const {
    expenses, incomes, suppliers,
    addExpense, deleteExpense, deleteDay,
    closeDay, getTodayIncome, getTodayExpenses,
    refresh,
  } = useData();
  const { showToast } = useToast();

  // ─── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'records' | 'stats'>('records');

  // ─── Records tab state ─────────────────────────────────────────────────────
  const [showAdd, setShowAdd]           = useState(false);
  const [showCloseDay, setShowCloseDay] = useState(false);
  const [fabOpen, setFabOpen]           = useState(false);
  const [form, setForm]                 = useState({ amount: '', source: 'cash' as 'cash' | 'fund', description: '', supplierId: '', supplierName: '' });
  const [actualCashInput, setActualCashInput] = useState('');
  const [actualFundInput, setActualFundInput] = useState('');
  const [refreshing, setRefreshing]     = useState(false);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [deleteDayDate, setDeleteDayDate]     = useState<string | null>(null);

  // ─── Stats tab state ───────────────────────────────────────────────────────
  const [period, setPeriod]         = useState<PeriodKey>('thisMonth');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);

  const topPad    = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + 60 + insets.bottom : 60 + insets.bottom;

  const isAdmin  = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const canViewIncomes = currentUser?.role !== 'worker';
  const todayStr = getCurrentDate();

  // ─── Day groups for Records tab ────────────────────────────────────────────
  const dayGroups = useMemo(() => {
    const dateSet = new Set<string>([
      ...expenses.map(e => e.date),
      ...(canViewIncomes ? incomes.map(i => i.date) : []),
    ]);
    return Array.from(dateSet).sort((a, b) => b.localeCompare(a));
  }, [expenses, incomes, canViewIncomes]);

  // ─── Statistics computation ────────────────────────────────────────────────
  const stats = useMemo(() => {
    const { from, to } = getPeriodRange(period, customFrom, customTo);

    const filteredExp = expenses.filter(e => e.date >= from && e.date <= to);
    const filteredInc = canViewIncomes
      ? incomes.filter(i => i.date >= from && i.date <= to)
      : [];

    const dateSet = new Set<string>([
      ...filteredExp.map(e => e.date),
      ...filteredInc.map(i => i.date),
    ]);
    const dates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));

    const dayStats = dates.map(date => {
      const dayIncome = filteredInc.find(i => i.date === date);
      const dayInc = dayIncome?.amount ?? 0;
      const cashExpenses = filteredExp
        .filter(e => e.date === date && e.source === 'cash')
        .reduce((s, e) => s + e.amount, 0);
      const fundExpenses = filteredExp
        .filter(e => e.date === date && e.source === 'fund')
        .reduce((s, e) => s + e.amount, 0);
      const unclassifiedExpenses = filteredExp
        .filter(e => e.date === date && e.source === 'unknown')
        .reduce((s, e) => s + e.amount, 0);
      return {
        date,
        income: Number(dayInc),
        cashExpenses,
        expenses: cashExpenses,
        fundExpenses,
        unclassifiedExpenses,
        totalExpenses: cashExpenses + fundExpenses + unclassifiedExpenses,
        net: Number(dayInc) - cashExpenses - fundExpenses - unclassifiedExpenses,
        actualCash: dayIncome?.actualCash ?? null,
        fundBalance: dayIncome?.fundBalance ?? null,
      };
    });

    const totalIncome   = dayStats.reduce((s, d) => s + d.income, 0);
    const totalExpenses = dayStats.reduce((s, d) => s + d.totalExpenses, 0);
    const netProfit     = totalIncome - totalExpenses;
    const daysWithData  = dayStats.length;
    const avgIncome     = daysWithData > 0 ? totalIncome / daysWithData : 0;
    const avgExpenses   = daysWithData > 0 ? totalExpenses / daysWithData : 0;

    let bestIncomeDay  = '';
    let bestExpDay     = '';
    let maxInc         = -1;
    let maxExp         = -1;
    for (const d of dayStats) {
      if (d.income > maxInc)   { maxInc = d.income;   bestIncomeDay = d.date; }
      if (d.expenses > maxExp) { maxExp = d.expenses; bestExpDay    = d.date; }
    }

    return { totalIncome, totalExpenses, netProfit, daysWithData, avgIncome, avgExpenses, bestIncomeDay, bestExpDay, dayStats, from, to };
  }, [expenses, incomes, canViewIncomes, period, customFrom, customTo]);

  // ─── Refresh ───────────────────────────────────────────────────────────────
  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  // ─── Add expense ───────────────────────────────────────────────────────────
  function openAddExpense() {
    setFabOpen(false);
    setForm({ amount: '', source: 'cash', description: '', supplierId: '', supplierName: '' });
    setShowAdd(true);
  }
  function openCloseDay() {
    setFabOpen(false);
    setActualCashInput('');
    setActualFundInput('');
    setShowCloseDay(true);
  }

  async function handleAddExpense() {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { showToast('أدخل مبلغاً صحيحاً', 'error'); return; }
    if (!form.description.trim()) { showToast('أدخل وصف المصروف', 'error'); return; }
    const supplierDebt = form.supplierId
      ? { supplierId: form.supplierId, supplierName: form.supplierName }
      : undefined;
    await addExpense(
      { amount, source: form.source, description: form.description.trim(), date: getCurrentDate(), time: getCurrentTime(), userId: currentUser?.id ?? '', userName: currentUser?.name ?? '' },
      supplierDebt,
    );
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast(supplierDebt ? `تمت الإضافة وخُصم من ${supplierDebt.supplierName}` : 'تمت إضافة المصروف', 'success');
     setForm({ amount: '', source: 'cash', description: '', supplierId: '', supplierName: '' });
    setShowAdd(false);
  }

  async function handleCloseDay() {
    const amount = parseFloat(actualCashInput);
    const fundAmount = parseFloat(actualFundInput);
    if (isNaN(amount) || amount < 0) { showToast('أدخل مبلغ النقد الموجود فعلياً', 'error'); return; }
    if (isNaN(fundAmount) || fundAmount < 0) { showToast('أدخل مبلغ الصندوق الموجود فعلياً', 'error'); return; }
    try {
      await closeDay(amount, fundAmount, getCurrentDate());
      showToast('تم إغلاق اليوم وحساب الروسات تلقائياً', 'success');
      setActualCashInput('');
      setActualFundInput('');
      setShowCloseDay(false);
    } catch {
      showToast('تعذّر إغلاق اليوم', 'error');
    }
  }

  async function handleConfirmDeleteExpense() {
    if (!deleteExpenseId) return;
    const id = deleteExpenseId;
    setDeleteExpenseId(null);
    try {
      await deleteExpense(id);
      showToast('تم حذف المصروف', 'success');
    } catch {
      showToast('تعذّر الحذف', 'error');
    }
  }

  async function handleConfirmDeleteDay() {
    if (!deleteDayDate) return;
    const date = deleteDayDate;
    setDeleteDayDate(null);
    try {
      await deleteDay(date);
      showToast('تم حذف بيانات اليوم', 'success');
    } catch {
      showToast('تعذّر الحذف', 'error');
    }
  }

  // ─── Shared: build the report HTML ────────────────────────────────────────
  function buildReportHtml(): string {
    const { totalIncome, totalExpenses, netProfit, daysWithData, avgIncome, avgExpenses, bestIncomeDay, bestExpDay, dayStats, from, to } = stats;
    const periodLabel = period === 'custom'
      ? `${toDisplay(from)} — ${toDisplay(to)}`
      : PERIOD_LABELS[period];

    const rows = dayStats.map(d => `
      <tr>
        <td>${toDisplay(d.date)}</td>
        <td>${d.income.toLocaleString()} دج</td>
        <td>${d.expenses.toLocaleString()} دج</td>
        <td style="color:${d.net >= 0 ? '#15803D' : '#B91C1C'}">${d.net.toLocaleString()} دج</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; margin: 24px; color: #111; direction: rtl; }
  h1 { color: #0C4A6E; text-align: center; }
  .subtitle { text-align: center; color: #666; margin-bottom: 20px; }
  .summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
  .card { background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 10px; padding: 14px 20px; flex: 1; min-width: 140px; }
  .card-label { font-size: 12px; color: #0369A1; }
  .card-value { font-size: 20px; font-weight: bold; color: #0C4A6E; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #0C4A6E; color: #fff; padding: 10px; font-size: 13px; }
  td { padding: 9px 10px; border-bottom: 1px solid #E2E8F0; font-size: 13px; }
  tr:nth-child(even) td { background: #F8FAFC; }
  .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>🛒 سوبيرات الغيث</h1>
<p class="subtitle">تقرير المالية — ${periodLabel}</p>
<div class="summary">
  <div class="card"><div class="card-label">إجمالي المداخيل</div><div class="card-value">${totalIncome.toLocaleString()} دج</div></div>
  <div class="card"><div class="card-label">إجمالي المصاريف</div><div class="card-value">${totalExpenses.toLocaleString()} دج</div></div>
  <div class="card" style="background:${netProfit >= 0 ? '#F0FDF4' : '#FEF2F2'}; border-color:${netProfit >= 0 ? '#86EFAC' : '#FECACA'}">
    <div class="card-label" style="color:${netProfit >= 0 ? '#16A34A' : '#DC2626'}">صافي الربح</div>
    <div class="card-value" style="color:${netProfit >= 0 ? '#15803D' : '#B91C1C'}">${netProfit.toLocaleString()} دج</div>
  </div>
  <div class="card"><div class="card-label">عدد الأيام</div><div class="card-value">${daysWithData}</div></div>
  <div class="card"><div class="card-label">متوسط المداخيل اليومي</div><div class="card-value">${Math.round(avgIncome).toLocaleString()} دج</div></div>
  <div class="card"><div class="card-label">متوسط المصاريف اليومي</div><div class="card-value">${Math.round(avgExpenses).toLocaleString()} دج</div></div>
  ${bestIncomeDay ? `<div class="card"><div class="card-label">أعلى يوم مداخيل</div><div class="card-value">${toDisplay(bestIncomeDay)}</div></div>` : ''}
  ${bestExpDay    ? `<div class="card"><div class="card-label">أعلى يوم مصاريف</div><div class="card-value">${toDisplay(bestExpDay)}</div></div>`    : ''}
</div>
<table>
  <thead><tr><th>التاريخ</th><th>المداخيل</th><th>المصاريف</th><th>الصافي</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#888">لا توجد بيانات في هذه الفترة</td></tr>'}</tbody>
</table>
<p class="footer">تم إنشاء هذا التقرير بتاريخ ${toDisplay(getCurrentDate())}</p>
</body>
</html>`;
  }

  // ─── Shared: build CSV content ─────────────────────────────────────────────
  function buildCsvContent(): { csv: string; filename: string } {
    const { totalIncome, totalExpenses, netProfit, daysWithData, avgIncome, avgExpenses, bestIncomeDay, bestExpDay, dayStats, from } = stats;
    const periodLabel = period === 'custom'
      ? `${toDisplay(from)} — ${toDisplay(stats.to)}`
      : PERIOD_LABELS[period];

    const bom   = '\uFEFF'; // UTF-8 BOM for Excel compatibility
    const lines = [
      `سوبيرات الغيث — تقرير: ${periodLabel}`,
      '',
      `إجمالي المداخيل,${totalIncome}`,
      `إجمالي المصاريف,${totalExpenses}`,
      `صافي الربح,${netProfit}`,
      `عدد الأيام,${daysWithData}`,
      `متوسط المداخيل اليومي,${Math.round(avgIncome)}`,
      `متوسط المصاريف اليومي,${Math.round(avgExpenses)}`,
      ...(bestIncomeDay ? [`أعلى يوم مداخيل,${toDisplay(bestIncomeDay)}`] : []),
      ...(bestExpDay    ? [`أعلى يوم مصاريف,${toDisplay(bestExpDay)}`]    : []),
      '',
      'التاريخ,المداخيل (دج),المصاريف (دج),الصافي (دج)',
      ...dayStats.map(d => `${toDisplay(d.date)},${d.income},${d.expenses},${d.net}`),
    ];

    return {
      csv:      bom + lines.join('\n'),
      filename: `تقرير-سوبيرات-${toDisplay(from)}.csv`,
    };
  }

  // ─── Export PDF ────────────────────────────────────────────────────────────
  async function handleExportPDF() {
    const html = buildReportHtml();
    try {
      if (Platform.OS === 'web') {
        // Open a new window with the report HTML and trigger the browser's
        // built-in print-to-PDF dialog. Falls back to downloading the HTML
        // file if the browser blocks popups.
        const printWin = window.open('', '_blank', 'width=900,height=700');
        if (printWin) {
          printWin.document.write(html);
          printWin.document.close();
          // Wait for assets to render before opening the print dialog
          setTimeout(() => {
            printWin.focus();
            printWin.print();
          }, 500);
        } else {
          // Popup blocked — download as an HTML file the user can open + print
          const a = document.createElement('a');
          a.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
          a.download = `تقرير-سوبيرات-${toDisplay(stats.from)}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          showToast('افتح الملف في المتصفح ثم اطبعه لحفظه PDF', 'success');
        }
      } else {
        // expo-print generates a real PDF file from the HTML, then we share it
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'تصدير التقرير PDF',
          UTI: 'com.adobe.pdf',
        });
      }
    } catch {
      showToast('تعذّر تصدير ملف PDF', 'error');
    }
  }

  // ─── Export Excel (CSV) ────────────────────────────────────────────────────
  async function handleExportExcel() {
    const { csv, filename } = buildCsvContent();
    try {
      if (Platform.OS === 'web') {
        // Trigger a proper file download with the correct MIME type
        const a      = document.createElement('a');
        a.href       = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        a.download   = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        // Write a real .csv file to the cache directory, then share it
        const fileUri = (FileSystem.cacheDirectory ?? '') + filename;
        await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'تصدير Excel (CSV)', UTI: 'public.comma-separated-values-text' });
      }
    } catch {
      showToast('تعذّر تصدير ملف Excel', 'error');
    }
  }

  // ─── Render helpers ────────────────────────────────────────────────────────
  const fmt = (n: number) => n.toLocaleString();

  function renderDayGroup(date: string) {
    const isToday      = date === todayStr;
    const dayExpenses  = expenses.filter(e => e.date === date);
    const dayIncome    = canViewIncomes ? incomes.find(i => i.date === date) : undefined;
    const cashExpDay   = dayExpenses.filter(e => e.source === 'cash').reduce((s, e) => s + e.amount, 0);
    const fundExpDay   = dayExpenses.filter(e => e.source === 'fund').reduce((s, e) => s + e.amount, 0);
    const unknownExpDay = dayExpenses.filter(e => e.source === 'unknown').reduce((s, e) => s + e.amount, 0);
    const incomeAmount = dayIncome ? Number(dayIncome.amount) : 0;

    return (
      <View key={date} style={[styles.dayGroup, { borderColor: colors.border }]}>
        {/* Day header */}
        <View style={[styles.dayHeader, { backgroundColor: isToday ? '#EFF6FF' : colors.muted }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.dayHeaderDate, { color: isToday ? '#1D4ED8' : colors.foreground }]}>
              📅 {toDisplay(date)}{isToday ? '  (اليوم)' : ''}
            </Text>
            <View style={styles.dayHeaderSummaryRow}>
              {canViewIncomes && (
                <Text style={[styles.dayHeaderStat, { color: '#16A34A' }]}>روسات: {fmt(incomeAmount)} دج</Text>
              )}
              <Text style={[styles.dayHeaderStat, { color: '#DC2626' }]}>مصاريف لاكاس: {fmt(cashExpDay)} دج</Text>
              {fundExpDay > 0 && <Text style={[styles.dayHeaderStat, { color: '#B45309' }]}>مصاريف الصندوق: {fmt(fundExpDay)} دج</Text>}
              {unknownExpDay > 0 && <Text style={[styles.dayHeaderStat, { color: '#64748B' }]}>مصروف غير محدد المصدر: {fmt(unknownExpDay)} دج</Text>}
            </View>
          </View>
          {/* Delete day button — only for past days and admin */}
          {isAdmin && !isToday && (
            <TouchableOpacity
              style={styles.deleteDayBtn}
              onPress={() => setDeleteDayDate(date)}
            >
              <Feather name="trash-2" size={14} color="#EF4444" />
              <Text style={styles.deleteDayText}>حذف اليوم</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Automatically calculated daily cash closing */}
        {dayIncome && (
          <View style={[styles.accountingCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
            <View style={styles.accountingRow}>
              <Text style={[styles.accountingLabel, { color: '#166534' }]}>النقد الفعلي عند الإغلاق</Text>
              <Text style={[styles.accountingValue, { color: '#166534' }]}>{fmt(dayIncome.actualCash)} دج</Text>
            </View>
            {dayIncome.unclassifiedExpenses > 0 && (
              <View style={styles.accountingRow}>
                <Text style={[styles.accountingLabel, { color: '#64748B' }]}>مصاريف قديمة غير محددة المصدر</Text>
                <Text style={[styles.accountingValue, { color: '#64748B' }]}>{fmt(dayIncome.unclassifiedExpenses)} دج</Text>
              </View>
            )}
            <View style={styles.accountingRow}>
              <Text style={[styles.accountingLabel, { color: '#166534' }]}>رصيد بداية اليوم</Text>
              <Text style={[styles.accountingValue, { color: '#166534' }]}>{fmt(dayIncome.openingCash)} دج</Text>
            </View>
            <View style={styles.accountingRow}>
              <Text style={[styles.accountingLabel, { color: '#166534' }]}>مصاريف لاكاس</Text>
              <Text style={[styles.accountingValue, { color: '#166534' }]}>{fmt(dayIncome.cashExpenses)} دج</Text>
            </View>
            <View style={styles.accountingRow}>
              <Text style={[styles.accountingLabel, { color: '#B45309' }]}>مصاريف الصندوق</Text>
              <Text style={[styles.accountingValue, { color: '#B45309' }]}>{fmt(dayIncome.fundExpenses)} دج</Text>
            </View>
            <View style={styles.accountingRow}>
              <Text style={[styles.accountingLabel, { color: '#92400E' }]}>الرصيد المحاسبي للصندوق</Text>
              <Text style={[styles.accountingValue, { color: '#92400E' }]}>{fmt(dayIncome.fundBalance)} دج</Text>
            </View>
            <View style={styles.accountingRow}>
              <Text style={[styles.accountingLabel, { color: '#92400E' }]}>العدّ الفعلي للصندوق</Text>
              <Text style={[styles.accountingValue, { color: '#92400E' }]}>
                {dayIncome.actualFund == null ? '—' : `${fmt(dayIncome.actualFund)} دج`}
              </Text>
            </View>
            {dayIncome.fundDifference != null && (
              <View style={styles.accountingRow}>
                <Text style={[styles.accountingLabel, { color: dayIncome.fundDifference === 0 ? '#166534' : '#B91C1C' }]}>فرق المطابقة</Text>
                <Text style={[styles.accountingValue, { color: dayIncome.fundDifference === 0 ? '#166534' : '#B91C1C' }]}>
                  {fmt(dayIncome.fundDifference)} دج
                </Text>
              </View>
            )}
            <View style={[styles.accountingRow, styles.accountingTotal]}>
              <Text style={[styles.accountingLabel, { color: '#15803D' }]}>روسات اليوم المحسوبة</Text>
              <Text style={[styles.incomeAmount, { flex: 0 }]}>{fmt(dayIncome.amount)} دج</Text>
            </View>
            <View style={[styles.accountingRow, styles.accountingTotal]}>
              <Text style={[styles.accountingLabel, { color: '#15803D' }]}>الصافي</Text>
              <Text style={[styles.incomeAmount, { flex: 0 }]}>{fmt(dayIncome.amount - dayIncome.cashExpenses)} دج</Text>
            </View>
            <Text style={[styles.accountingFormula, { color: '#166534' }]}>
              {fmt(dayIncome.actualCash)} + {fmt(dayIncome.cashExpenses)} - {fmt(dayIncome.openingCash)} = {fmt(dayIncome.amount)} دج
            </Text>
            <Text style={[styles.accountingFormula, { color: '#64748B' }]}>
              المطابقة غير متاحة حاليًا لعدم وجود مصدر مستقل للمبيعات أو الفواتير
            </Text>
          </View>
        )}

        {/* Expenses */}
        {dayExpenses.length === 0 && !dayIncome && (
          <Text style={[styles.emptyDay, { color: colors.mutedForeground }]}>لا توجد بيانات</Text>
        )}
        {dayExpenses.map(e => (
          <View key={e.id} style={[styles.expCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.expLeft}>
              <View style={[styles.typeBadge, { backgroundColor: e.source === 'fund' ? '#FEF3C7' : e.source === 'unknown' ? '#F1F5F9' : colors.muted }]}>
                <Text style={[styles.typeText, { color: e.source === 'fund' ? '#B45309' : e.source === 'unknown' ? '#64748B' : colors.mutedForeground }]}>{e.source === 'fund' ? 'الصندوق' : e.source === 'unknown' ? 'مصدر غير محدد' : 'لاكاس'}</Text>
              </View>
              <Text style={[styles.expDesc, { color: colors.foreground }]}>{e.description}</Text>
              <Text style={[styles.expMeta, { color: colors.mutedForeground }]}>{e.time} • {e.userName}</Text>
            </View>
            <View style={styles.expRight}>
              <Text style={styles.expAmount}>{fmt(e.amount)} دج</Text>
              {/* Individual delete only for today */}
              {isAdmin && isToday && (
                <TouchableOpacity onPress={() => setDeleteExpenseId(e.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name="trash-2" size={16} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </View>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={styles.headerTitle}>{canViewIncomes ? 'المصاريف والروسات' : 'المصاريف'}</Text>
        {/* Tab switcher */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'records' && styles.tabBtnActive]}
            onPress={() => setActiveTab('records')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'records' && styles.tabBtnTextActive]}>السجل</Text>
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'stats' && styles.tabBtnActive]}
              onPress={() => setActiveTab('stats')}
            >
              <Text style={[styles.tabBtnText, activeTab === 'stats' && styles.tabBtnTextActive]}>الإحصائيات</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {/* ── Records Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'records' && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: bottomPad + 80, paddingTop: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          {dayGroups.length === 0 ? (
            <EmptyState icon="credit-card" title="لا توجد بيانات مسجلة" subtitle={canViewIncomes ? 'اضغط + لإضافة مصروف أو روسات' : 'اضغط + لإضافة مصروف'} />
          ) : (
            <View style={{ paddingHorizontal: 16, gap: 12 }}>
              {dayGroups.map(renderDayGroup)}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Statistics Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'stats' && isAdmin && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: bottomPad + 40, paddingTop: 16 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          {/* Period selector */}
          <View style={{ paddingHorizontal: 16 }}>
            <TouchableOpacity
              style={[styles.periodSelector, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowPeriodPicker(true)}
            >
              <Text style={[styles.periodSelectorText, { color: colors.foreground }]}>{PERIOD_LABELS[period]}</Text>
              <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            {period === 'custom' && (
              <View style={styles.customDateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>من</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground}
                    value={customFrom} onChangeText={setCustomFrom} textAlign="center"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>إلى</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground}
                    value={customTo} onChangeText={setCustomTo} textAlign="center"
                  />
                </View>
              </View>
            )}
          </View>

          {/* Summary cards */}
          <View style={[styles.statsGrid, { marginTop: 16 }]}>
            <StatCard label="إجمالي المداخيل" value={`${fmt(stats.totalIncome)} دج`} color="#16A34A" bg="#DCFCE7" icon="trending-up" />
            <StatCard label="إجمالي المصاريف" value={`${fmt(stats.totalExpenses)} دج`} color="#DC2626" bg="#FEE2E2" icon="trending-down" />
            <StatCard label="مصاريف الصندوق" value={`${fmt(stats.dayStats.reduce((sum, d) => sum + d.fundExpenses, 0))} دج`} color="#B45309" bg="#FEF3C7" icon="archive" />
            <StatCard
              label="صافي الربح"
              value={`${fmt(Math.abs(stats.netProfit))} دج`}
              color={stats.netProfit >= 0 ? '#16A34A' : '#DC2626'}
              bg={stats.netProfit >= 0 ? '#DCFCE7' : '#FEE2E2'}
              icon="bar-chart-2"
              sub={stats.netProfit >= 0 ? 'ربح' : 'خسارة'}
            />
            <StatCard label="عدد الأيام" value={String(stats.daysWithData)} color="#0369A1" bg="#E0F2FE" icon="calendar" />
            <StatCard label="متوسط المداخيل/يوم" value={`${fmt(Math.round(stats.avgIncome))} دج`} color="#7C3AED" bg="#EDE9FE" icon="activity" />
            <StatCard label="متوسط المصاريف/يوم" value={`${fmt(Math.round(stats.avgExpenses))} دج`} color="#B45309" bg="#FEF3C7" icon="minus-circle" />
            {stats.bestIncomeDay ? <StatCard label="أعلى يوم مداخيل" value={toDisplay(stats.bestIncomeDay)} color="#0369A1" bg="#E0F2FE" icon="star" /> : null}
            {stats.bestExpDay    ? <StatCard label="أعلى يوم مصاريف" value={toDisplay(stats.bestExpDay)}    color="#DC2626" bg="#FEE2E2" icon="alert-circle" /> : null}
          </View>

          {/* Export buttons */}
          <View style={[styles.exportRow, { paddingHorizontal: 16, marginTop: 16 }]}>
            <TouchableOpacity style={[styles.exportBtn, { backgroundColor: '#DC2626' }]} onPress={handleExportPDF}>
              <Feather name="file-text" size={16} color="#fff" />
              <Text style={styles.exportBtnText}>تصدير PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.exportBtn, { backgroundColor: '#16A34A' }]} onPress={handleExportExcel}>
              <Feather name="grid" size={16} color="#fff" />
              <Text style={styles.exportBtnText}>تصدير Excel</Text>
            </TouchableOpacity>
          </View>

          {/* Day-by-day breakdown */}
          {stats.dayStats.length === 0 ? (
            <EmptyState icon="bar-chart-2" title="لا توجد بيانات في هذه الفترة" subtitle="اختر فترة زمنية أخرى" />
          ) : (
            <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 10 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>تفاصيل الأيام</Text>
              {stats.dayStats.map(d => (
                <View key={d.date} style={[styles.dayStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.dayStatDate, { color: colors.foreground }]}>📅 {toDisplay(d.date)}</Text>
                  <View style={styles.dayStatRow}>
                    <View style={styles.dayStatItem}>
                      <Text style={[styles.dayStatLabel, { color: '#16A34A' }]}>روسات اليوم</Text>
                      <Text style={[styles.dayStatValue, { color: '#15803D' }]}>{fmt(d.income)} دج</Text>
                    </View>
                    <View style={styles.dayStatItem}>
                      <Text style={[styles.dayStatLabel, { color: '#DC2626' }]}>مصاريف لاكاس</Text>
                      <Text style={[styles.dayStatValue, { color: '#B91C1C' }]}>{fmt(d.expenses)} دج</Text>
                    </View>
                    <View style={styles.dayStatItem}>
                      <Text style={[styles.dayStatLabel, { color: '#B45309' }]}>مصاريف الصندوق</Text>
                      <Text style={[styles.dayStatValue, { color: '#92400E' }]}>{fmt(d.fundExpenses)} دج</Text>
                    </View>
                    <View style={styles.dayStatItem}>
                      <Text style={[styles.dayStatLabel, { color: d.net >= 0 ? '#16A34A' : '#DC2626' }]}>الصافي</Text>
                      <Text style={[styles.dayStatValue, { color: d.net >= 0 ? '#15803D' : '#B91C1C' }]}>{fmt(d.net)} دج</Text>
                    </View>
                    <View style={styles.dayStatItem}>
                      <Text style={[styles.dayStatLabel, { color: '#0369A1' }]}>رصيد الصندوق</Text>
                      <Text style={[styles.dayStatValue, { color: '#075985' }]}>
                        {d.fundBalance == null ? '—' : `${fmt(d.fundBalance)} دج`}
                      </Text>
                    </View>
                    <View style={styles.dayStatItem}>
                      <Text style={[styles.dayStatLabel, { color: '#7C3AED' }]}>النقد الفعلي عند الإغلاق</Text>
                      <Text style={[styles.dayStatValue, { color: '#6D28D9' }]}>
                        {d.actualCash == null ? '—' : `${fmt(d.actualCash)} دج`}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── FAB (Records tab only) — visible to ALL roles ─────────────────────── */}
      {activeTab === 'records' && (
        <>
          {fabOpen && <TouchableOpacity style={styles.fabBackdrop} onPress={() => setFabOpen(false)} activeOpacity={1} />}
          {fabOpen && (
            <View style={[styles.fabMenu, { bottom: bottomPad + 84 }]}>
              {/* Daily close: enter only the cash physically found */}
              {isAdmin && (
                <TouchableOpacity style={[styles.fabMenuItem, { backgroundColor: '#DCFCE7' }]} onPress={openCloseDay}>
                  <Feather name="trending-up" size={18} color="#16A34A" />
                  <Text style={[styles.fabMenuText, { color: '#16A34A' }]}>إغلاق اليوم</Text>
                </TouchableOpacity>
              )}
              {/* إضافة مصروف available to ALL roles including employees */}
              <TouchableOpacity style={[styles.fabMenuItem, { backgroundColor: '#FEE2E2' }]} onPress={openAddExpense}>
                <Feather name="credit-card" size={18} color="#DC2626" />
                <Text style={[styles.fabMenuText, { color: '#DC2626' }]}>إضافة مصروف</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity style={[styles.fab, { bottom: bottomPad + 16 }]} onPress={() => setFabOpen(v => !v)}>
            <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.fabGrad}>
              <Feather name={fabOpen ? 'x' : 'plus'} size={26} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </>
      )}

      {/* ── Confirm delete single expense ─────────────────────────────────────── */}
      <ConfirmModal
        visible={!!deleteExpenseId}
        title="حذف المصروف"
        message="هل أنت متأكد من حذف هذا المصروف؟ لا يمكن التراجع."
        confirmLabel="حذف"
        onConfirm={handleConfirmDeleteExpense}
        onCancel={() => setDeleteExpenseId(null)}
      />

      {/* ── Confirm delete entire day ─────────────────────────────────────────── */}
      <ConfirmModal
        visible={!!deleteDayDate}
        title="حذف اليوم"
        message={`هل أنت متأكد من حذف جميع بيانات يوم ${deleteDayDate ? toDisplay(deleteDayDate) : ''}؟\nسيتم حذف جميع المصاريف والروسات لهذا اليوم. لا يمكن التراجع.`}
        confirmLabel="حذف اليوم"
        onConfirm={handleConfirmDeleteDay}
        onCancel={() => setDeleteDayDate(null)}
      />

      {/* ── Period Picker Modal ───────────────────────────────────────────────── */}
      <Modal visible={showPeriodPicker} transparent animationType="fade" onRequestClose={() => setShowPeriodPicker(false)}>
        <TouchableOpacity style={styles.periodOverlay} onPress={() => setShowPeriodPicker(false)} activeOpacity={1}>
          <View style={[styles.periodSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground, marginBottom: 8 }]}>اختر الفترة الزمنية</Text>
            {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map(k => (
              <TouchableOpacity
                key={k}
                style={[styles.periodOption, period === k && { backgroundColor: '#EFF6FF' }, { borderColor: colors.border }]}
                onPress={() => { setPeriod(k); setShowPeriodPicker(false); }}
              >
                <Text style={[styles.periodOptionText, { color: period === k ? '#1D4ED8' : colors.foreground }]}>
                  {PERIOD_LABELS[k]}
                </Text>
                {period === k && <Feather name="check" size={16} color="#1D4ED8" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Add Expense Modal ─────────────────────────────────────────────────── */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={() => setShowAdd(false)} />
          <ScrollView
            style={[styles.sheet, { backgroundColor: colors.card }]}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>إضافة مصروف</Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>المبلغ (دج) *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="0.00" placeholderTextColor={colors.mutedForeground}
              value={form.amount} onChangeText={v => setForm(f => ({ ...f, amount: v }))}
              keyboardType="numeric" textAlign="right" autoFocus
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>المصدر *</Text>
            <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
              لاكاس: المصروف خرج من الأموال الموجودة في لاكاس — الصندوق: المصروف خرج من الأموال المتراكمة في الصندوق
            </Text>
            <View style={styles.typeGrid}>
              {([
                { value: 'cash' as const, label: 'لاكاس' },
                { value: 'fund' as const, label: 'الصندوق' },
              ]).map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.typeChip, { borderColor: colors.border, backgroundColor: form.source === option.value ? colors.primary : colors.background }]}
                  onPress={() => setForm(f => ({ ...f, source: option.value }))}
                >
                  <Text style={[styles.typeChipText, { color: form.source === option.value ? '#fff' : colors.foreground }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>الوصف *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="وصف المصروف..." placeholderTextColor={colors.mutedForeground}
              value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} textAlign="right"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>المورد (اختياري)</Text>
            <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>عند اختيار مورد يُخصم المبلغ تلقائياً من رصيده</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.supplierScroll} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              <TouchableOpacity
                style={[styles.supplierChip, { borderColor: !form.supplierId ? colors.primary : colors.border, backgroundColor: !form.supplierId ? colors.primary : colors.background }]}
                onPress={() => setForm(f => ({ ...f, supplierId: '', supplierName: '' }))}
              >
                <Text style={[styles.supplierChipText, { color: !form.supplierId ? '#fff' : colors.foreground }]}>بدون مورد</Text>
              </TouchableOpacity>
              {suppliers.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.supplierChip, { borderColor: form.supplierId === s.id ? colors.primary : colors.border, backgroundColor: form.supplierId === s.id ? colors.primary : colors.background }]}
                  onPress={() => setForm(f => ({ ...f, supplierId: s.id, supplierName: s.name }))}
                >
                  <Text style={[styles.supplierChipText, { color: form.supplierId === s.id ? '#fff' : colors.foreground }]}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {form.supplierId ? (
              <View style={[styles.supplierSelected, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <Feather name="user-check" size={16} color="#1E40AF" />
                <Text style={[styles.supplierSelectedText, { color: '#1E40AF' }]}>سيُخصم المبلغ من رصيد {form.supplierName}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.saveBtn} onPress={handleAddExpense}>
              <LinearGradient colors={['#EF4444', '#DC2626']} style={styles.saveBtnGrad}>
                <Text style={styles.saveBtnText}>إضافة المصروف</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Daily closing Modal ──────────────────────────────────────────────── */}
      <Modal visible={showCloseDay} transparent animationType="slide" onRequestClose={() => setShowCloseDay(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={() => setShowCloseDay(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>إغلاق اليوم</Text>
            <Text style={[styles.fieldHint, { color: colors.mutedForeground, marginTop: 0 }]}>
              عُدّ النقود فعلياً في لاكاس والصندوق. التطبيق يحسب روسات اليوم من النقد الموجود.
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>النقود الموجودة فعلياً في لاكاس (دج) *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="0.00" placeholderTextColor={colors.mutedForeground}
              value={actualCashInput} onChangeText={setActualCashInput} keyboardType="numeric" textAlign="right" autoFocus
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>النقود الموجودة فعلياً في الصندوق (دج) *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="0.00" placeholderTextColor={colors.mutedForeground}
              value={actualFundInput} onChangeText={setActualFundInput} keyboardType="numeric" textAlign="right"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleCloseDay}>
              <LinearGradient colors={['#22C55E', '#15803D']} style={styles.saveBtnGrad}>
                <Text style={styles.saveBtnText}>حفظ وإغلاق اليوم</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── StatCard Component ────────────────────────────────────────────────────────
function StatCard({ label, value, color, bg, icon, sub }: {
  label: string; value: string; color: string; bg: string;
  icon: React.ComponentProps<typeof Feather>['name']; sub?: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg }]}>
      <Feather name={icon} size={20} color={color} />
      <Text style={[styles.statCardLabel, { color }]}>{label}</Text>
      <Text style={[styles.statCardValue, { color }]}>{value}</Text>
      {sub ? <Text style={[styles.statCardSub, { color }]}>{sub}</Text> : null}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:     { flex: 1 },
  header:        { paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle:   { fontSize: 22, fontFamily: 'Changa_700Bold', color: '#fff', textAlign: 'right' },

  tabRow:        { flexDirection: 'row', gap: 8, marginTop: 12 },
  tabBtn:        { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' },
  tabBtnActive:  { backgroundColor: '#fff' },
  tabBtnText:    { fontSize: 14, fontFamily: 'Changa_600SemiBold', color: 'rgba(255,255,255,0.85)' },
  tabBtnTextActive: { color: '#0C4A6E' },

  sectionTitle: { fontSize: 17, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },

  // Day groups
  dayGroup:     { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  dayHeader:    { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  dayHeaderDate: { fontSize: 15, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  dayHeaderSummaryRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  dayHeaderStat: { fontSize: 12, fontFamily: 'Changa_500Medium' },
  deleteDayBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#FEE2E2' },
  deleteDayText: { fontSize: 12, fontFamily: 'Changa_600SemiBold', color: '#EF4444' },

  incomeRow:    { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  incomeAmount: { fontSize: 15, fontFamily: 'Changa_700Bold', color: '#15803D', textAlign: 'right' },
  accountingCard: { padding: 12, gap: 7, borderWidth: 1, margin: 10, borderRadius: 12 },
  accountingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  accountingLabel: { fontSize: 12, fontFamily: 'Changa_500Medium', textAlign: 'right', flex: 1 },
  accountingValue: { fontSize: 13, fontFamily: 'Changa_700Bold' },
  accountingTotal: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#BBF7D0', paddingTop: 7, marginTop: 2 },
  accountingFormula: { fontSize: 11, fontFamily: 'Changa_400Regular', textAlign: 'center', marginTop: 2 },
  emptyDay:     { padding: 12, textAlign: 'right', fontSize: 13, fontFamily: 'Changa_400Regular' },

  expCard:      { padding: 14, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  expLeft:      { flex: 1, gap: 4 },
  typeBadge:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-end' },
  typeText:     { fontSize: 11, fontFamily: 'Changa_500Medium' },
  expDesc:      { fontSize: 15, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  expMeta:      { fontSize: 11, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  expRight:     { alignItems: 'center', gap: 8 },
  expAmount:    { fontSize: 15, fontFamily: 'Changa_700Bold', color: '#EF4444' },

  // Stats
  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  statCard:     { borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, width: '47%' },
  statCardLabel: { fontSize: 11, fontFamily: 'Changa_500Medium', textAlign: 'center' },
  statCardValue: { fontSize: 16, fontFamily: 'Changa_700Bold', textAlign: 'center' },
  statCardSub:   { fontSize: 11, fontFamily: 'Changa_400Regular' },

  exportRow:    { flexDirection: 'row', gap: 10 },
  exportBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14 },
  exportBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Changa_600SemiBold' },

  dayStatCard:  { borderRadius: 14, padding: 14, borderWidth: 1 },
  dayStatDate:  { fontSize: 14, fontFamily: 'Changa_600SemiBold', textAlign: 'right', marginBottom: 8 },
  dayStatRow:   { flexDirection: 'row', gap: 8 },
  dayStatItem:  { flex: 1, alignItems: 'center' },
  dayStatLabel: { fontSize: 11, fontFamily: 'Changa_500Medium' },
  dayStatValue: { fontSize: 14, fontFamily: 'Changa_700Bold' },

  // Period picker
  periodSelector:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, borderWidth: 1 },
  periodSelectorText: { fontSize: 15, fontFamily: 'Changa_600SemiBold' },
  periodOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  periodSheet:     { borderRadius: 20, padding: 20, width: '100%', maxWidth: 400, gap: 4 },
  periodOption:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  periodOptionText: { fontSize: 15, fontFamily: 'Changa_500Medium' },
  customDateRow:   { flexDirection: 'row', gap: 10, marginTop: 10 },

  // FAB
  fabBackdrop: { ...StyleSheet.absoluteFillObject, zIndex: 8 },
  fabMenu:     { position: 'absolute', left: 14, zIndex: 9, gap: 8 },
  fabMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 4 },
  fabMenuText: { fontSize: 15, fontFamily: 'Changa_600SemiBold' },
  fab:         { position: 'absolute', left: 20, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', shadowColor: '#0EA5E9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8, zIndex: 10 },
  fabGrad:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Modals / sheets
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12, maxHeight: '92%' },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  sheetTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  fieldLabel: { fontSize: 13, fontFamily: 'Changa_500Medium', textAlign: 'right' },
  fieldHint:  { fontSize: 11, fontFamily: 'Changa_400Regular', textAlign: 'right', marginTop: -8 },
  input:      { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15, fontFamily: 'Changa_400Regular' },
  typeGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  typeChipText: { fontSize: 13, fontFamily: 'Changa_400Regular' },
  supplierScroll: { maxHeight: 50 },
  supplierChip:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  supplierChipText: { fontSize: 13, fontFamily: 'Changa_500Medium' },
  supplierSelected: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  supplierSelectedText: { fontSize: 13, fontFamily: 'Changa_500Medium', flex: 1, textAlign: 'right' },
  saveBtn:     { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  saveBtnGrad: { padding: 16, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontFamily: 'Changa_600SemiBold', color: '#fff' },
});
