import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useData } from '@/context/DataContext';
import EmptyState from '@/components/EmptyState';
import { AppNotification } from '@/types';

const TYPE_ICONS = {
  product: 'package' as const,
  task: 'check-square' as const,
  order: 'shopping-cart' as const,
  system: 'bell' as const,
};

const TYPE_COLORS: Record<string, string> = {
  product: '#F59E0B',
  task: '#22C55E',
  order: '#0EA5E9',
  system: '#8B5CF6',
};

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { notifications, markNotificationRead, markAllRead } = useData();

  const bottomPad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;
  const unread = notifications.filter(n => !n.isRead).length;

  const renderItem = ({ item }: { item: AppNotification }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: item.isRead ? colors.card : colors.card, borderColor: item.isRead ? colors.border : colors.primary, opacity: item.isRead ? 0.8 : 1 }]}
      onPress={() => !item.isRead && markNotificationRead(item.id)}
      activeOpacity={0.8}
    >
      <View style={[styles.iconWrap, { backgroundColor: TYPE_COLORS[item.type] + '20' }]}>
        <Feather name={TYPE_ICONS[item.type]} size={20} color={TYPE_COLORS[item.type]} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.message, { color: colors.foreground, fontFamily: item.isRead ? 'Changa_400Regular' : 'Changa_600SemiBold' }]}>
          {item.message}
        </Text>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>{item.date} • {item.time}</Text>
      </View>
      {!item.isRead && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {unread > 0 && (
        <View style={[styles.toolbar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={[styles.markAllBtn, { backgroundColor: colors.muted }]} onPress={markAllRead}>
            <Feather name="check-circle" size={16} color={colors.primary} />
            <Text style={[styles.markAllText, { color: colors.primary }]}>تحديد الكل كمقروء ({unread})</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 16, gap: 10 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyState icon="bell" title="لا توجد إشعارات" subtitle="ستظهر الإشعارات هنا" />}
        scrollEnabled={notifications.length > 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', padding: 12, borderBottomWidth: 1 },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  markAllText: { fontSize: 13, fontFamily: 'Changa_500Medium' },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, borderWidth: 1.5, gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, gap: 4 },
  message: { fontSize: 14, textAlign: 'right', lineHeight: 20 },
  time: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
