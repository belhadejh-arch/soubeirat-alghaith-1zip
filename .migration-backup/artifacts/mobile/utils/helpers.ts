export function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function getCurrentDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function formatDate(date: string): string {
  const parts = date.split('-');
  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ];
  const d = parseInt(parts[2] ?? '1', 10);
  const m = parseInt(parts[1] ?? '1', 10) - 1;
  const y = parts[0] ?? '';
  return `${d} ${months[m] ?? ''} ${y}`;
}

export function formatTime(time: string): string {
  const parts = time.split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parts[1] ?? '00';
  const ampm = h >= 12 ? 'م' : 'ص';
  const hour = h % 12 || 12;
  return `${hour}:${m} ${ampm}`;
}

export function generateOrderNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `ORD-${y}${mo}${d}-${rand}`;
}

export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: 'مدير',
    supervisor: 'مشرف',
    worker: 'عامل',
  };
  return map[role] ?? role;
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'معلق',
    ordered: 'تم الطلب',
    cancelled: 'ملغي',
    unavailable: 'غير متوفرة',
    done: 'منجز',
    postponed: 'مؤجل',
    draft: 'مسودة',
    sent: 'أُرسل',
    received: 'وصل',
    active: 'نشط',
    suspended: 'موقوف',
  };
  return map[status] ?? status;
}

export function priorityLabel(priority: string): string {
  const map: Record<string, string> = {
    low: 'منخفضة',
    medium: 'متوسطة',
    high: 'عالية',
  };
  return map[priority] ?? priority;
}

export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('ar-DZ')} دج`;
}
