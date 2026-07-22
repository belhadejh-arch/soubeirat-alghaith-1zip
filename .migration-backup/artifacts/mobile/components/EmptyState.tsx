import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

interface Props {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
}

export default function EmptyState({ icon, title, subtitle }: Props) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
        <Feather name={icon} size={32} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Changa_600SemiBold' }]}>{title}</Text>
      {subtitle && <Text style={[styles.sub, { color: colors.mutedForeground, fontFamily: 'Changa_400Regular' }]}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, textAlign: 'center' },
  sub: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
});
