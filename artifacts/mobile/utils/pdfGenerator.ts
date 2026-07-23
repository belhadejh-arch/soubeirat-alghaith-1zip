import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { PurchaseOrder } from '@/types';

function pad(n: number): string { return String(n).padStart(2, '0'); }

// ─── HTML Template (native expo-print path only) ──────────────────────────────
function buildOrderHTML(order: PurchaseOrder): string {
  const now = new Date();
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const rows = order.items
    .map(
      (item, idx) => `
        <tr class="${idx % 2 === 0 ? 'even' : 'odd'}">
          <td class="qty">${item.quantity}</td>
          <td class="name">${item.name}</td>
          <td class="num">${idx + 1}</td>
        </tr>`,
    )
    .join('');

  const logoSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="72" height="72">
    <circle cx="40" cy="40" r="40" fill="#0C4A6E"/>
    <path d="M24 26h4l5 22h14l4-14H33" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="37" cy="52" r="2.5" fill="#fff"/>
    <circle cx="47" cy="52" r="2.5" fill="#fff"/>
  </svg>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>وصل طلب – ${order.supplierName}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 11pt; color: #1E293B; direction: rtl; background: #fff; }
  .header { display: flex; align-items: center; gap: 18px; padding-bottom: 18px; border-bottom: 3px solid #0C4A6E; margin-bottom: 22px; }
  .logo { width: 72px; height: 72px; flex-shrink: 0; border-radius: 50%; overflow: hidden; }
  .header-info { flex: 1; }
  .store-name { font-size: 22pt; font-weight: 700; color: #0C4A6E; }
  .store-sub { font-size: 10pt; color: #64748B; margin-top: 3px; }
  .receipt-badge { background: #0C4A6E; color: #fff; padding: 6px 20px; border-radius: 8px; font-size: 14pt; font-weight: 700; flex-shrink: 0; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
  .meta-card { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px 16px; }
  .meta-label { font-size: 8.5pt; color: #94A3B8; font-weight: 700; margin-bottom: 4px; }
  .meta-value { font-size: 13pt; font-weight: 700; color: #0C4A6E; }
  .section-title { font-size: 12pt; font-weight: 700; color: #0C4A6E; margin-bottom: 10px; padding-right: 10px; border-right: 4px solid #0EA5E9; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #0C4A6E; color: #fff; padding: 11px 14px; font-size: 11pt; font-weight: 700; text-align: right; }
  th.col-num { width: 50px; text-align: center; }
  th.col-qty { width: 120px; text-align: center; }
  td { padding: 10px 14px; border-bottom: 1px solid #E2E8F0; font-size: 11pt; vertical-align: middle; }
  td.num { text-align: center; color: #94A3B8; font-size: 10pt; }
  td.name { text-align: right; font-weight: 500; }
  td.qty { text-align: center; font-weight: 700; color: #0369A1; font-size: 12pt; }
  tr.even { background: #F8FAFC; }
  tr.odd  { background: #fff; }
  .total-row { background: #EFF6FF !important; }
  .total-row td { border-top: 2px solid #0C4A6E !important; font-weight: 700; color: #0C4A6E; font-size: 12pt; }
  .footer { border-top: 1px solid #E2E8F0; padding-top: 14px; text-align: center; color: #94A3B8; font-size: 9pt; margin-top: 8px; }
  .footer strong { color: #0C4A6E; }
</style>
</head>
<body>
<div class="header">
  <div class="logo">${logoSVG}</div>
  <div class="header-info">
    <div class="store-name">سوبيرات الغيث</div>
    <div class="store-sub">وصل طلب بضاعة</div>
  </div>
  <div class="receipt-badge">وصل طلب</div>
</div>
<div class="meta-grid">
  <div class="meta-card">
    <div class="meta-label">المورد</div>
    <div class="meta-value">${order.supplierName}</div>
  </div>
  <div class="meta-card">
    <div class="meta-label">التاريخ والوقت</div>
    <div class="meta-value">${order.date} — ${timeStr}</div>
  </div>
  ${order.supplierPhone ? `<div class="meta-card">
    <div class="meta-label">هاتف المورد</div>
    <div class="meta-value">${order.supplierPhone}</div>
  </div>` : ''}
  <div class="meta-card">
    <div class="meta-label">رقم الوصل</div>
    <div class="meta-value">${order.orderNumber}</div>
  </div>
</div>
<div class="section-title">قائمة السلع — ${order.items.length} صنف</div>
<table>
  <thead>
    <tr>
      <th class="col-num">#</th>
      <th>اسم السلعة</th>
      <th class="col-qty">الكمية</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr class="total-row">
      <td class="num"></td>
      <td class="name">إجمالي الأصناف</td>
      <td class="qty">${order.items.length} صنف</td>
    </tr>
  </tbody>
</table>
<div class="footer">
  تم إنشاء هذا الوصل بواسطة <strong>سوبيرات الغيث</strong> · ${order.date} الساعة ${timeStr}
</div>
</body>
</html>`;
}

// ─── Canvas-based PDF (web / AppCreator24 / Median.co) ────────────────────────
/**
 * Builds the receipt PDF by drawing DIRECTLY on a Canvas 2D element.
 *
 * WHY canvas instead of html2canvas or iframe:
 *   • iframe + contentDocument.write() → blocked by WebView security policy
 *     → html2canvas sees a blank document → blank PDF.
 *   • Div at top:-9999px → Android WebView skips rasterizing fixed elements
 *     that are outside the visible viewport → blank canvas → blank PDF.
 *   • Canvas 2D draws into a bitmap buffer unconditionally — it has no
 *     dependency on the DOM rasterizer or the visible viewport.
 *     Every pixel is guaranteed to render in every WebView environment.
 *
 * Data validation is performed by generateOrderPDF before this function
 * is called, so all fields are guaranteed non-empty here.
 */
async function buildPDFBlobCanvas(order: PurchaseOrder): Promise<Blob> {
  const now     = new Date();
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // ── Layout constants (all in logical px at 96 DPI) ────────────────────────
  const W      = 794;  // A4 page width
  const PAD    = 42;   // horizontal padding
  const PX     = 2;    // bitmap scale factor (2× for retina quality)
  const CW     = W - PAD * 2;

  const V_PAD     = 38;
  const HEADER_H  = 92;
  const DIVIDER   = 22;
  const META_H    = 66;
  const META_GAP  = 12;
  const SECTION_H = 46;
  const TH_H      = 46;
  const ROW_H     = 42;
  const TOTAL_H   = 46;
  const FOOTER_H  = 56;

  // Meta cards (always 4 slots, phone is optional)
  const metaCards: { label: string; value: string }[] = [
    { label: 'المورد',         value: order.supplierName },
    { label: 'التاريخ والوقت', value: `${order.date} — ${timeStr}` },
    ...(order.supplierPhone
      ? [{ label: 'هاتف المورد', value: order.supplierPhone }]
      : []),
    { label: 'رقم الوصل', value: order.orderNumber },
  ];
  const metaRows = Math.ceil(metaCards.length / 2);
  const META_ZONE = metaRows * META_H + (metaRows - 1) * META_GAP;

  const TABLE_ZONE = TH_H + order.items.length * ROW_H + TOTAL_H;

  const totalH =
    V_PAD + HEADER_H + DIVIDER +
    META_ZONE        + DIVIDER +
    SECTION_H        +
    TABLE_ZONE       + DIVIDER +
    FOOTER_H         + V_PAD;

  // ── Create off-screen canvas ──────────────────────────────────────────────
  const canvas  = document.createElement('canvas');
  canvas.width  = W  * PX;
  canvas.height = totalH * PX;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(PX, PX);

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, totalH);

  // RTL text direction (Arabic characters render correctly regardless,
  // but this also affects number/Latin ordering in mixed text)
  ctx.direction    = 'rtl';
  ctx.textBaseline = 'middle';

  // ── Helpers ───────────────────────────────────────────────────────────────
  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Truncate text that would overflow a given pixel width
  function truncate(text: string, maxW: number): string {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 0 && ctx.measureText(t + '…').width > maxW) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  let y = V_PAD;

  // ── 1. Header ─────────────────────────────────────────────────────────────
  const logoR  = 36;
  const logoCX = PAD + logoR;
  const logoCY = y + logoR + 10;

  // Logo: blue circle
  ctx.fillStyle = '#0C4A6E';
  ctx.beginPath();
  ctx.arc(logoCX, logoCY, logoR, 0, Math.PI * 2);
  ctx.fill();

  // Shopping-cart icon — scaled from SVG viewBox 0 0 80 80
  {
    const s  = (logoR * 2) / 80;
    const ox = logoCX - 40 * s;
    const oy = logoCY - 40 * s;
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle   = '#ffffff';
    ctx.lineWidth   = 2.5 * s;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    // Path: M24 26 h4 l5 22 h14 l4-14 H33
    ctx.beginPath();
    ctx.moveTo(ox + 24 * s, oy + 26 * s);
    ctx.lineTo(ox + 28 * s, oy + 26 * s);
    ctx.lineTo(ox + 33 * s, oy + 48 * s);
    ctx.lineTo(ox + 47 * s, oy + 48 * s);
    ctx.lineTo(ox + 51 * s, oy + 34 * s);
    ctx.lineTo(ox + 33 * s, oy + 34 * s);
    ctx.stroke();
    // Wheels
    ctx.beginPath();
    ctx.arc(ox + 37 * s, oy + 52 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ox + 47 * s, oy + 52 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Store name (anchored at right edge — RTL flows leftward)
  ctx.fillStyle    = '#0C4A6E';
  ctx.font         = 'bold 21pt Arial, "Segoe UI", Tahoma, sans-serif';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('سوبيرات الغيث', W - PAD, y + 12);

  ctx.fillStyle = '#64748B';
  ctx.font      = '10pt Arial, "Segoe UI", Tahoma, sans-serif';
  ctx.fillText('وصل طلب بضاعة', W - PAD, y + 50);

  // "وصل طلب" badge — visually on the left (next to logo in RTL layout)
  {
    const bX = logoCX + logoR + 14;
    const bW = 108;
    const bY = y + (HEADER_H - 34) / 2;
    ctx.fillStyle = '#0C4A6E';
    roundRect(bX, bY, bW, 34, 8);
    ctx.fill();
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 12pt Arial, "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('وصل طلب', bX + bW / 2, bY + 17);
  }

  // Header separator
  y += HEADER_H;
  ctx.strokeStyle = '#0C4A6E';
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += DIVIDER;

  // ── 2. Meta grid ─────────────────────────────────────────────────────────
  {
    const halfW = (CW - META_GAP) / 2;

    metaCards.forEach((card, i) => {
      // RTL visual order: even index → right column, odd → left column
      const isRight = i % 2 === 0;
      const cardX   = isRight ? (W - PAD - halfW) : PAD;
      const cardY   = y + Math.floor(i / 2) * (META_H + META_GAP);

      // Card background + border
      ctx.fillStyle   = '#F8FAFC';
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth   = 1;
      roundRect(cardX, cardY, halfW, META_H, 10);
      ctx.fill();
      ctx.stroke();

      const textRightX = cardX + halfW - 14;

      // Label
      ctx.fillStyle    = '#94A3B8';
      ctx.font         = 'bold 8pt Arial, "Segoe UI", Tahoma, sans-serif';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(card.label, textRightX, cardY + 12);

      // Value (truncated if needed)
      ctx.fillStyle    = '#0C4A6E';
      ctx.font         = 'bold 13pt Arial, "Segoe UI", Tahoma, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(truncate(card.value, halfW - 28), textRightX, cardY + 33);
    });
  }
  y += META_ZONE + DIVIDER;

  // ── 3. Section title ─────────────────────────────────────────────────────
  {
    // Blue accent bar on the right (RTL "start" side)
    ctx.fillStyle = '#0EA5E9';
    ctx.fillRect(W - PAD - 4, y + 10, 4, 26);

    ctx.fillStyle    = '#0C4A6E';
    ctx.font         = 'bold 12pt Arial, "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`قائمة السلع — ${order.items.length} صنف`, W - PAD - 14, y + SECTION_H / 2);
  }
  y += SECTION_H;

  // ── 4. Table ─────────────────────────────────────────────────────────────
  // Canvas columns (LTR coords) — RTL visual order is opposite:
  //   Visual: [# rightmost] [name middle] [qty leftmost]
  //   Canvas: [qty left]    [name mid]    [# right]
  const COL_NUM  = 52;
  const COL_QTY  = 114;
  const COL_NAME = CW - COL_NUM - COL_QTY;

  const qtyX  = PAD;
  const nameX = PAD + COL_QTY;
  const numX  = PAD + COL_QTY + COL_NAME;

  // Table header row
  ctx.fillStyle = '#0C4A6E';
  ctx.fillRect(PAD, y, CW, TH_H);

  ctx.fillStyle    = '#ffffff';
  ctx.font         = 'bold 11pt Arial, "Segoe UI", Tahoma, sans-serif';
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'center';
  ctx.fillText('#',       numX  + COL_NUM  / 2, y + TH_H / 2);
  ctx.fillText('الكمية',  qtyX  + COL_QTY  / 2, y + TH_H / 2);
  ctx.textAlign = 'right';
  ctx.fillText('اسم السلعة', nameX + COL_NAME - 12, y + TH_H / 2);
  y += TH_H;

  // Data rows
  order.items.forEach((item, i) => {
    const rowY   = y + i * ROW_H;
    const isEven = i % 2 === 0;

    // Row background
    ctx.fillStyle = isEven ? '#F8FAFC' : '#ffffff';
    ctx.fillRect(PAD, rowY, CW, ROW_H);

    // Bottom border
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, rowY + ROW_H);
    ctx.lineTo(W - PAD, rowY + ROW_H);
    ctx.stroke();

    const cy = rowY + ROW_H / 2;

    // Row number
    ctx.fillStyle    = '#94A3B8';
    ctx.font         = '10pt Arial, "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), numX + COL_NUM / 2, cy);

    // Item name (truncated to fit column)
    ctx.fillStyle = '#1E293B';
    ctx.font      = '11pt Arial, "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(truncate(item.name, COL_NAME - 24), nameX + COL_NAME - 12, cy);

    // Quantity
    ctx.fillStyle = '#0369A1';
    ctx.font      = 'bold 12pt Arial, "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(item.quantity), qtyX + COL_QTY / 2, cy);
  });
  y += order.items.length * ROW_H;

  // Totals row
  ctx.fillStyle = '#EFF6FF';
  ctx.fillRect(PAD, y, CW, TOTAL_H);

  // Top border (2 px dark blue)
  ctx.strokeStyle = '#0C4A6E';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y + 1);
  ctx.lineTo(W - PAD, y + 1);
  ctx.stroke();

  ctx.fillStyle    = '#0C4A6E';
  ctx.font         = 'bold 12pt Arial, "Segoe UI", Tahoma, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'right';
  ctx.fillText('إجمالي الأصناف', nameX + COL_NAME - 12, y + TOTAL_H / 2);
  ctx.textAlign = 'center';
  ctx.fillText(`${order.items.length} صنف`, qtyX + COL_QTY / 2, y + TOTAL_H / 2);
  y += TOTAL_H + DIVIDER;

  // ── 5. Footer ─────────────────────────────────────────────────────────────
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  ctx.fillStyle    = '#94A3B8';
  ctx.font         = '9pt Arial, "Segoe UI", Tahoma, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `تم إنشاء هذا الوصل بواسطة سوبيرات الغيث · ${order.date} الساعة ${timeStr}`,
    W / 2,
    y + FOOTER_H / 2,
  );

  // ── 6. Slice canvas into A4 pages → jsPDF blob ───────────────────────────
  const { jsPDF } = await import('jspdf');

  const A4_W_MM = 210;
  const A4_H_MM = 297;
  // How many logical px fit in one A4 page (at 96 DPI equivalence)
  const pageHPx = Math.round((A4_H_MM / A4_W_MM) * W); // ≈ 1123 px

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let offsetPx  = 0;
  let firstPage = true;
  while (offsetPx < totalH) {
    const sliceH = Math.min(pageHPx, totalH - offsetPx);
    const slice  = document.createElement('canvas');
    slice.width  = W * PX;
    slice.height = sliceH * PX;
    const sCtx   = slice.getContext('2d')!;
    sCtx.fillStyle = '#ffffff';
    sCtx.fillRect(0, 0, slice.width, slice.height);
    sCtx.drawImage(canvas, 0, -offsetPx * PX);
    const sliceHMm = (sliceH / W) * A4_W_MM;
    if (!firstPage) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, A4_W_MM, sliceHMm);
    offsetPx  += sliceH;
    firstPage  = false;
  }

  return pdf.output('blob');
}

// ─── Web Share helper ────────────────────────────────────────────────────────
async function shareBlobWeb(blob: Blob, order: PurchaseOrder): Promise<void> {
  const fileName = `وصل-${order.supplierName}-${order.orderNumber}.pdf`;
  const file     = new File([blob], fileName, { type: 'application/pdf' });

  // Use the native OS share sheet (Web Share API level 2)
  // — supported by Median.co shell and modern Android/iOS browsers
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    navigator.canShare?.({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: `وصل طلب – ${order.supplierName}`,
    });
    return;
  }

  // Fallback: programmatic download (desktop browsers without Web Share API)
  const url = URL.createObjectURL(blob);
  try {
    const a  = document.createElement('a');
    a.href   = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 15_000);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validates the order data, then generates a PDF.
 * - Native (Expo app): uses expo-print → returns a local file URI.
 * - Web / Median.co / AppCreator24: uses Canvas 2D → returns a blob: URI.
 *
 * Throws a descriptive Arabic error string if required fields are missing.
 */
export async function generateOrderPDF(order: PurchaseOrder): Promise<string | null> {
  // ── Validate before generating ──────────────────────────────────────────
  if (!order.supplierName?.trim())
    throw new Error('اسم المورد مفقود — تعذّر إنشاء الوصل');
  if (!order.date?.trim())
    throw new Error('تاريخ الوصل مفقود — تعذّر إنشاء الوصل');
  if (!order.orderNumber?.trim())
    throw new Error('رقم الوصل مفقود — تعذّر إنشاء الوصل');
  if (!order.items?.length)
    throw new Error('قائمة السلع فارغة — تعذّر إنشاء الوصل');

  if (Platform.OS !== 'web') {
    // Native Expo path — expo-print handles HTML → PDF silently
    const html   = buildOrderHTML(order);
    const { uri } = await Print.printToFileAsync({ html });
    return uri;
  }

  // Web / Median.co / AppCreator24 path — canvas-based (no DOM rasterizer)
  const blob = await buildPDFBlobCanvas(order);
  return URL.createObjectURL(blob);
}

/**
 * Opens the system share sheet with the PDF attached.
 * Always regenerates the PDF on web to avoid revoked blob URL issues.
 */
export async function shareOrderPDF(
  uri: string | null,
  order: PurchaseOrder,
): Promise<void> {
  if (Platform.OS !== 'web') {
    if (!uri) return;
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return;
    await Sharing.shareAsync(uri, {
      mimeType:    'application/pdf',
      dialogTitle: `وصل طلب – ${order.supplierName}`,
      UTI:         'com.adobe.pdf',
    });
    return;
  }

  // Web path: always produce a fresh canvas-generated blob
  // (avoids "blob URL revoked" failures from cached URIs)
  const blob = await buildPDFBlobCanvas(order);
  await shareBlobWeb(blob, order);
}

/** @deprecated Use generateOrderPDF + shareOrderPDF separately. */
export async function generateAndShareOrderPDF(order: PurchaseOrder): Promise<void> {
  const uri = await generateOrderPDF(order);
  await shareOrderPDF(uri, order);
}
