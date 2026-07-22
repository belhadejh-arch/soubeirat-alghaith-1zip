import React, { createContext, useContext, useState, useRef, ReactNode, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

type ToastType = 'success' | 'error' | 'info';

interface ToastMsg { id: number; message: string; type: ToastType }

interface ToastCtx { showToast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const insets = useSafeAreaInsets();
  let counter = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const topOffset = Platform.OS === 'web' ? 67 + insets.top : insets.top + 16;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <View style={[styles.container, { top: topOffset }]} pointerEvents="none">
        {toasts.map(t => (
          <View key={t.id} style={[styles.toast, t.type === 'error' ? styles.error : t.type === 'info' ? styles.info : styles.success]}>
            <Feather name={t.type === 'error' ? 'x-circle' : t.type === 'info' ? 'info' : 'check-circle'} size={18} color="#fff" />
            <Text style={styles.text}>{t.message}</Text>
          </View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() { return useContext(ToastContext); }

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, zIndex: 9999, gap: 8 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6 },
  success: { backgroundColor: '#22C55E' },
  error: { backgroundColor: '#EF4444' },
  info: { backgroundColor: '#0EA5E9' },
  text: { color: '#fff', fontSize: 14, fontFamily: 'Changa_500Medium', flex: 1, textAlign: 'right' },
});
