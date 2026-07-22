import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';

type BadgeVariant =
  | 'pending' | 'ordered' | 'cancelled' | 'unavailable'
  | 'done' | 'postponed' | 'draft' | 'sent' | 'received'
  | 'high' | 'medium' | 'low'
  | 'active' | 'suspended'
  | 'admin' | 'supervisor' | 'worker';

const LABELS: Record<BadgeVariant, string> = {
  pending: 'معلق', ordered: 'تم الطلب', cancelled: 'ملغي', unavailable: 'غير متوفرة',
  done: 'منجز', postponed: 'مؤجل', draft: 'مسودة',
  sent: 'أُرسل', received: 'وصل', high: 'عالية',
  medium: 'متوسطة', low: 'منخفضة', active: 'نشط',
  suspended: 'موقوف', admin: 'مدير', supervisor: 'مشرف', worker: 'عامل',
};

const BG: Record<BadgeVariant, string> = {
  pending: '#FEF3C7', ordered: '#DCFCE7', cancelled: '#FEE2E2', unavailable: '#F3E8FF',
  done: '#DCFCE7', postponed: '#FEF9C3', draft: '#F1F5F9',
  sent: '#DBEAFE', received: '#DCFCE7', high: '#FEE2E2',
  medium: '#FEF3C7', low: '#DCFCE7', active: '#DCFCE7',
  suspended: '#FEE2E2', admin: '#EDE9FE', supervisor: '#DBEAFE', worker: '#F0FDF4',
};

const FG: Record<BadgeVariant, string> = {
  pending: '#92400E', ordered: '#166534', cancelled: '#991B1B', unavailable: '#6B21A8',
  done: '#166534', postponed: '#713F12', draft: '#475569',
  sent: '#1E40AF', received: '#166534', high: '#991B1B',
  medium: '#92400E', low: '#166534', active: '#166534',
  suspended: '#991B1B', admin: '#5B21B6', supervisor: '#1E40AF', worker: '#15803D',
};

interface Props {
  variant: BadgeVariant;
  label?: string;
  size?: 'sm' | 'md';
}

export default function Badge({ variant, label, size = 'md' }: Props) {
  const text = label ?? LABELS[variant] ?? variant;
  return (
    <View style={[styles.badge, { backgroundColor: BG[variant] ?? '#F1F5F9' }, size === 'sm' && styles.sm]}>
      <Text style={[styles.label, { color: FG[variant] ?? '#475569' }, size === 'sm' && styles.smLabel]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' },
  label: { fontSize: 12, fontFamily: 'Changa_600SemiBold' },
  sm: { paddingHorizontal: 8, paddingVertical: 2 },
  smLabel: { fontSize: 11 },
});
