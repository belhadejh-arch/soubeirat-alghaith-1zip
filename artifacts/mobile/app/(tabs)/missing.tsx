import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal,
  TextInput, Platform, KeyboardAvoidingView, ScrollView,
  RefreshControl, Pressable,
} from 'react-native';
import ConfirmModal from '@/components/ConfirmModal';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/components/Toast';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { MissingProduct, ProductStatus } from '@/types';
import { getCurrentDate, getCurrentTime } from '@/utils/helpers';

const FILTERS: { label: string; value: 'all' | ProductStatus }[] = [
  { label: 'الكل', value: 'all' },
  { label: 'معلق', value: 'pending' },
  { label: 'تم الطلب', value: 'ordered' },
  { label: 'ملغي', value: 'cancelled' },
  { label: 'غير متوفرة', value: 'unavailable' },
];

// Status background colors for non-pending items
const STATUS_BG: Record<string, string> = {
  ordered: '#F0FDF4',
  cancelled: '#FFF1F2',
  unavailable: '#F5F3FF',
};

export default function MissingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { products, addProduct, updateProductStatus, deleteProduct, addNotification, refresh } = useData();
  const { showToast } = useToast();

  // Default to 'pending' — shows only items that need action
  const [filter, setFilter] = useState<'all' | ProductStatus>('pending');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', quantity: '' });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [pressedSuggestion, setPressedSuggestion] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + 60 + insets.bottom : 60 + insets.bottom;

  const allProductNames = useMemo(() => [...new Set(products.map(p => p.name))], [products]);

  const filtered = useMemo(() => {
    return products
      .filter(p => filter === 'all' || p.status === filter)
      .filter(p => !search || p.name.includes(search));
  }, [products, filter, search]);

  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function handleNameChange(text: string) {
    setForm(f => ({ ...f, name: text }));
    if (text.length >= 1) {
      setSuggestions(
        allProductNames
          .filter(n => n.includes(text) && n.toLowerCase() !== text.toLowerCase())
          .slice(0, 6),
      );
    } else {
      setSuggestions([]);
    }
  }

  function pickSuggestion(name: string) {
    setForm(f => ({ ...f, name }));
    setSuggestions([]);
  }

  async function handleAdd() {
    if (!form.name.trim()) { showToast('أدخل اسم السلعة', 'error'); return; }
    setSaving(true);
    await addProduct({
      name: form.name.trim(),
      quantity: form.quantity.trim() || '-',
      section: 'عام',
      workerId: currentUser?.id ?? '',
      workerName: currentUser?.name ?? '',
      date: getCurrentDate(),
      time: getCurrentTime(),
      status: 'pending',
    });
    await addNotification({
      message: `${currentUser?.name} أضاف سلعة ناقصة: ${form.name}`,
      type: 'product', isRead: false, date: getCurrentDate(), time: getCurrentTime(),
    });
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('تمت إضافة السلعة', 'success');
    setForm({ name: '', quantity: '' });
    setSuggestions([]);
    setShowAdd(false);
    setSaving(false);
  }

  async function handleStatus(p: MissingProduct, status: ProductStatus) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateProductStatus(p.id, status, currentUser?.name ?? '');
    const labels: Record<ProductStatus, string> = {
      ordered: 'تم الطلب', cancelled: 'ملغي', pending: 'معلق', unavailable: 'غير متوفرة',
    };
    showToast(`تم التحديث إلى: ${labels[status]}`, 'success');
  }

  function confirmDelete(id: string) {
    setDeleteConfirmId(id);
  }

  async function handleConfirmedDelete() {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    try {
      await deleteProduct(id);
      showToast('تم حذف السلعة', 'success');
    } catch {
      showToast('تعذّر حذف السلعة', 'error');
    }
  }

  const renderItem = ({ item }: { item: MissingProduct }) => {
    const isPending = item.status === 'pending';
    const cardBg = isPending ? colors.card : (STATUS_BG[item.status] ?? colors.card);

    return (
      <View style={[
        styles.card,
        { backgroundColor: cardBg, borderColor: colors.border },
        !isPending && styles.cardDimmed,
      ]}>
        {/* Row 1: name — status badge */}
        <View style={styles.cardTop}>
          <Text style={[styles.productName, { color: isPending ? colors.foreground : colors.mutedForeground }]} numberOfLines={2}>
            {item.name}
          </Text>
          <Badge variant={item.status} size="sm" />
        </View>

        {/* Meta: worker name + quantity */}
        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
          {item.workerName}
          {item.quantity && item.quantity !== '-' ? ` • ${item.quantity}` : ''}
          {item.updatedBy ? ` • حُدِّث بواسطة: ${item.updatedBy}` : ''}
        </Text>

        {/* Actions */}
        {canManage && isPending && (
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#DCFCE7' }]} onPress={() => handleStatus(item, 'ordered')}>
              <Feather name="check" size={13} color="#16A34A" />
              <Text style={[styles.actionText, { color: '#16A34A' }]}>تم الطلب</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => handleStatus(item, 'cancelled')}>
              <Feather name="x" size={13} color="#DC2626" />
              <Text style={[styles.actionText, { color: '#DC2626' }]}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#F3E8FF' }]} onPress={() => handleStatus(item, 'unavailable')}>
              <Feather name="slash" size={13} color="#7C3AED" />
              <Text style={[styles.actionText, { color: '#7C3AED' }]}>غير متوفرة</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDelete(item.id)}>
              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        {/* Non-pending: admin can still delete */}
        {canManage && !isPending && (
          <View style={[styles.actions, { justifyContent: 'flex-start' }]}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => confirmDelete(item.id)}>
              <Feather name="trash-2" size={13} color="#DC2626" />
              <Text style={[styles.actionText, { color: '#DC2626' }]}>حذف</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={styles.headerTitle}>السلع الناقصة</Text>
        <Text style={styles.headerSub}>{products.filter(p => p.status === 'pending').length} سلعة معلقة</Text>
      </LinearGradient>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="بحث في السلع..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity> : null}
      </View>

      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterTab, { borderColor: colors.border, backgroundColor: filter === f.value ? colors.primary : colors.card }]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterText, { color: filter === f.value ? '#fff' : colors.mutedForeground }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad, gap: 10 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          filter === 'pending'
            ? <EmptyState icon="check-circle" title="كل السلع تم التعامل معها" subtitle="لا توجد سلع معلقة حالياً" />
            : <EmptyState icon="package" title="لا توجد سلع" subtitle="اضغط على + لإضافة سلعة ناقصة" />
        }
      />

      {/* FAB */}
      <TouchableOpacity style={[styles.fab, { bottom: bottomPad + 16 }]} onPress={() => setShowAdd(true)}>
        <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.fabGrad}>
          <Feather name="plus" size={26} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Delete Confirm */}
      <ConfirmModal
        visible={!!deleteConfirmId}
        title="حذف السلعة"
        message="هل أنت متأكد من الحذف نهائياً؟ لا يمكن التراجع."
        confirmLabel="حذف"
        onConfirm={handleConfirmedDelete}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {/* Add Modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => { setShowAdd(false); setSuggestions([]); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <TouchableOpacity style={styles.overlay} onPress={() => { setShowAdd(false); setSuggestions([]); }} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>إضافة سلعة ناقصة</Text>

            <Text style={[styles.label, { color: colors.mutedForeground }]}>اسم السلعة *</Text>

            {/* Autocomplete container */}
            <View style={styles.autocompleteWrap}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="اكتب اسم السلعة..."
                placeholderTextColor={colors.mutedForeground}
                value={form.name}
                onChangeText={handleNameChange}
                textAlign="right"
                autoFocus
              />
              {suggestions.length > 0 && (
                <View style={[
                  styles.suggestions,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.primary,
                    shadowColor: '#0C4A6E',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.22,
                    shadowRadius: 10,
                    elevation: 20,
                  },
                ]}>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                  >
                    {suggestions.map((s, i) => (
                      <Pressable
                        key={i}
                        onPressIn={() => setPressedSuggestion(i)}
                        onPressOut={() => setPressedSuggestion(null)}
                        onPress={() => { setPressedSuggestion(null); pickSuggestion(s); }}
                        style={[
                          styles.suggestionItem,
                          {
                            borderBottomColor: colors.border,
                            backgroundColor: pressedSuggestion === i
                              ? '#DBEAFE'
                              : i % 2 === 0 ? colors.background : colors.card,
                          },
                        ]}
                      >
                        <Feather name="clock" size={15} color={pressedSuggestion === i ? '#0C4A6E' : colors.mutedForeground} style={{ marginLeft: 6 }} />
                        <Text style={[styles.suggestionText, { color: pressedSuggestion === i ? '#0C4A6E' : colors.foreground }]}>{s}</Text>
                        <Feather name="corner-down-left" size={15} color={pressedSuggestion === i ? '#0C4A6E' : colors.primary} />
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <Text style={[styles.label, { color: colors.mutedForeground }]}>الكمية (اختياري)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="مثال: 10 كرتون"
              placeholderTextColor={colors.mutedForeground}
              value={form.quantity}
              onChangeText={v => setForm(f => ({ ...f, quantity: v }))}
              textAlign="right"
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={saving}>
              <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.saveBtnGrad}>
                <Text style={styles.saveBtnText}>{saving ? 'جاري الحفظ...' : 'إضافة السلعة'}</Text>
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
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 22, fontFamily: 'Changa_700Bold', color: '#fff', textAlign: 'right' },
  headerSub: { fontSize: 13, fontFamily: 'Changa_400Regular', color: 'rgba(255,255,255,0.75)', textAlign: 'right' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', margin: 16, marginBottom: 8, padding: 12, borderRadius: 12, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, padding: 0, fontFamily: 'Changa_400Regular' },
  filterScroll: { maxHeight: 44 },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13, fontFamily: 'Changa_500Medium' },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 6 },
  cardDimmed: { opacity: 0.85 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  productName: { fontSize: 16, fontFamily: 'Changa_600SemiBold', flex: 1, textAlign: 'right' },
  metaText: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  actionText: { fontSize: 12, fontFamily: 'Changa_500Medium' },
  fab: { position: 'absolute', left: 20, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', shadowColor: '#0EA5E9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  fabGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  sheetTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  label: { fontSize: 13, fontFamily: 'Changa_500Medium', textAlign: 'right' },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15, fontFamily: 'Changa_400Regular' },
  autocompleteWrap: { zIndex: 100 },
  suggestions: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    borderRadius: 14, borderWidth: 2, zIndex: 9999,
    maxHeight: 260, marginTop: 4,
  },
  suggestionItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  suggestionText: { fontSize: 16, fontFamily: 'Changa_500Medium', flex: 1, textAlign: 'right' },
  saveBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  saveBtnGrad: { padding: 16, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontFamily: 'Changa_600SemiBold', color: '#fff' },
});
