/**
 * ConfirmModal – replaces Alert.alert for delete/destructive confirmations.
 * Alert.alert is silently blocked in AppCreator24 / Median WebView.
 * This component renders a native-style in-app dialog instead.
 */
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  visible, title, message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  destructive = true,
  onConfirm, onCancel,
}: Props) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.muted }]}
              onPress={onCancel}
            >
              <Text style={[styles.btnText, { color: colors.foreground }]}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: destructive ? '#EF4444' : colors.primary }]}
              onPress={onConfirm}
            >
              <Text style={[styles.btnText, { color: '#fff' }]}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  box: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  title: { fontSize: 17, fontFamily: 'Changa_700Bold', textAlign: 'center' },
  message: { fontSize: 14, fontFamily: 'Changa_400Regular', textAlign: 'center', lineHeight: 22 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 15, fontFamily: 'Changa_600SemiBold' },
});
