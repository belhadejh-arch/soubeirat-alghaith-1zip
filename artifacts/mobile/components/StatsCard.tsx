import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  title: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  gradient: [string, string];
  subtitle?: string;
}

export default function StatsCard({ title, value, icon, gradient, subtitle }: Props) {
  return (
    <LinearGradient colors={gradient} style={styles.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <View style={styles.iconWrap}>
        <Feather name={icon} size={22} color="rgba(255,255,255,0.9)" />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.sub}>{subtitle}</Text>}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1, minWidth: '47%', borderRadius: 16, padding: 16, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  value: { fontSize: 24, fontFamily: 'Changa_700Bold', color: '#FFFFFF' },
  title: { fontSize: 12, fontFamily: 'Changa_400Regular', color: 'rgba(255,255,255,0.85)' },
  sub: { fontSize: 11, fontFamily: 'Changa_400Regular', color: 'rgba(255,255,255,0.7)' },
});
