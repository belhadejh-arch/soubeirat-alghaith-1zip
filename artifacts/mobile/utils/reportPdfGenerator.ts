/**
 * Comprehensive PDF report generator for سوبيرات الغيث
 *
 * Native path  → HTML template → expo-print → local file URI
 * Web path     → Canvas 2D pages → jsPDF → blob URL
 *
 * Arabic text is handled by the browser canvas engine (RTL direction),
 * which works correctly in Median.co / AppCreator24 WebView environments.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { ReportData } from './api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pad2(n: number): string { return String(n).padStart(2, '0'); }

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function now(): string {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} — ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ─── HTML template (used for native expo-print) ───────────────────────────────
function buildReportHTML(report: ReportData, storeName: string, managerName: string): string {
  const { summary, data, generatedAt } = report;
  const dateStr = fmtDate(generatedAt);

  const logoSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="64" height="64">
    <circle cx="40" cy="40" r="40" fill="#0C4A6E"/>
    <path d="M24 26h4l5 22h14l4-14H33" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="37" cy="52" r="2.5" fill="#fff"/>
    <circle cx="47" cy="52" r="2.5" fill="#fff"/>
  </svg>`;

  function tableRows(rows: string[][]): string {
    return rows.map((cells, i) =>
      `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">${cells.map(c => `<td>${c}</td>`).join('')}</tr>`
    ).join('');
  }

  function section(title: string, content: string): string {
    return `<div class="section">
      <div class="section-title">${title}</div>
      ${content}
    </div>`;
  }

  function statsGrid(items: { label: string; value: string; color?: string }[]): string {
    return `<div class="stats-grid">${items.map(it => `
      <div class="stat-card">
        <div class="stat-label">${it.label}</div>
        <div class="stat-value" style="color:${it.color ?? '#0C4A6E'}">${it.value}</div>
      </div>`).join('')}</div>`;
  }

  const customerRows = data.customers.map(c => [
    c.name, c.familyName, c.phone || '—',
    `${fmtNum(Number(c.balance) || 0)} ر.س`,
    c.status === 'active' ? 'نشط' : 'محظور',
  ]);

  const supplierRows = data.suppliers.map(s => [s.name, s.phone || '—', s.address || '—']);

  const expenseRows = data.expenses.slice(0, 200).map(e => [
    e.date, e.type, e.description || '—',
    `${fmtNum(Number(e.amount))} ر.س`, e.userName,
  ]);

  const incomeRows = data.incomes.map(i => [
    i.date, `${fmtNum(Number(i.amount))} ر.س`,
  ]);

  const customerTxRows = data.customerTransactions.slice(0, 300).map(tx => [
    tx.date, tx.customerName, tx.familyName,
    tx.type === 'debt' ? 'دين' : 'سداد',
    `${fmtNum(Number(tx.amount))} ر.س`,
    `${fmtNum(Number(tx.balanceAfter))} ر.س`,
  ]);

  const supplierTxRows = data.supplierTransactions.slice(0, 300).map(tx => [
    tx.date, tx.supplierName,
    tx.type === 'debt' ? 'دين' : 'سداد',
    `${fmtNum(Number(tx.amount))} ر.س`,
    tx.note || '—',
  ]);

  const taskRows = data.tasks.map(t => [
    t.title, t.workerName, t.date,
    t.priority === 'high' ? 'عالية' : t.priority === 'medium' ? 'متوسطة' : 'منخفضة',
    t.status === 'done' ? 'منجز' : t.status === 'pending' ? 'قيد الانتظار' : 'مؤجل',
  ]);

  const productRows = data.products.map(p => [
    p.name, p.quantity, p.section, p.workerName, p.date,
    p.status === 'resolved' ? 'تم التوفير' : 'لم يُوفَّر بعد',
  ]);

  const orderRows = data.orders.map(o => [
    o.orderNumber, o.supplierName, o.date,
    o.status === 'delivered' ? 'مُسلَّم' : o.status === 'draft' ? 'مسودة' : o.status,
  ]);

  const userRows = data.users.map(u => [
    u.name, u.username, u.phone || '—',
    u.role === 'admin' ? 'مدير' : 'موظف',
    u.status === 'active' ? 'نشط' : 'موقوف',
  ]);

  const notifRows = data.notifications.map(n => [
    n.date, n.message, n.type, n.isRead ? 'مقروء' : 'غير مقروء',
  ]);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>التقرير الشامل — ${storeName}</title>
<style>
@page { size: A4; margin: 15mm 16mm 20mm 16mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 10pt; color: #1E293B; direction: rtl; background: #fff; }
.header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 3px solid #0C4A6E; margin-bottom: 20px; }
.logo { flex-shrink: 0; }
.store-name { font-size: 20pt; font-weight: 700; color: #0C4A6E; }
.store-sub { font-size: 9pt; color: #64748B; margin-top: 3px; }
.report-meta { margin-right: auto; text-align: left; font-size: 9pt; color: #64748B; }
.section { margin-bottom: 22px; page-break-inside: avoid; }
.section-title { font-size: 11pt; font-weight: 700; color: #0C4A6E; padding-right: 10px; border-right: 4px solid #0EA5E9; margin-bottom: 10px; }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
.stat-card { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; text-align: right; }
.stat-label { font-size: 8pt; color: #94A3B8; font-weight: 700; margin-bottom: 3px; }
.stat-value { font-size: 13pt; font-weight: 700; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th { background: #0C4A6E; color: #fff; padding: 8px 10px; font-weight: 700; text-align: right; }
td { padding: 7px 10px; border-bottom: 1px solid #E2E8F0; vertical-align: middle; }
tr.even { background: #F8FAFC; }
tr.odd  { background: #fff; }
.footer { border-top: 1px solid #E2E8F0; padding-top: 10px; text-align: center; color: #94A3B8; font-size: 8pt; margin-top: 16px; }
.page-break { page-break-before: always; }
.empty { color: #94A3B8; font-style: italic; padding: 14px 0; text-align: center; }
</style>
</head>
<body>

<div class="header">
  <div class="logo">${logoSVG}</div>
  <div>
    <div class="store-name">${storeName}</div>
    <div class="store-sub">التقرير الشامل لنظام الإدارة</div>
  </div>
  <div class="report-meta">
    <div>المدير: ${managerName}</div>
    <div>التاريخ: ${dateStr}</div>
    <div>وقت الإنشاء: ${now()}</div>
  </div>
</div>

${section('الملخص العام', statsGrid([
  { label: 'إجمالي الإيرادات', value: `${fmtNum(summary.totalIncome)} ر.س`, color: '#10B981' },
  { label: 'إجمالي المصاريف', value: `${fmtNum(summary.totalExpenses)} ر.س`, color: '#EF4444' },
  { label: 'صافي الأرباح', value: `${fmtNum(summary.netProfit)} ر.س`, color: summary.netProfit >= 0 ? '#10B981' : '#EF4444' },
  { label: 'ديون الزبائن', value: `${fmtNum(summary.totalCustomerDebt)} ر.س`, color: '#F59E0B' },
  { label: 'ديون الموردين', value: `${fmtNum(summary.totalSupplierDebt)} ر.س`, color: '#8B5CF6' },
  { label: 'عدد الزبائن', value: String(summary.customerCount) },
  { label: 'عدد الموردين', value: String(summary.supplierCount) },
  { label: 'المنتجات الناقصة', value: String(summary.productCount) },
  { label: 'عدد المهام', value: String(summary.taskCount) },
]))}

${section('الإيرادات اليومية', data.incomes.length ? `
<table>
  <thead><tr><th>المبلغ</th><th>التاريخ</th></tr></thead>
  <tbody>${tableRows(incomeRows)}</tbody>
</table>` : `<p class="empty">لا توجد إيرادات مسجلة</p>`)}

${section('المصاريف', data.expenses.length ? `
<table>
  <thead><tr><th>الموظف</th><th>المبلغ</th><th>الوصف</th><th>النوع</th><th>التاريخ</th></tr></thead>
  <tbody>${tableRows(expenseRows)}</tbody>
</table>
${data.expenses.length > 200 ? `<p style="font-size:8pt;color:#94A3B8;padding:6px 0">يُعرض أحدث 200 سجل من أصل ${data.expenses.length}</p>` : ''}
` : `<p class="empty">لا توجد مصاريف مسجلة</p>`)}

<div class="page-break"></div>

${section('الزبائن', data.customers.length ? `
<table>
  <thead><tr><th>الحالة</th><th>الرصيد</th><th>الهاتف</th><th>العائلة</th><th>الاسم</th></tr></thead>
  <tbody>${tableRows(customerRows)}</tbody>
</table>` : `<p class="empty">لا يوجد زبائن مسجلون</p>`)}

${section('معاملات الزبائن', data.customerTransactions.length ? `
<table>
  <thead><tr><th>الرصيد بعد</th><th>المبلغ</th><th>النوع</th><th>العائلة</th><th>الزبون</th><th>التاريخ</th></tr></thead>
  <tbody>${tableRows(customerTxRows)}</tbody>
</table>
${data.customerTransactions.length > 300 ? `<p style="font-size:8pt;color:#94A3B8;padding:6px 0">يُعرض أحدث 300 سجل من أصل ${data.customerTransactions.length}</p>` : ''}
` : `<p class="empty">لا توجد معاملات زبائن</p>`)}

<div class="page-break"></div>

${section('الموردون', data.suppliers.length ? `
<table>
  <thead><tr><th>العنوان</th><th>الهاتف</th><th>الاسم</th></tr></thead>
  <tbody>${tableRows(supplierRows)}</tbody>
</table>` : `<p class="empty">لا يوجد موردون مسجلون</p>`)}

${section('معاملات الموردين', data.supplierTransactions.length ? `
<table>
  <thead><tr><th>الملاحظة</th><th>المبلغ</th><th>النوع</th><th>المورد</th><th>التاريخ</th></tr></thead>
  <tbody>${tableRows(supplierTxRows)}</tbody>
</table>
${data.supplierTransactions.length > 300 ? `<p style="font-size:8pt;color:#94A3B8;padding:6px 0">يُعرض أحدث 300 سجل من أصل ${data.supplierTransactions.length}</p>` : ''}
` : `<p class="empty">لا توجد معاملات موردين</p>`)}

<div class="page-break"></div>

${section('طلبات الشراء', data.orders.length ? `
<table>
  <thead><tr><th>الحالة</th><th>التاريخ</th><th>المورد</th><th>رقم الطلب</th></tr></thead>
  <tbody>${tableRows(orderRows)}</tbody>
</table>` : `<p class="empty">لا توجد طلبات شراء</p>`)}

${section('المنتجات الناقصة', data.products.length ? `
<table>
  <thead><tr><th>الحالة</th><th>التاريخ</th><th>الموظف</th><th>القسم</th><th>الكمية</th><th>المنتج</th></tr></thead>
  <tbody>${tableRows(productRows)}</tbody>
</table>` : `<p class="empty">لا توجد منتجات ناقصة</p>`)}

${section('المهام', data.tasks.length ? `
<table>
  <thead><tr><th>الحالة</th><th>الأولوية</th><th>التاريخ</th><th>الموظف</th><th>المهمة</th></tr></thead>
  <tbody>${tableRows(taskRows)}</tbody>
</table>` : `<p class="empty">لا توجد مهام</p>`)}

${section('المستخدمون', data.users.length ? `
<table>
  <thead><tr><th>الحالة</th><th>الدور</th><th>الهاتف</th><th>اسم المستخدم</th><th>الاسم</th></tr></thead>
  <tbody>${tableRows(userRows)}</tbody>
</table>` : `<p class="empty">لا يوجد مستخدمون</p>`)}

${section('الإشعارات', data.notifications.length ? `
<table>
  <thead><tr><th>الحالة</th><th>النوع</th><th>الرسالة</th><th>التاريخ</th></tr></thead>
  <tbody>${tableRows(notifRows)}</tbody>
</table>` : `<p class="empty">لا توجد إشعارات</p>`)}

<div class="footer">
  تم إنشاء هذا التقرير بواسطة <strong>${storeName}</strong> — نظام إدارة السوبرماركت · ${now()}
</div>
</body>
</html>`;
}

// ─── Canvas-based multi-page PDF (web / Median.co WebView) ──────────────────
async function buildReportBlobCanvas(report: ReportData, storeName: string, managerName: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');

  const W        = 794;
  const A4_H     = 1123;
  const PAD      = 42;
  const PX       = 1.5;
  const CW       = W - PAD * 2;

  // Page state
  const pages: HTMLCanvasElement[] = [];
  let canvas!: HTMLCanvasElement;
  let ctx!: CanvasRenderingContext2D;
  let y = 0;

  function newPage() {
    canvas = document.createElement('canvas');
    canvas.width  = W * PX;
    canvas.height = A4_H * PX;
    const c = canvas.getContext('2d')!;
    c.scale(PX, PX);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, A4_H);
    c.direction    = 'rtl';
    c.textBaseline = 'top';
    ctx = c;
    pages.push(canvas);
    y = 40;
  }

  function checkSpace(needed: number) {
    if (y + needed > A4_H - 50) newPage();
  }

  function drawDivider(color = '#E2E8F0', weight = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth   = weight;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 10;
  }

  function drawText(text: string, x: number, size: number, color: string, align: 'right' | 'center' | 'left' = 'right', bold = false) {
    ctx.fillStyle    = color;
    ctx.font         = `${bold ? 'bold ' : ''}${size}pt Arial, "Segoe UI", Tahoma, sans-serif`;
    ctx.textAlign    = align;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  function drawSectionTitle(title: string) {
    checkSpace(44);
    // Accent bar
    ctx.fillStyle = '#0EA5E9';
    ctx.fillRect(W - PAD - 4, y + 4, 4, 22);
    drawText(title, W - PAD - 12, 11, '#0C4A6E', 'right', true);
    y += 34;
  }

  function drawTableHeader(cols: { label: string; w: number; align?: 'right' | 'center' }[]) {
    checkSpace(36);
    ctx.fillStyle = '#0C4A6E';
    ctx.fillRect(PAD, y, CW, 36);
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 9pt Arial, "Segoe UI", Tahoma, sans-serif';
    ctx.textBaseline = 'middle';
    let xCursor = PAD;
    cols.forEach(col => {
      ctx.textAlign = col.align ?? 'right';
      const textX   = col.align === 'center'
        ? xCursor + col.w / 2
        : xCursor + col.w - 8;
      ctx.fillText(col.label, textX, y + 18);
      xCursor += col.w;
    });
    y += 36;
  }

  function drawTableRow(cols: { label: string; w: number; align?: 'right' | 'center'; color?: string }[], even: boolean) {
    checkSpace(30);
    ctx.fillStyle = even ? '#F8FAFC' : '#ffffff';
    ctx.fillRect(PAD, y, CW, 30);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(PAD, y + 30); ctx.lineTo(W - PAD, y + 30); ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.font = '9pt Arial, "Segoe UI", Tahoma, sans-serif';
    let xCursor = PAD;
    cols.forEach(col => {
      ctx.fillStyle = col.color ?? '#1E293B';
      ctx.textAlign = col.align ?? 'right';
      const textX   = col.align === 'center'
        ? xCursor + col.w / 2
        : xCursor + col.w - 8;
      // Truncate
      let t = col.label;
      const maxW = col.w - 16;
      ctx.font = '9pt Arial, "Segoe UI", Tahoma, sans-serif';
      while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -1);
      if (t.length < col.label.length) t = t.slice(0, -1) + '…';
      ctx.fillText(t, textX, y + 15);
      xCursor += col.w;
    });
    y += 30;
  }

  function drawStatCard(label: string, value: string, color: string, x: number, w: number, h = 60) {
    ctx.fillStyle   = '#F8FAFC';
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect?.(x, y, w, h, 8);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle    = '#94A3B8';
    ctx.font         = 'bold 7.5pt Arial, "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x + w - 10, y + 10);
    ctx.fillStyle    = color;
    ctx.font         = 'bold 12pt Arial, "Segoe UI", Tahoma, sans-serif';
    ctx.fillText(value, x + w - 10, y + 28);
  }

  // ── Build pages ─────────────────────────────────────────────────────────────
  newPage();

  // Header
  ctx.fillStyle = '#0C4A6E';
  ctx.beginPath();
  ctx.arc(PAD + 28, y + 28, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle    = '#0C4A6E';
  ctx.font         = 'bold 17pt Arial, "Segoe UI", Tahoma, sans-serif';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(storeName, W - PAD, y);
  ctx.fillStyle = '#64748B';
  ctx.font      = '9pt Arial, "Segoe UI", Tahoma, sans-serif';
  ctx.fillText('التقرير الشامل لنظام الإدارة', W - PAD, y + 22);
  ctx.fillText(`المدير: ${managerName}   |   التاريخ: ${fmtDate(report.generatedAt)}   |   وقت الإنشاء: ${now()}`, W - PAD, y + 38);
  y += 70;
  drawDivider('#0C4A6E', 2);
  y += 4;

  // Summary stats (3 per row)
  const { summary } = report;
  const statCols = 3;
  const statW    = Math.floor(CW / statCols) - 6;
  const statsData = [
    { label: 'إجمالي الإيرادات', value: `${fmtNum(summary.totalIncome)} ر.س`, color: '#10B981' },
    { label: 'إجمالي المصاريف', value: `${fmtNum(summary.totalExpenses)} ر.س`, color: '#EF4444' },
    { label: 'صافي الأرباح', value: `${fmtNum(summary.netProfit)} ر.س`, color: summary.netProfit >= 0 ? '#10B981' : '#EF4444' },
    { label: 'ديون الزبائن', value: `${fmtNum(summary.totalCustomerDebt)} ر.س`, color: '#F59E0B' },
    { label: 'ديون الموردين', value: `${fmtNum(summary.totalSupplierDebt)} ر.س`, color: '#8B5CF6' },
    { label: 'عدد الزبائن', value: String(summary.customerCount), color: '#0EA5E9' },
    { label: 'عدد الموردين', value: String(summary.supplierCount), color: '#0369A1' },
    { label: 'المهام', value: String(summary.taskCount), color: '#6366F1' },
    { label: 'المنتجات الناقصة', value: String(summary.productCount), color: '#EC4899' },
  ];

  drawSectionTitle('الملخص العام');
  for (let row = 0; row < Math.ceil(statsData.length / statCols); row++) {
    checkSpace(70);
    for (let col = 0; col < statCols; col++) {
      const idx = row * statCols + col;
      if (idx >= statsData.length) break;
      const xPos = PAD + col * (statW + 6);
      drawStatCard(statsData[idx].label, statsData[idx].value, statsData[idx].color, xPos, statW);
    }
    y += 68;
  }

  // ── Incomes ──────────────────────────────────────────────────────────────
  drawSectionTitle('الإيرادات اليومية');
  if (report.data.incomes.length) {
    drawTableHeader([{ label: 'المبلغ', w: CW * 0.4, align: 'right' }, { label: 'التاريخ', w: CW * 0.6, align: 'right' }]);
    report.data.incomes.forEach((inc, i) => drawTableRow([
      { label: `${fmtNum(Number(inc.amount))} ر.س`, w: CW * 0.4, color: '#10B981' },
      { label: inc.date, w: CW * 0.6 },
    ], i % 2 === 0));
  } else { ctx.fillStyle = '#94A3B8'; ctx.font = '9pt Arial,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('لا توجد إيرادات', W - PAD, y); y += 20; }
  y += 14;

  // ── Expenses ─────────────────────────────────────────────────────────────
  drawSectionTitle('المصاريف');
  const expenses = report.data.expenses.slice(0, 200);
  if (expenses.length) {
    const ew = [CW*0.14, CW*0.3, CW*0.18, CW*0.18, CW*0.2];
    drawTableHeader([
      { label: 'التاريخ', w: ew[0] }, { label: 'النوع', w: ew[1] },
      { label: 'الوصف', w: ew[2] }, { label: 'المبلغ', w: ew[3], align: 'center' }, { label: 'الموظف', w: ew[4] },
    ]);
    expenses.forEach((e, i) => drawTableRow([
      { label: e.date, w: ew[0] }, { label: e.type, w: ew[1] },
      { label: e.description || '—', w: ew[2] },
      { label: `${fmtNum(Number(e.amount))} ر.س`, w: ew[3], align: 'center', color: '#EF4444' },
      { label: e.userName, w: ew[4] },
    ], i % 2 === 0));
  } else { ctx.fillStyle = '#94A3B8'; ctx.font = '9pt Arial,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('لا توجد مصاريف', W - PAD, y); y += 20; }
  y += 14;

  // ── Customers ────────────────────────────────────────────────────────────
  drawSectionTitle('الزبائن');
  if (report.data.customers.length) {
    const cw = [CW*0.25, CW*0.2, CW*0.2, CW*0.2, CW*0.15];
    drawTableHeader([
      { label: 'الاسم', w: cw[0] }, { label: 'العائلة', w: cw[1] },
      { label: 'الهاتف', w: cw[2] },
      { label: 'الرصيد', w: cw[3], align: 'center' }, { label: 'الحالة', w: cw[4], align: 'center' },
    ]);
    report.data.customers.forEach((c, i) => drawTableRow([
      { label: c.name, w: cw[0] }, { label: c.familyName, w: cw[1] },
      { label: c.phone || '—', w: cw[2] },
      { label: `${fmtNum(Number(c.balance) || 0)} ر.س`, w: cw[3], align: 'center', color: (Number(c.balance) || 0) > 0 ? '#EF4444' : '#10B981' },
      { label: c.status === 'active' ? 'نشط' : 'محظور', w: cw[4], align: 'center' },
    ], i % 2 === 0));
  } else { ctx.fillStyle = '#94A3B8'; ctx.font = '9pt Arial,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('لا يوجد زبائن', W - PAD, y); y += 20; }
  y += 14;

  // ── Customer Transactions ──────────────────────────────────────────────
  drawSectionTitle('معاملات الزبائن');
  const ctxs = report.data.customerTransactions.slice(0, 300);
  if (ctxs.length) {
    const tw = [CW*0.13, CW*0.22, CW*0.2, CW*0.12, CW*0.17, CW*0.16];
    drawTableHeader([
      { label: 'التاريخ', w: tw[0] }, { label: 'الزبون', w: tw[1] },
      { label: 'العائلة', w: tw[2] }, { label: 'النوع', w: tw[3], align: 'center' },
      { label: 'المبلغ', w: tw[4], align: 'center' }, { label: 'الرصيد بعد', w: tw[5], align: 'center' },
    ]);
    ctxs.forEach((tx, i) => drawTableRow([
      { label: tx.date, w: tw[0] }, { label: tx.customerName, w: tw[1] },
      { label: tx.familyName, w: tw[2] },
      { label: tx.type === 'debt' ? 'دين' : 'سداد', w: tw[3], align: 'center', color: tx.type === 'debt' ? '#EF4444' : '#10B981' },
      { label: `${fmtNum(Number(tx.amount))} ر.س`, w: tw[4], align: 'center' },
      { label: `${fmtNum(Number(tx.balanceAfter))} ر.س`, w: tw[5], align: 'center' },
    ], i % 2 === 0));
  } else { ctx.fillStyle = '#94A3B8'; ctx.font = '9pt Arial,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('لا توجد معاملات', W - PAD, y); y += 20; }
  y += 14;

  // ── Suppliers ────────────────────────────────────────────────────────────
  drawSectionTitle('الموردون');
  if (report.data.suppliers.length) {
    const sw = [CW*0.4, CW*0.3, CW*0.3];
    drawTableHeader([{ label: 'الاسم', w: sw[0] }, { label: 'الهاتف', w: sw[1] }, { label: 'العنوان', w: sw[2] }]);
    report.data.suppliers.forEach((s, i) => drawTableRow([
      { label: s.name, w: sw[0] }, { label: s.phone || '—', w: sw[1] }, { label: s.address || '—', w: sw[2] },
    ], i % 2 === 0));
  } else { ctx.fillStyle = '#94A3B8'; ctx.font = '9pt Arial,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('لا يوجد موردون', W - PAD, y); y += 20; }
  y += 14;

  // ── Supplier Transactions ─────────────────────────────────────────────
  drawSectionTitle('معاملات الموردين');
  const stxs = report.data.supplierTransactions.slice(0, 300);
  if (stxs.length) {
    const stw = [CW*0.15, CW*0.3, CW*0.15, CW*0.2, CW*0.2];
    drawTableHeader([
      { label: 'التاريخ', w: stw[0] }, { label: 'المورد', w: stw[1] },
      { label: 'النوع', w: stw[2], align: 'center' },
      { label: 'المبلغ', w: stw[3], align: 'center' }, { label: 'الملاحظة', w: stw[4] },
    ]);
    stxs.forEach((tx, i) => drawTableRow([
      { label: tx.date, w: stw[0] }, { label: tx.supplierName, w: stw[1] },
      { label: tx.type === 'debt' ? 'دين' : 'سداد', w: stw[2], align: 'center', color: tx.type === 'debt' ? '#EF4444' : '#10B981' },
      { label: `${fmtNum(Number(tx.amount))} ر.س`, w: stw[3], align: 'center' },
      { label: tx.note || '—', w: stw[4] },
    ], i % 2 === 0));
  } else { ctx.fillStyle = '#94A3B8'; ctx.font = '9pt Arial,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('لا توجد معاملات', W - PAD, y); y += 20; }
  y += 14;

  // ── Orders ────────────────────────────────────────────────────────────
  drawSectionTitle('طلبات الشراء');
  if (report.data.orders.length) {
    const ow = [CW*0.25, CW*0.35, CW*0.2, CW*0.2];
    drawTableHeader([
      { label: 'رقم الطلب', w: ow[0] }, { label: 'المورد', w: ow[1] },
      { label: 'التاريخ', w: ow[2] }, { label: 'الحالة', w: ow[3], align: 'center' },
    ]);
    report.data.orders.forEach((o, i) => drawTableRow([
      { label: o.orderNumber, w: ow[0] }, { label: o.supplierName, w: ow[1] },
      { label: o.date, w: ow[2] },
      { label: o.status === 'delivered' ? 'مُسلَّم' : 'مسودة', w: ow[3], align: 'center' },
    ], i % 2 === 0));
  } else { ctx.fillStyle = '#94A3B8'; ctx.font = '9pt Arial,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('لا توجد طلبات', W - PAD, y); y += 20; }
  y += 14;

  // ── Products ──────────────────────────────────────────────────────────
  drawSectionTitle('المنتجات الناقصة');
  if (report.data.products.length) {
    const pw = [CW*0.25, CW*0.12, CW*0.18, CW*0.18, CW*0.12, CW*0.15];
    drawTableHeader([
      { label: 'المنتج', w: pw[0] }, { label: 'الكمية', w: pw[1], align: 'center' },
      { label: 'القسم', w: pw[2] }, { label: 'الموظف', w: pw[3] },
      { label: 'التاريخ', w: pw[4] }, { label: 'الحالة', w: pw[5], align: 'center' },
    ]);
    report.data.products.forEach((p, i) => drawTableRow([
      { label: p.name, w: pw[0] }, { label: p.quantity, w: pw[1], align: 'center' },
      { label: p.section, w: pw[2] }, { label: p.workerName, w: pw[3] },
      { label: p.date, w: pw[4] },
      { label: p.status === 'resolved' ? 'تم' : 'قيد الانتظار', w: pw[5], align: 'center' },
    ], i % 2 === 0));
  } else { ctx.fillStyle = '#94A3B8'; ctx.font = '9pt Arial,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('لا توجد منتجات ناقصة', W - PAD, y); y += 20; }
  y += 14;

  // ── Tasks ─────────────────────────────────────────────────────────────
  drawSectionTitle('المهام');
  if (report.data.tasks.length) {
    const tkw = [CW*0.3, CW*0.2, CW*0.15, CW*0.15, CW*0.2];
    drawTableHeader([
      { label: 'المهمة', w: tkw[0] }, { label: 'الموظف', w: tkw[1] },
      { label: 'التاريخ', w: tkw[2] },
      { label: 'الأولوية', w: tkw[3], align: 'center' }, { label: 'الحالة', w: tkw[4], align: 'center' },
    ]);
    report.data.tasks.forEach((t, i) => drawTableRow([
      { label: t.title, w: tkw[0] }, { label: t.workerName, w: tkw[1] },
      { label: t.date, w: tkw[2] },
      { label: t.priority === 'high' ? 'عالية' : t.priority === 'medium' ? 'متوسطة' : 'منخفضة', w: tkw[3], align: 'center' },
      { label: t.status === 'done' ? 'منجز' : t.status === 'pending' ? 'قيد الانتظار' : 'مؤجل', w: tkw[4], align: 'center' },
    ], i % 2 === 0));
  } else { ctx.fillStyle = '#94A3B8'; ctx.font = '9pt Arial,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('لا توجد مهام', W - PAD, y); y += 20; }
  y += 14;

  // ── Users ─────────────────────────────────────────────────────────────
  drawSectionTitle('المستخدمون');
  if (report.data.users.length) {
    const uw = [CW*0.25, CW*0.22, CW*0.2, CW*0.15, CW*0.18];
    drawTableHeader([
      { label: 'الاسم', w: uw[0] }, { label: 'اسم المستخدم', w: uw[1] },
      { label: 'الهاتف', w: uw[2] },
      { label: 'الدور', w: uw[3], align: 'center' }, { label: 'الحالة', w: uw[4], align: 'center' },
    ]);
    report.data.users.forEach((u, i) => drawTableRow([
      { label: u.name, w: uw[0] }, { label: u.username, w: uw[1] },
      { label: u.phone || '—', w: uw[2] },
      { label: u.role === 'admin' ? 'مدير' : 'موظف', w: uw[3], align: 'center' },
      { label: u.status === 'active' ? 'نشط' : 'موقوف', w: uw[4], align: 'center' },
    ], i % 2 === 0));
  }
  y += 14;

  // ── Footer on last page ──────────────────────────────────────────────
  checkSpace(40);
  ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 10;
  ctx.fillStyle = '#94A3B8'; ctx.font = '8pt Arial,"Segoe UI",Tahoma,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(`تم إنشاء هذا التقرير بواسطة ${storeName} · ${now()}`, W / 2, y);

  // ── Add page numbers ──────────────────────────────────────────────────
  pages.forEach((pg, pageIdx) => {
    const c = pg.getContext('2d')!;
    c.scale(1, 1); // already scaled
    c.fillStyle = '#94A3B8';
    c.font      = `${8 * PX}pt Arial,"Segoe UI",Tahoma,sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    c.fillText(`صفحة ${pageIdx + 1} من ${pages.length}`, (W * PX) / 2, A4_H * PX - 8);
  });

  // ── Export to jsPDF ───────────────────────────────────────────────────
  const A4_W_MM = 210;
  const A4_H_MM = 297;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  pages.forEach((pg, i) => {
    if (i > 0) pdf.addPage();
    const pgH   = pg.height / PX;
    const pgHMm = (pgH / W) * A4_W_MM;
    pdf.addImage(pg.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, A4_W_MM, Math.min(pgHMm, A4_H_MM));
  });

  return pdf.output('blob');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates the comprehensive report.
 *
 * Native: uses expo-print to produce a real PDF file → returns file:// URI.
 * Web:    builds HTML blob and triggers a direct <a download> to save it,
 *         then returns the blob URL (no window.open / no popup needed).
 */
export async function generateComprehensiveReport(
  report: ReportData,
  storeName = 'سوبيرات الغيث',
  managerName = 'المدير',
): Promise<string> {
  const html = buildReportHTML(report, storeName, managerName);

  if (Platform.OS !== 'web') {
    // Native: expo-print renders HTML → PDF via the platform print engine.
    // Fully supports Arabic RTL text on both iOS and Android.
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    return uri;
  }

  // Web: trigger a direct file download — works inside WebViews and iframes
  // without popup-blocker interference.
  const d     = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const blob  = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url   = URL.createObjectURL(blob);

  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `report-soubeirat-${stamp}.html`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return url;
}

/**
 * Shares / downloads the generated report URI.
 *
 * Native: shares the PDF file via the system share sheet.
 * Web:    download was already triggered in generateComprehensiveReport; no-op.
 */
export async function shareComprehensiveReport(
  uri: string,
  storeName = 'سوبيرات الغيث',
): Promise<void> {
  if (Platform.OS === 'web') {
    // Download was already triggered above — nothing more to do on web.
    return;
  }

  // Native: share the PDF file produced by expo-print.
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    console.warn('Sharing not available on this device');
    return;
  }
  await Sharing.shareAsync(uri, {
    mimeType:    'application/pdf',
    dialogTitle: `التقرير الشامل — ${storeName}`,
    UTI:         'com.adobe.pdf',
  });
}
