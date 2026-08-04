import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal,
  TextInput, Platform, KeyboardAvoidingView, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router, Stack } from 'expo-router';
import ConfirmModal from '@/components/ConfirmModal';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import type { Supplier } from '@/types';

function fmt(n: number) {
  return n.toLocaleString('fr-DZ') + ' دج';
}

export default function SuppliersIndexScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { suppliers, balances, balancesLoading, addSupplier, refresh } = useData();
  const { showToast } = useToast();

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Add supplier modal
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function handleAddSupplier() {
    if (!newName.trim()) { showToast('أدخل اسم المورد', 'error'); return; }
    try {
      await addSupplier({ name: newName.trim(), phone: newPhone.trim(), address: '', notes: '' });
      showToast('تم إضافة المورد', 'success');
      setNewName('');
      setNewPhone('');
      setShowAddSupplier(false);
    } catch (err: any) {
      if (err?.code === 'duplicate_supplier') {
        showToast('يوجد مورد بنفس الاسم مسبقاً', 'error');
      } else {
        showToast('حدث خطأ', 'error');
      }
    }
  }

  const getBalanceInfo = (id: string) => {
    const b = balances[id] ?? 0;
    if (b === 0) return { text: 'لا ديون', color: '#64748B' };
    if (b > 0) return { text: `${fmt(b)} مستحق`, color: '#DC2626' };
    return { text: `${fmt(Math.abs(b))} زائد`, color: '#16A34A' };
  };

  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;
    const q = searchQuery.toLowerCase();
    return suppliers.filter(s => s.name.toLowerCase().includes(q));
  }, [suppliers, searchQuery]);

  // Summary stats
  const totalDebt = useMemo(() => {
    return Object.values(balances).filter(b => b > 0).reduce((a, b) => a + b, 0);
  }, [balances]);

  const renderSupplier = ({ item }: { item: Supplier }) => {
    const bal = getBalanceInfo(item.id);
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push({
          pathname: '/suppliers/[supplierId]',
          params: {
            supplierId: item.id,
            supplierName: item.name,
            supplierPhone: item.phone ?? '',
          },
        })}
        activeOpacity={0.8}
      >
        <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
        </LinearGradient>
        <View style={styles.cardInfo}>
          <Text style={[styles.supplierName, { color: colors.foreground }]}>{item.name}</Text>
          <View style={styles.metaRow}>
            {balancesLoading ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Text style={[styles.balanceText, { color: bal.color }]}>{bal.text}</Text>
            )}
            {!!item.phone && (
              <Text style={[styles.phoneText, { color: colors.mutedForeground }]}>{item.phone}</Text>
            )}
          </View>
        </View>
        <Feather name="chevron-left" size={20} color={colors.mutedForeground} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>🏪 الموردون</Text>
          {!balancesLoading && totalDebt > 0 && (
            <View style={styles.totalBadge}>
              <Text style={styles.totalBadgeText}>{fmt(totalDebt)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.headerSub}>
          {suppliers.length} مورد
        </Text>
      </LinearGradient>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={17} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="بحث عن مورد..."
          placeholderTextColor={colors.mutedForeground}
          value={searchQuery}
          onChangeText={setSearchQuery}
          textAlign="right"
        />
        {!!searchQuery && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredSuppliers}
        keyExtractor={i => i.id}
        renderItem={renderSupplier}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 100, gap: 10 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#0EA5E9']}
            tintColor="#0EA5E9"
          />
        }
        ListEmptyComponent={
          <EmptyState icon="users" title="لا يوجد موردون" subtitle="اضغط + لإضافة مورد" />
        }
      />

      {isAdmin && (
        <TouchableOpacity style={[styles.fab, { bottom: bottomPad + 20 }]} onPress={() => setShowAddSupplier(true)}>
          <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.fabGrad}>
            <Feather name="plus" size={28} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Add Supplier Modal */}
      <Modal visible={showAddSupplier} transparent animationType="slide" onRequestClose={() => setShowAddSupplier(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={() => setShowAddSupplier(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>إضافة مورد</Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>الاسم *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="اسم المورد"
              placeholderTextColor={colors.mutedForeground}
              value={newName}
              onChangeText={setNewName}
              textAlign="right"
              autoFocus
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>رقم الهاتف (اختياري)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="05XXXXXXXX"
              placeholderTextColor={colors.mutedForeground}
              value={newPhone}
              onChangeText={setNewPhone}
              textAlign="right"
              keyboardType="phone-pad"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddSupplier}>
              <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.saveBtnGrad}>
                <Text style={styles.saveBtnText}>إضافة المورد</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', color: '#fff' },
  headerSub: { fontSize: 13, fontFamily: 'Changa_400Regular', color: 'rgba(255,255,255,0.75)', marginTop: 4, textAlign: 'right' },
  totalBadge: { backgroundColor: 'rgba(220,38,38,0.85)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  totalBadgeText: { fontSize: 13, fontFamily: 'Changa_600SemiBold', color: '#fff' },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Changa_400Regular' },

  card: { borderRadius: 14, padding: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 20, fontFamily: 'Changa_700Bold', color: '#fff' },
  cardInfo: { flex: 1, gap: 4 },
  supplierName: { fontSize: 16, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceText: { fontSize: 13, fontFamily: 'Changa_600SemiBold' },
  phoneText: { fontSize: 12, fontFamily: 'Changa_400Regular' },

  fab: { position: 'absolute', left: 20, width: 60, height: 60, borderRadius: 30, overflow: 'hidden', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 5 },
  fabGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  fieldLabel: { fontSize: 13, fontFamily: 'Changa_500Medium', textAlign: 'right' },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15, fontFamily: 'Changa_400Regular' },
  saveBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  saveBtnGrad: { padding: 16, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontFamily: 'Changa_600SemiBold', color: '#fff' },
});
