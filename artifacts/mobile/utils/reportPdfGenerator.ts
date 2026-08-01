/**
 * Comprehensive PDF report generator for سوبيرات الغيث
 *
 * Native path  → HTML template → expo-print → local file URI
 * Web path     → Canvas 2D pages → jsPDF → blob URL
 *
 * Arabic text is handled by the browser canvas engine (RTL direction).
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { ReportData } from './api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pad2(n: number): string { return String(n).padStart(2, '0'); }

/** Western (Latin) digit formatting — NO Arabic-Indic digits */
function fmtNum(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** Parse "YYYY-MM-DD" or "DD/MM/YYYY" → Date */
function parseDate(s: string): Date {
  if (!s) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s + 'T00:00:00');
  const parts = s.split('/').map(Number);
  if (parts.length === 3 && parts[2] > 1000) return new Date(parts[2], parts[1] - 1, parts[0]);
  return new Date(s);
}

function fmtDate(s: string): string {
  const d = parseDate(s);
  if (isNaN(d.getTime())) return s;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fmtDayName(s: string): string {
  const d = parseDate(s);
  if (isNaN(d.getTime())) return '';
  return DAY_NAMES[d.getDay()];
}

/** Returns "DD/MM/YYYY (اسم اليوم)" */
function fmtDateFull(s: string): string {
  return `${fmtDate(s)} (${fmtDayName(s)})`;
}

/** Normalise time string to HH:MM */
function fmtTime(t: string | null | undefined): string {
  if (!t) return '—';
  return t.slice(0, 5);
}

function now(): string {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} — ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ─── HTML template (native expo-print path) ────────────────────────────────────
function buildReportHTML(report: ReportData, storeName: string, managerName: string): string {
  const { summary, data } = report;

  const logoSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="60" height="60">
    <circle cx="40" cy="40" r="40" fill="#0C4A6E"/>
    <path d="M24 26h4l5 22h14l4-14H33" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="37" cy="52" r="2.5" fill="#fff"/>
    <circle cx="47" cy="52" r="2.5" fill="#fff"/>
  </svg>`;

  function tr(cells: string[], i: number): string {
    return `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  }

  function section(title: string, content: string): string {
    return `<div class="section"><div class="section-title">${title}</div>${content}</div>`;
  }

  function statsGrid(items: { label: string; value: string; color?: string }[]): string {
    return `<div class="stats-grid">${items.map(it =>
      `<div class="stat-card"><div class="stat-label">${it.label}</div><div class="stat-value" style="color:${it.color ?? '#0C4A6E'}">${it.value}</div></div>`
    ).join('')}</div>`;
  }

  // ── Customer families with debt breakdown ───────────────────────────────────
  // Build family → customers map
  const familyMap = new Map<string, { name: string; members: typeof data.customers }>();
  for (const c of data.customers) {
    const fn = c.familyName || 'غير محدد';
    if (!familyMap.has(fn)) familyMap.set(fn, { name: fn, members: [] });
    familyMap.get(fn)!.members.push(c);
  }

  const familiesWithDebt = [...familyMap.values()]
    .map(f => ({
      ...f,
      total: f.members.reduce((s, c) => s + (Number(c.balance) || 0), 0),
    }))
    .sort((a, b) => b.total - a.total);

  const debtFamilies     = familiesWithDebt.filter(f => f.total > 0);
  const settledFamilies  = familiesWithDebt.filter(f => f.total <= 0);

  function familyDetailHTML(f: typeof familiesWithDebt[0]): string {
    const memberRows = f.members.map((c, i) => tr([
      c.name,
      c.phone || '—',
      `<span style="font-weight:700;color:${Number(c.balance) > 0 ? '#DC2626' : '#16A34A'}">${fmtNum(Math.abs(Number(c.balance) || 0))} دج</span>`,
      Number(c.balance) > 0 ? '<span style="color:#DC2626">مديون</span>' : '<span style="color:#16A34A">مصفّى</span>',
      c.status === 'active' ? 'نشط' : 'محظور',
    ], i)).join('');
    return `
      <div class="family-block" style="border:1px solid ${f.total > 0 ? '#FECACA' : '#BBF7D0'};border-radius:8px;margin-bottom:14px;overflow:hidden">
        <div style="background:${f.total > 0 ? '#FEF2F2' : '#F0FDF4'};padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${f.total > 0 ? '#FECACA' : '#BBF7D0'}">
          <span style="font-weight:700;font-size:10.5pt;color:${f.total > 0 ? '#991B1B' : '#166534'}">عائلة: ${f.name}</span>
          <span>${f.members.length} فرد &nbsp;|&nbsp; <strong style="color:${f.total > 0 ? '#DC2626' : '#16A34A'}">${fmtNum(f.total)} دج</strong> &nbsp;|&nbsp; ${f.total > 0 ? '🔴 مديونة' : '✅ مصفّاة'}</span>
        </div>
        <table style="margin:0">
          <thead><tr><th>الاسم</th><th>الهاتف</th><th>الرصيد</th><th>الحالة المالية</th><th>الحالة</th></tr></thead>
          <tbody>${memberRows}</tbody>
        </table>
      </div>`;
  }

  // ── Build rows ───────────────────────────────────────────────────────────────
  const incomeRows     = data.incomes.map((i, idx) => tr([fmtDateFull(i.date), `<strong style="color:#16A34A">${fmtNum(Number(i.amount))} دج</strong>`], idx));
  const expenseRows    = data.expenses.map((e, i) => tr([fmtDateFull(e.date), fmtTime(e.time), e.type, e.description || '—', `<span style="color:#DC2626">${fmtNum(Number(e.amount))} دج</span>`, e.userName], i));
  const customerRows   = data.customers.map((c, i) => tr([c.name, c.familyName, c.phone || '—', `<span style="color:${Number(c.balance) > 0 ? '#DC2626' : '#16A34A'};font-weight:700">${fmtNum(Number(c.balance) || 0)} دج</span>`, c.status === 'active' ? 'نشط' : 'محظور'], i));
  const customerTxRows = data.customerTransactions.map((tx, i) => tr([fmtDateFull(tx.date), fmtTime(tx.time), tx.customerName, tx.familyName, tx.type === 'debt' ? '<span style="color:#DC2626">دين</span>' : '<span style="color:#16A34A">سداد</span>', `${fmtNum(Number(tx.amount))} دج`, `${fmtNum(Number(tx.balanceBefore))} دج`, `<strong>${fmtNum(Number(tx.balanceAfter))} دج</strong>`], i));
  const supplierRows   = data.suppliers.map((s, i) => tr([s.name, s.phone || '—', s.address || '—', s.notes || '—'], i));
  const supplierTxRows = data.supplierTransactions.map((tx, i) => tr([fmtDateFull(tx.date), tx.supplierName, tx.type === 'debt' ? '<span style="color:#DC2626">دين</span>' : '<span style="color:#16A34A">سداد</span>', `${fmtNum(Number(tx.amount))} دج`, tx.note || '—'], i));
  const taskRows       = data.tasks.map((t, i) => tr([fmtDateFull(t.date), fmtTime(t.time), t.title, t.workerName, t.priority === 'high' ? 'عالية' : t.priority === 'medium' ? 'متوسطة' : 'منخفضة', t.status === 'done' ? '<span style="color:#16A34A">منجز</span>' : t.status === 'pending' ? 'قيد الانتظار' : 'مؤجل'], i));
  const productRows    = data.products.map((p, i) => tr([fmtDateFull(p.date), p.name, p.quantity, p.section, p.workerName, p.status === 'resolved' ? '<span style="color:#16A34A">تم التوفير</span>' : 'لم يُوفَّر'], i));
  const orderRows      = data.orders.map((o, i) => tr([fmtDateFull(o.date), o.orderNumber, o.supplierName, o.status === 'delivered' ? '<span style="color:#16A34A">مُسلَّم</span>' : 'مسودة'], i));
  const userRows       = data.users.map((u, i) => tr([u.name, u.username, u.phone || '—', u.role === 'admin' ? 'مدير' : u.role === 'supervisor' ? 'مشرف' : 'موظف', u.status === 'active' ? 'نشط' : 'موقوف'], i));
  const notifRows      = data.notifications.map((n, i) => tr([fmtDateFull(n.date), fmtTime(n.time), n.message, n.type, n.isRead ? 'مقروء' : 'غير مقروء'], i));

  const empty = (msg = 'لا توجد سجلات') => `<p class="empty">${msg}</p>`;
  const tbl   = (head: string[], rows: string | string[], note = '') => {
    const body = Array.isArray(rows) ? rows.join('') : rows;
    return body
      ? `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>${note}`
      : empty();
  };

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>التقرير الشامل — ${storeName}</title>
<style>
@page { size: A4; margin: 14mm 15mm 18mm 15mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 9pt; color: #1E293B; direction: rtl; background: #fff; }
.header { display: flex; align-items: center; gap: 14px; padding-bottom: 12px; border-bottom: 3px solid #0C4A6E; margin-bottom: 18px; }
.store-name { font-size: 18pt; font-weight: 700; color: #0C4A6E; }
.store-sub  { font-size: 8.5pt; color: #64748B; margin-top: 2px; }
.report-meta { margin-right: auto; text-align: left; font-size: 8.5pt; color: #64748B; }
.section { margin-bottom: 20px; page-break-inside: avoid; }
.section-title { font-size: 10.5pt; font-weight: 700; color: #0C4A6E; padding-right: 9px; border-right: 4px solid #0EA5E9; margin-bottom: 9px; }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-bottom: 6px; }
.stat-card  { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 7px; padding: 9px 11px; text-align: right; }
.stat-label { font-size: 7.5pt; color: #94A3B8; font-weight: 700; margin-bottom: 2px; }
.stat-value { font-size: 12pt; font-weight: 700; }
table { width: 100%; border-collapse: collapse; font-size: 8pt; }
th  { background: #0C4A6E; color: #fff; padding: 7px 9px; font-weight: 700; text-align: right; }
td  { padding: 6px 9px; border-bottom: 1px solid #E2E8F0; vertical-align: middle; }
tr.even { background: #F8FAFC; }
tr.odd  { background: #fff; }
.footer { border-top: 1px solid #E2E8F0; padding-top: 9px; text-align: center; color: #94A3B8; font-size: 7.5pt; margin-top: 14px; }
.page-break { page-break-before: always; }
.empty { color: #94A3B8; font-style: italic; padding: 12px 0; text-align: center; font-size: 8.5pt; }
.note  { font-size: 7.5pt; color: #94A3B8; padding: 4px 0; }
h4 { font-size: 9.5pt; color: #475569; margin: 12px 0 6px; }
</style>
</head>
<body>

<div class="header">
  <div>${logoSVG}</div>
  <div>
    <div class="store-name">${storeName}</div>
    <div class="store-sub">التقرير الشامل لنظام الإدارة</div>
  </div>
  <div class="report-meta">
    <div>المدير: ${managerName}</div>
    <div>تاريخ الإنشاء: ${now()}</div>
  </div>
</div>

${section('الملخص العام', statsGrid([
  { label: 'إجمالي الإيرادات',   value: `${fmtNum(summary.totalIncome)} دج`,      color: '#16A34A' },
  { label: 'إجمالي المصاريف',    value: `${fmtNum(summary.totalExpenses)} دج`,    color: '#DC2626' },
  { label: 'صافي الأرباح',        value: `${fmtNum(summary.netProfit)} دج`,        color: summary.netProfit >= 0 ? '#16A34A' : '#DC2626' },
  { label: 'ديون الزبائن',        value: `${fmtNum(summary.totalCustomerDebt)} دج`, color: '#D97706' },
  { label: 'ديون الموردين',       value: `${fmtNum(summary.totalSupplierDebt)} دج`, color: '#7C3AED' },
  { label: 'عدد العائلات',        value: String(summary.customerFamilyCount) },
  { label: 'عدد الزبائن',         value: String(summary.customerCount) },
  { label: 'عدد الموردين',        value: String(summary.supplierCount) },
  { label: 'المنتجات الناقصة',   value: String(summary.productCount) },
  { label: 'عدد المهام',          value: String(summary.taskCount) },
  { label: 'طلبات الشراء',        value: String(summary.orderCount) },
  { label: 'عدد الموظفين',        value: String(summary.userCount) },
]))}

${section('الإيرادات اليومية', tbl(
  ['التاريخ واليوم', 'المبلغ'],
  incomeRows,
))}

${section('المصاريف', tbl(
  ['التاريخ واليوم', 'الوقت', 'النوع', 'الوصف', 'المبلغ', 'الموظف'],
  expenseRows,
  data.expenses.length > 500 ? `<p class="note">يُعرض أحدث 500 سجل من أصل ${data.expenses.length}</p>` : '',
))}

<div class="page-break"></div>

${section('العائلات — تفصيل شامل', `
  <div style="display:flex;gap:14px;margin-bottom:14px">
    <div class="stat-card" style="flex:1;border-color:#FECACA;background:#FEF2F2">
      <div class="stat-label">عائلات مديونة</div>
      <div class="stat-value" style="color:#DC2626">${debtFamilies.length}</div>
    </div>
    <div class="stat-card" style="flex:1;border-color:#BBF7D0;background:#F0FDF4">
      <div class="stat-label">عائلات مصفّاة (لا دين)</div>
      <div class="stat-value" style="color:#16A34A">${settledFamilies.length}</div>
    </div>
    <div class="stat-card" style="flex:1">
      <div class="stat-label">إجمالي الديون المتبقية</div>
      <div class="stat-value" style="color:#D97706">${fmtNum(debtFamilies.reduce((s, f) => s + f.total, 0))} دج</div>
    </div>
  </div>

  ${debtFamilies.length ? `<h4>🔴 العائلات المديونة (${debtFamilies.length})</h4>` : ''}
  ${debtFamilies.map(f => familyDetailHTML(f)).join('')}

  ${settledFamilies.length ? `<h4>✅ العائلات المصفّاة (${settledFamilies.length})</h4>` : ''}
  ${settledFamilies.map(f => familyDetailHTML(f)).join('')}
`)}

${section('معاملات الزبائن — تفصيل كامل', tbl(
  ['التاريخ واليوم', 'الوقت', 'الزبون', 'العائلة', 'النوع', 'المبلغ', 'الرصيد قبل', 'الرصيد بعد'],
  data.customerTransactions.slice(0, 500).map((tx, i) =>
    tr([fmtDateFull(tx.date), fmtTime((tx as any).time), tx.customerName, tx.familyName,
      tx.type === 'debt' ? '<span style="color:#DC2626">دين</span>' : '<span style="color:#16A34A">سداد</span>',
      `${fmtNum(Number(tx.amount))} دج`,
      `${fmtNum(Number(tx.balanceBefore))} دج`,
      `<strong>${fmtNum(Number(tx.balanceAfter))} دج</strong>`], i)
  ).join(''),
  data.customerTransactions.length > 500 ? `<p class="note">يُعرض أحدث 500 سجل من أصل ${data.customerTransactions.length}</p>` : '',
))}

<div class="page-break"></div>

${section('الموردون', tbl(
  ['الاسم', 'الهاتف', 'العنوان', 'ملاحظات'],
  supplierRows,
))}

${section('معاملات الموردين — تفصيل كامل', tbl(
  ['التاريخ واليوم', 'المورد', 'النوع', 'المبلغ', 'الملاحظة'],
  supplierTxRows,
  data.supplierTransactions.length > 500 ? `<p class="note">يُعرض أحدث 500 سجل من أصل ${data.supplierTransactions.length}</p>` : '',
))}

<div class="page-break"></div>

${section('طلبات الشراء', tbl(
  ['التاريخ واليوم', 'رقم الطلب', 'المورد', 'الحالة'],
  orderRows,
))}

${section('المنتجات الناقصة', tbl(
  ['التاريخ واليوم', 'المنتج', 'الكمية', 'القسم', 'الموظف', 'الحالة'],
  productRows,
))}

${section('المهام', tbl(
  ['التاريخ واليوم', 'الوقت', 'المهمة', 'الموظف', 'الأولوية', 'الحالة'],
  taskRows,
))}

${section('الزبائن — القائمة الكاملة', tbl(
  ['الاسم', 'العائلة', 'الهاتف', 'الرصيد', 'الحالة'],
  customerRows,
))}

${section('المستخدمون', tbl(
  ['الاسم', 'اسم المستخدم', 'الهاتف', 'الدور', 'الحالة'],
  userRows,
))}

${section('الإشعارات', tbl(
  ['التاريخ واليوم', 'الوقت', 'الرسالة', 'النوع', 'الحالة'],
  notifRows,
))}

<div class="footer">
  تم إنشاء هذا التقرير بواسطة <strong>${storeName}</strong> — نظام إدارة السوبرماركت · ${now()}
</div>
</body>
</html>`;
}

// ─── Canvas-based multi-page PDF (web / Median.co WebView) ──────────────────
async function buildReportBlobCanvas(report: ReportData, storeName: string, managerName: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');

  const W      = 794;
  const A4_H   = 1123;
  const PAD    = 40;
  const PX     = 1.5;
  const CW     = W - PAD * 2;

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
    y = 38;
  }

  function checkSpace(needed: number) {
    if (y + needed > A4_H - 48) newPage();
  }

  function drawDivider(color = '#E2E8F0', weight = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth   = weight;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 8;
  }

  function drawText(text: string, x: number, size: number, color: string, align: 'right' | 'center' | 'left' = 'right', bold = false) {
    ctx.fillStyle    = color;
    ctx.font         = `${bold ? 'bold ' : ''}${size}pt Arial, "Segoe UI", Tahoma, sans-serif`;
    ctx.textAlign    = align;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  function drawSectionTitle(title: string) {
    checkSpace(42);
    ctx.fillStyle = '#0EA5E9';
    ctx.fillRect(W - PAD - 4, y + 4, 4, 20);
    drawText(title, W - PAD - 10, 10.5, '#0C4A6E', 'right', true);
    y += 32;
  }

  type ColDef = { label: string; w: number; align?: 'right' | 'center' };

  function drawTableHeader(cols: ColDef[]) {
    checkSpace(34);
    ctx.fillStyle = '#0C4A6E';
    ctx.fillRect(PAD, y, CW, 34);
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 8pt Arial, "Segoe UI", Tahoma, sans-serif';
    ctx.textBaseline = 'middle';
    let xc = PAD;
    cols.forEach(col => {
      ctx.textAlign = col.align ?? 'right';
      const tx = col.align === 'center' ? xc + col.w / 2 : xc + col.w - 7;
      ctx.fillText(col.label, tx, y + 17);
      xc += col.w;
    });
    y += 34;
  }

  type DataColDef = { label: string; w: number; align?: 'right' | 'center'; color?: string };

  function drawTableRow(cols: DataColDef[], even: boolean) {
    const ROW_H = 28;
    checkSpace(ROW_H);
    ctx.fillStyle = even ? '#F8FAFC' : '#ffffff';
    ctx.fillRect(PAD, y, CW, ROW_H);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(PAD, y + ROW_H); ctx.lineTo(W - PAD, y + ROW_H); ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.font = '8pt Arial, "Segoe UI", Tahoma, sans-serif';
    let xc = PAD;
    cols.forEach(col => {
      ctx.fillStyle = col.color ?? '#1E293B';
      ctx.textAlign = col.align ?? 'right';
      const tx = col.align === 'center' ? xc + col.w / 2 : xc + col.w - 7;
      let t = col.label;
      const maxW = col.w - 14;
      while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -1);
      if (t.length < col.label.length) t = t.slice(0, -1) + '…';
      ctx.fillText(t, tx, y + 14);
      xc += col.w;
    });
    y += ROW_H;
  }

  function drawStatCard(label: string, value: string, color: string, x: number, w: number, h = 58) {
    ctx.fillStyle   = '#F8FAFC';
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect?.(x, y, w, h, 7);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle    = '#94A3B8';
    ctx.font         = 'bold 7pt Arial, "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x + w - 9, y + 9);
    ctx.fillStyle    = color;
    ctx.font         = 'bold 11pt Arial, "Segoe UI", Tahoma, sans-serif';
    ctx.fillText(value, x + w - 9, y + 26);
  }

  // ── Build pages ────────────────────────────────────────────────────────────
  newPage();

  // Header
  ctx.fillStyle = '#0C4A6E';
  ctx.beginPath(); ctx.arc(PAD + 26, y + 26, 26, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#0C4A6E';
  ctx.font = 'bold 16pt Arial, "Segoe UI", Tahoma, sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(storeName, W - PAD, y);
  ctx.fillStyle = '#64748B';
  ctx.font = '8.5pt Arial, "Segoe UI", Tahoma, sans-serif';
  ctx.fillText('التقرير الشامل لنظام الإدارة', W - PAD, y + 20);
  ctx.fillText(`المدير: ${managerName}   |   وقت الإنشاء: ${now()}`, W - PAD, y + 36);
  y += 66;
  drawDivider('#0C4A6E', 2);
  y += 4;

  // Summary stats
  const { summary } = report;
  const statCols = 3;
  const statW    = Math.floor(CW / statCols) - 6;
  const statsData = [
    { label: 'إجمالي الإيرادات',  value: `${fmtNum(summary.totalIncome)} دج`,      color: '#16A34A' },
    { label: 'إجمالي المصاريف',   value: `${fmtNum(summary.totalExpenses)} دج`,    color: '#DC2626' },
    { label: 'صافي الأرباح',       value: `${fmtNum(summary.netProfit)} دج`,        color: summary.netProfit >= 0 ? '#16A34A' : '#DC2626' },
    { label: 'ديون الزبائن',       value: `${fmtNum(summary.totalCustomerDebt)} دج`, color: '#D97706' },
    { label: 'ديون الموردين',      value: `${fmtNum(summary.totalSupplierDebt)} دج`, color: '#7C3AED' },
    { label: 'عدد الزبائن',        value: String(summary.customerCount),            color: '#0EA5E9' },
    { label: 'عدد الموردين',       value: String(summary.supplierCount),            color: '#0369A1' },
    { label: 'المهام',             value: String(summary.taskCount),                color: '#6366F1' },
    { label: 'المنتجات الناقصة',  value: String(summary.productCount),             color: '#EC4899' },
  ];

  drawSectionTitle('الملخص العام');
  for (let row = 0; row < Math.ceil(statsData.length / statCols); row++) {
    checkSpace(66);
    for (let col = 0; col < statCols; col++) {
      const idx = row * statCols + col;
      if (idx >= statsData.length) break;
      drawStatCard(statsData[idx].label, statsData[idx].value, statsData[idx].color, PAD + col * (statW + 6), statW);
    }
    y += 64;
  }
  y += 6;

  // ── Incomes ──────────────────────────────────────────────────────────────
  drawSectionTitle('الإيرادات اليومية');
  if (report.data.incomes.length) {
    drawTableHeader([{ label: 'المبلغ', w: CW * 0.35, align: 'center' }, { label: 'التاريخ واليوم', w: CW * 0.65 }]);
    report.data.incomes.forEach((inc, i) => drawTableRow([
      { label: `${fmtNum(Number(inc.amount))} دج`, w: CW * 0.35, align: 'center', color: '#16A34A' },
      { label: fmtDateFull(inc.date), w: CW * 0.65 },
    ], i % 2 === 0));
  } else { drawText('لا توجد إيرادات', W - PAD, 8.5, '#94A3B8'); y += 18; }
  y += 12;

  // ── Expenses ─────────────────────────────────────────────────────────────
  drawSectionTitle('المصاريف');
  const expenses = report.data.expenses.slice(0, 500);
  if (expenses.length) {
    const ew = [CW*0.22, CW*0.08, CW*0.22, CW*0.18, CW*0.16, CW*0.14];
    drawTableHeader([
      { label: 'التاريخ واليوم', w: ew[0] }, { label: 'الوقت', w: ew[1], align: 'center' },
      { label: 'النوع', w: ew[2] }, { label: 'الوصف', w: ew[3] },
      { label: 'المبلغ', w: ew[4], align: 'center' }, { label: 'الموظف', w: ew[5] },
    ]);
    expenses.forEach((e, i) => drawTableRow([
      { label: fmtDateFull(e.date), w: ew[0] },
      { label: fmtTime(e.time), w: ew[1], align: 'center', color: '#64748B' },
      { label: e.type, w: ew[2] },
      { label: e.description || '—', w: ew[3], color: '#475569' },
      { label: `${fmtNum(Number(e.amount))} دج`, w: ew[4], align: 'center', color: '#DC2626' },
      { label: e.userName, w: ew[5] },
    ], i % 2 === 0));
  } else { drawText('لا توجد مصاريف', W - PAD, 8.5, '#94A3B8'); y += 18; }
  y += 12;

  // ── Customer Families Summary ──────────────────────────────────────────
  const familyMap = new Map<string, { name: string; members: typeof report.data.customers }>();
  for (const c of report.data.customers) {
    const fn = c.familyName || 'غير محدد';
    if (!familyMap.has(fn)) familyMap.set(fn, { name: fn, members: [] });
    familyMap.get(fn)!.members.push(c);
  }
  const allFamilies = [...familyMap.values()]
    .map(f => ({ ...f, total: f.members.reduce((s, c) => s + (Number(c.balance) || 0), 0) }))
    .sort((a, b) => b.total - a.total);

  const debtFams    = allFamilies.filter(f => f.total > 0);
  const settledFams = allFamilies.filter(f => f.total <= 0);

  drawSectionTitle(`العائلات — تفصيل شامل (مديونة: ${debtFams.length} | مصفّاة: ${settledFams.length})`);

  // Debt families
  if (debtFams.length) {
    // Summary table first
    drawTableHeader([
      { label: 'العائلة', w: CW * 0.35 }, { label: 'عدد الأفراد', w: CW * 0.2, align: 'center' },
      { label: 'إجمالي الدين', w: CW * 0.25, align: 'center' }, { label: 'الحالة', w: CW * 0.2, align: 'center' },
    ]);
    debtFams.forEach((f, i) => drawTableRow([
      { label: f.name, w: CW * 0.35, color: '#991B1B' },
      { label: String(f.members.length), w: CW * 0.2, align: 'center' },
      { label: `${fmtNum(f.total)} دج`, w: CW * 0.25, align: 'center', color: '#DC2626' },
      { label: '🔴 مديونة', w: CW * 0.2, align: 'center', color: '#DC2626' },
    ], i % 2 === 0));
    y += 10;

    // Per-family member detail
    for (const f of debtFams) {
      checkSpace(40);
      ctx.fillStyle = '#FEF2F2';
      ctx.strokeStyle = '#FECACA';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect?.(PAD, y, CW, 26, 5); ctx.fill(); ctx.stroke();
      drawText(`▶ عائلة: ${f.name}  |  إجمالي الدين: ${fmtNum(f.total)} دج`, W - PAD - 8, 9, '#991B1B', 'right', true);
      y += 30;

      const mw = [CW*0.4, CW*0.25, CW*0.2, CW*0.15];
      drawTableHeader([
        { label: 'اسم الزبون', w: mw[0] }, { label: 'الهاتف', w: mw[1] },
        { label: 'الرصيد', w: mw[2], align: 'center' }, { label: 'الحالة', w: mw[3], align: 'center' },
      ]);
      f.members.forEach((c, i) => drawTableRow([
        { label: c.name, w: mw[0] },
        { label: c.phone || '—', w: mw[1], color: '#475569' },
        { label: `${fmtNum(Math.abs(Number(c.balance) || 0))} دج`, w: mw[2], align: 'center', color: Number(c.balance) > 0 ? '#DC2626' : '#16A34A' },
        { label: Number(c.balance) > 0 ? 'مديون' : 'مصفّى', w: mw[3], align: 'center', color: Number(c.balance) > 0 ? '#DC2626' : '#16A34A' },
      ], i % 2 === 0));
      y += 8;
    }
  }

  // Settled families
  if (settledFams.length) {
    checkSpace(40);
    drawText(`✅ العائلات المصفّاة (${settledFams.length})`, W - PAD, 9.5, '#166534', 'right', true);
    y += 22;
    drawTableHeader([
      { label: 'العائلة', w: CW * 0.4 }, { label: 'عدد الأفراد', w: CW * 0.3, align: 'center' },
      { label: 'الحالة', w: CW * 0.3, align: 'center' },
    ]);
    settledFams.forEach((f, i) => drawTableRow([
      { label: f.name, w: CW * 0.4, color: '#166534' },
      { label: String(f.members.length), w: CW * 0.3, align: 'center' },
      { label: '✅ مصفّاة', w: CW * 0.3, align: 'center', color: '#16A34A' },
    ], i % 2 === 0));
  }
  y += 14;

  // ── Customer Transactions ────────────────────────────────────────────────
  drawSectionTitle('معاملات الزبائن — تفصيل كامل');
  const ctxData = report.data.customerTransactions.slice(0, 500);
  if (ctxData.length) {
    const tw = [CW*0.18, CW*0.07, CW*0.18, CW*0.15, CW*0.09, CW*0.12, CW*0.1, CW*0.11];
    drawTableHeader([
      { label: 'التاريخ واليوم', w: tw[0] }, { label: 'الوقت', w: tw[1], align: 'center' },
      { label: 'الزبون', w: tw[2] }, { label: 'العائلة', w: tw[3] },
      { label: 'النوع', w: tw[4], align: 'center' },
      { label: 'المبلغ', w: tw[5], align: 'center' },
      { label: 'قبل', w: tw[6], align: 'center' },
      { label: 'بعد', w: tw[7], align: 'center' },
    ]);
    ctxData.forEach((tx, i) => drawTableRow([
      { label: fmtDateFull(tx.date), w: tw[0] },
      { label: fmtTime((tx as any).time), w: tw[1], align: 'center', color: '#64748B' },
      { label: tx.customerName, w: tw[2] },
      { label: tx.familyName, w: tw[3], color: '#475569' },
      { label: tx.type === 'debt' ? 'دين' : 'سداد', w: tw[4], align: 'center', color: tx.type === 'debt' ? '#DC2626' : '#16A34A' },
      { label: `${fmtNum(Number(tx.amount))} دج`, w: tw[5], align: 'center' },
      { label: `${fmtNum(Number(tx.balanceBefore))} دج`, w: tw[6], align: 'center', color: '#64748B' },
      { label: `${fmtNum(Number(tx.balanceAfter))} دج`, w: tw[7], align: 'center', color: Number(tx.balanceAfter) > 0 ? '#DC2626' : '#16A34A' },
    ], i % 2 === 0));
  } else { drawText('لا توجد معاملات', W - PAD, 8.5, '#94A3B8'); y += 18; }
  y += 14;

  // ── Suppliers ────────────────────────────────────────────────────────────
  drawSectionTitle('الموردون');
  if (report.data.suppliers.length) {
    const sw = [CW*0.35, CW*0.25, CW*0.25, CW*0.15];
    drawTableHeader([{ label: 'الاسم', w: sw[0] }, { label: 'الهاتف', w: sw[1] }, { label: 'العنوان', w: sw[2] }, { label: 'ملاحظات', w: sw[3] }]);
    report.data.suppliers.forEach((s, i) => drawTableRow([
      { label: s.name, w: sw[0] }, { label: s.phone || '—', w: sw[1], color: '#475569' },
      { label: s.address || '—', w: sw[2], color: '#475569' }, { label: s.notes || '—', w: sw[3], color: '#475569' },
    ], i % 2 === 0));
  } else { drawText('لا يوجد موردون', W - PAD, 8.5, '#94A3B8'); y += 18; }
  y += 12;

  // ── Supplier Transactions ────────────────────────────────────────────────
  drawSectionTitle('معاملات الموردين — تفصيل كامل');
  const stxData = report.data.supplierTransactions.slice(0, 500);
  if (stxData.length) {
    const stw = [CW*0.24, CW*0.28, CW*0.12, CW*0.18, CW*0.18];
    drawTableHeader([
      { label: 'التاريخ واليوم', w: stw[0] }, { label: 'المورد', w: stw[1] },
      { label: 'النوع', w: stw[2], align: 'center' }, { label: 'المبلغ', w: stw[3], align: 'center' },
      { label: 'الملاحظة', w: stw[4] },
    ]);
    stxData.forEach((tx, i) => drawTableRow([
      { label: fmtDateFull(tx.date), w: stw[0] },
      { label: tx.supplierName, w: stw[1] },
      { label: tx.type === 'debt' ? 'دين' : 'سداد', w: stw[2], align: 'center', color: tx.type === 'debt' ? '#DC2626' : '#16A34A' },
      { label: `${fmtNum(Number(tx.amount))} دج`, w: stw[3], align: 'center' },
      { label: tx.note || '—', w: stw[4], color: '#475569' },
    ], i % 2 === 0));
  } else { drawText('لا توجد معاملات', W - PAD, 8.5, '#94A3B8'); y += 18; }
  y += 14;

  // ── Orders ────────────────────────────────────────────────────────────────
  drawSectionTitle('طلبات الشراء');
  if (report.data.orders.length) {
    const ow = [CW*0.28, CW*0.2, CW*0.35, CW*0.17];
    drawTableHeader([
      { label: 'التاريخ واليوم', w: ow[0] }, { label: 'رقم الطلب', w: ow[1] },
      { label: 'المورد', w: ow[2] }, { label: 'الحالة', w: ow[3], align: 'center' },
    ]);
    report.data.orders.forEach((o, i) => drawTableRow([
      { label: fmtDateFull(o.date), w: ow[0] }, { label: o.orderNumber, w: ow[1], color: '#475569' },
      { label: o.supplierName, w: ow[2] },
      { label: o.status === 'delivered' ? 'مُسلَّم' : 'مسودة', w: ow[3], align: 'center', color: o.status === 'delivered' ? '#16A34A' : '#64748B' },
    ], i % 2 === 0));
  } else { drawText('لا توجد طلبات', W - PAD, 8.5, '#94A3B8'); y += 18; }
  y += 12;

  // ── Products ──────────────────────────────────────────────────────────────
  drawSectionTitle('المنتجات الناقصة');
  if (report.data.products.length) {
    const pw = [CW*0.23, CW*0.22, CW*0.1, CW*0.16, CW*0.16, CW*0.13];
    drawTableHeader([
      { label: 'التاريخ واليوم', w: pw[0] }, { label: 'المنتج', w: pw[1] },
      { label: 'الكمية', w: pw[2], align: 'center' }, { label: 'القسم', w: pw[3] },
      { label: 'الموظف', w: pw[4] }, { label: 'الحالة', w: pw[5], align: 'center' },
    ]);
    report.data.products.forEach((p, i) => drawTableRow([
      { label: fmtDateFull(p.date), w: pw[0] }, { label: p.name, w: pw[1] },
      { label: p.quantity, w: pw[2], align: 'center' }, { label: p.section, w: pw[3] },
      { label: p.workerName, w: pw[4] },
      { label: p.status === 'resolved' ? 'تم' : 'قيد الانتظار', w: pw[5], align: 'center', color: p.status === 'resolved' ? '#16A34A' : '#D97706' },
    ], i % 2 === 0));
  } else { drawText('لا توجد منتجات ناقصة', W - PAD, 8.5, '#94A3B8'); y += 18; }
  y += 12;

  // ── Tasks ─────────────────────────────────────────────────────────────────
  drawSectionTitle('المهام');
  if (report.data.tasks.length) {
    const tkw = [CW*0.22, CW*0.07, CW*0.28, CW*0.18, CW*0.13, CW*0.12];
    drawTableHeader([
      { label: 'التاريخ واليوم', w: tkw[0] }, { label: 'الوقت', w: tkw[1], align: 'center' },
      { label: 'المهمة', w: tkw[2] }, { label: 'الموظف', w: tkw[3] },
      { label: 'الأولوية', w: tkw[4], align: 'center' }, { label: 'الحالة', w: tkw[5], align: 'center' },
    ]);
    report.data.tasks.forEach((t, i) => drawTableRow([
      { label: fmtDateFull(t.date), w: tkw[0] },
      { label: fmtTime(t.time), w: tkw[1], align: 'center', color: '#64748B' },
      { label: t.title, w: tkw[2] }, { label: t.workerName, w: tkw[3] },
      { label: t.priority === 'high' ? 'عالية' : t.priority === 'medium' ? 'متوسطة' : 'منخفضة', w: tkw[4], align: 'center', color: t.priority === 'high' ? '#DC2626' : t.priority === 'medium' ? '#D97706' : '#64748B' },
      { label: t.status === 'done' ? 'منجز' : t.status === 'pending' ? 'انتظار' : 'مؤجل', w: tkw[5], align: 'center', color: t.status === 'done' ? '#16A34A' : '#64748B' },
    ], i % 2 === 0));
  } else { drawText('لا توجد مهام', W - PAD, 8.5, '#94A3B8'); y += 18; }
  y += 12;

  // ── Users ─────────────────────────────────────────────────────────────────
  drawSectionTitle('المستخدمون');
  if (report.data.users.length) {
    const uw = [CW*0.27, CW*0.22, CW*0.22, CW*0.15, CW*0.14];
    drawTableHeader([
      { label: 'الاسم', w: uw[0] }, { label: 'اسم المستخدم', w: uw[1] },
      { label: 'الهاتف', w: uw[2] }, { label: 'الدور', w: uw[3], align: 'center' },
      { label: 'الحالة', w: uw[4], align: 'center' },
    ]);
    report.data.users.forEach((u, i) => drawTableRow([
      { label: u.name, w: uw[0] }, { label: u.username, w: uw[1], color: '#475569' },
      { label: u.phone || '—', w: uw[2], color: '#475569' },
      { label: u.role === 'admin' ? 'مدير' : u.role === 'supervisor' ? 'مشرف' : 'موظف', w: uw[3], align: 'center' },
      { label: u.status === 'active' ? 'نشط' : 'موقوف', w: uw[4], align: 'center', color: u.status === 'active' ? '#16A34A' : '#DC2626' },
    ], i % 2 === 0));
  } else { drawText('لا يوجد مستخدمون', W - PAD, 8.5, '#94A3B8'); y += 18; }
  y += 12;

  // ── Notifications ─────────────────────────────────────────────────────────
  drawSectionTitle('الإشعارات');
  if (report.data.notifications.length) {
    const nw = [CW*0.22, CW*0.07, CW*0.45, CW*0.14, CW*0.12];
    drawTableHeader([
      { label: 'التاريخ واليوم', w: nw[0] }, { label: 'الوقت', w: nw[1], align: 'center' },
      { label: 'الرسالة', w: nw[2] }, { label: 'النوع', w: nw[3], align: 'center' },
      { label: 'الحالة', w: nw[4], align: 'center' },
    ]);
    report.data.notifications.forEach((n, i) => drawTableRow([
      { label: fmtDateFull(n.date), w: nw[0] },
      { label: fmtTime(n.time), w: nw[1], align: 'center', color: '#64748B' },
      { label: n.message, w: nw[2], color: '#475569' },
      { label: n.type, w: nw[3], align: 'center', color: '#64748B' },
      { label: n.isRead ? 'مقروء' : 'غير مقروء', w: nw[4], align: 'center', color: n.isRead ? '#16A34A' : '#D97706' },
    ], i % 2 === 0));
  } else { drawText('لا توجد إشعارات', W - PAD, 8.5, '#94A3B8'); y += 18; }
  y += 14;

  // ── Footer ────────────────────────────────────────────────────────────────
  checkSpace(36);
  drawDivider('#E2E8F0', 1);
  y += 2;
  ctx.fillStyle = '#94A3B8';
  ctx.font = '7.5pt Arial,"Segoe UI",Tahoma,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(`تم إنشاء هذا التقرير بواسطة ${storeName} · ${now()}`, W / 2, y);

  // ── Page numbers ───────────────────────────────────────────────────────────
  pages.forEach((pg, pageIdx) => {
    const c = pg.getContext('2d')!;
    c.fillStyle = '#94A3B8';
    c.font = `${7.5 * PX}pt Arial,"Segoe UI",Tahoma,sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.fillText(`صفحة ${pageIdx + 1} من ${pages.length}`, (W * PX) / 2, A4_H * PX - 6);
  });

  // ── Export ─────────────────────────────────────────────────────────────────
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
 * Native: expo-print → PDF file URI.
 * Web:    Canvas → jsPDF → direct PDF download.
 */
export async function generateComprehensiveReport(
  report: ReportData,
  storeName = 'سوبيرات الغيث',
  managerName = 'المدير',
): Promise<string> {
  const html = buildReportHTML(report, storeName, managerName);

  if (Platform.OS !== 'web') {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    return uri;
  }

  // Web: build real PDF blob and trigger direct download
  const d     = new Date();
  const stamp = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const blob  = await buildReportBlobCanvas(report, storeName, managerName);
  const url   = URL.createObjectURL(blob);

  const a         = document.createElement('a');
  a.href          = url;
  a.download      = `تقرير-سوبيرات-${stamp}.pdf`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return url;
}

/**
 * Shares the generated report URI (native only; web download already triggered).
 */
export async function shareComprehensiveReport(
  uri: string,
  storeName = 'سوبيرات الغيث',
): Promise<void> {
  if (Platform.OS === 'web') return;

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) { console.warn('Sharing not available on this device'); return; }
  await Sharing.shareAsync(uri, {
    mimeType:    'application/pdf',
    dialogTitle: `التقرير الشامل — ${storeName}`,
    UTI:         'com.adobe.pdf',
  });
}
