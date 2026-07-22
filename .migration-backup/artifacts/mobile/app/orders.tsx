import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal,
  TextInput, Platform, ScrollView, KeyboardAvoidingView, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/components/Toast';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { PurchaseOrder, Supplier, OrderStatus } from '@/types';
import { getCurrentDate, generateId } from '@/utils/helpers';
import { generateOrderPDF, shareOrderPDF } from '@/utils/pdfGenerator';
import { pdfCache } from '@/utils/pdfCache';

const STATUS_FILTERS: { label: string; value: 'all' | OrderStatus }[] = [
  { label: 'الكل', value: 'all' },
  { label: 'مسودة', value: 'draft' },
  { label: 'أُرسل', value: 'sent' },
  { label: 'وصل', value: 'received' },
];

interface PosItem { name: string; quantity: string }

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { orders, suppliers, addOrder, addSupplier, updateOrderStatus, deleteOrder, addNotification, refresh } = useData();
  const { showToast } = useToast();

  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [step, setStep] = useState<'supplier' | 'items'>('supplier');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isNewSupplier, setIsNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [posItems, setPosItems] = useState<PosItem[]>([]);
  const [currentName, setCurrentName] = useState('');
  const [currentQty, setCurrentQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState<PurchaseOrder | null>(null);
  const nameRef = useRef<TextInput>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const bottomPad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;
  const filtered = orders.filter(o => filter === 'all' || o.status === filter);

  function resetForm() {
    setStep('supplier');
    setSelectedSupplier(null);
    setIsNewSupplier(false);
    setNewSupplierName('');
    setNewSupplierPhone('');
    setPosItems([]);
    setCurrentName('');
    setCurrentQty('');
    setSaving(false);
  }

  function addPosItem() {
    if (!currentName.trim()) { showToast('أدخل اسم السلعة', 'error'); return; }
    if (!currentQty.trim()) { showToast('أدخل الكمية', 'error'); return; }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPosItems(prev => [...prev, { name: currentName.trim(), quantity: currentQty.trim() }]);
    setCurrentName('');
    setCurrentQty('');
    setTimeout(() => nameRef.current?.focus(), 100);
  }

  function removePosItem(index: number) {
    setPosItems(prev => prev.filter((_, i) => i !== index));
  }

  function updatePosItemQty(index: number, qty: string) {
    setPosItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: qty } : item));
  }

  async function handleSaveOrder() {
    if (saving) return;
    let supplier = selectedSupplier;
    if (isNewSupplier) {
      if (!newSupplierName.trim()) { showToast('أدخل اسم المورد', 'error'); return; }
      supplier = await addSupplier({ name: newSupplierName.trim(), phone: newSupplierPhone.trim(), address: '', notes: '' });
    }
    if (!supplier) { showToast('اختر موردًا', 'error'); return; }
    if (posItems.length === 0) { showToast('أضف سلعة واحدة على الأقل', 'error'); return; }

    setSaving(true);
    try {
      const capturedItems = posItems.map(i => ({
        id: generateId(), name: i.name, quantity: i.quantity, unit: '', notes: '',
      }));
      const capturedDate = getCurrentDate();
      const capturedSupplier = supplier;

      // 1. Save order to DB — returns the saved order with its real id/orderNumber
      const savedOrder = await addOrder({
        supplierId: capturedSupplier.id,
        supplierName: capturedSupplier.name,
        supplierPhone: capturedSupplier.phone,
        items: capturedItems,
        date: capturedDate,
        status: 'draft',
        notes: '',
      });
      await addNotification({
        message: `${currentUser?.name} أنشأ وصل طلب جديد من ${capturedSupplier.name}`,
        type: 'order', isRead: false, date: capturedDate, time: new Date().toTimeString().slice(0, 5),
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // 2. Close modal and reset immediately
      setShowAdd(false);
      resetForm();

      // 3. Generate PDF silently in the background; cache by the real order id
      //    so the share button reuses it without regenerating.
      generateOrderPDF(savedOrder)
        .then(uri => { if (uri) pdfCache.set(savedOrder.id, uri); })
        .catch(() => {});          // silent; user can still generate on demand

      showToast('تم حفظ الوصل بنجاح', 'success');

      // 4. Navigate to dashboard
      router.replace('/(tabs)');
    } catch {
      setSaving(false);
      showToast('حدث خطأ أثناء الحفظ', 'error');
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function confirmDeleteOrder(order: PurchaseOrder) {
    // Use an in-app modal instead of Alert.alert — Alert is blocked in
    // AppCreator24 / Median.co WebView environments.
    setDeleteConfirmOrder(order);
  }

  async function handleConfirmedDelete() {
    const order = deleteConfirmOrder;
    if (!order) return;
    setDeleteConfirmOrder(null);
    setDeletingId(order.id);
    try {
      await deleteOrder(order.id);
      pdfCache.delete(order.id);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('تم حذف الوصل بنجاح', 'success');
    } catch {
      showToast('تعذّر حذف الوصل، تحقق من الاتصال', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleShareOrder(order: PurchaseOrder) {
    if (sharingId) return;                         // prevent double-tap
    setSharingId(order.id);
    try {
      // Use cached URI if available (pre-generated silently on save), else build now
      let uri = pdfCache.get(order.id) ?? null;
      if (!uri) {
        uri = await generateOrderPDF(order);
        if (uri) pdfCache.set(order.id, uri);
      }
      // Open the native system share sheet with the PDF attached — no in-app preview
      await shareOrderPDF(uri, order);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذّر مشاركة الوصل';
      showToast(msg, 'error');
    } finally {
      setSharingId(null);
    }
  }

  const renderOrder = ({ item }: { item: PurchaseOrder }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Badge variant={item.status} size="sm" />
        <Text style={[styles.supplierName, { color: colors.foreground }]}>{item.supplierName}</Text>
        <Text style={[styles.dateText, { color: colors.mutedForeground }]}>{item.date}</Text>
      </View>

      <View style={styles.itemsList}>
        {item.items.slice(0, 5).map(i => (
          <View key={i.id} style={styles.itemRow}>
            <Text style={[styles.itemQty, { color: colors.primary }]}>{i.quantity}</Text>
            <Text style={[styles.itemName, { color: colors.foreground }]}>{i.name}</Text>
          </View>
        ))}
        {item.items.length > 5 && (
          <Text style={[styles.moreItems, { color: colors.mutedForeground }]}>
            +{item.items.length - 5} أصناف أخرى
          </Text>
        )}
      </View>

      <View style={styles.cardActions}>
        {/* Share button → generates PDF if needed then opens system share sheet */}
        <TouchableOpacity
          style={[styles.pdfBtn, { borderColor: '#0C4A6E', opacity: sharingId === item.id ? 0.6 : 1 }]}
          onPress={() => handleShareOrder(item)}
          disabled={sharingId === item.id}
        >
          {sharingId === item.id ? (
            <ActivityIndicator size="small" color="#0C4A6E" />
          ) : (
            <Feather name="share-2" size={15} color="#0C4A6E" />
          )}
          <Text style={[styles.pdfBtnText, { color: '#0C4A6E' }]}>
            {sharingId === item.id ? 'جارٍ التجهيز...' : 'مشاركة الوصل'}
          </Text>
        </TouchableOpacity>

        {isAdmin && item.status === 'draft' && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#DBEAFE' }]}
            onPress={() => updateOrderStatus(item.id, 'sent')}
          >
            <Feather name="send" size={14} color="#1E40AF" />
            <Text style={[styles.actionText, { color: '#1E40AF' }]}>إرسال</Text>
          </TouchableOpacity>
        )}
        {isAdmin && item.status === 'sent' && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#DCFCE7' }]}
            onPress={() => updateOrderStatus(item.id, 'received')}
          >
            <Feather name="check-circle" size={14} color="#16A34A" />
            <Text style={[styles.actionText, { color: '#16A34A' }]}>استلمت</Text>
          </TouchableOpacity>
        )}
        {isAdmin && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#FEE2E2', opacity: deletingId === item.id ? 0.6 : 1 }]}
            onPress={() => confirmDeleteOrder(item)}
            disabled={deletingId === item.id || sharingId === item.id}
          >
            {deletingId === item.id ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <Feather name="trash-2" size={14} color="#DC2626" />
            )}
            <Text style={[styles.actionText, { color: '#DC2626' }]}>
              {deletingId === item.id ? 'جارٍ الحذف...' : 'حذف'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Status Filter */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterTab, { borderColor: colors.border, backgroundColor: filter === f.value ? colors.primary : colors.card }]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterText, { color: filter === f.value ? '#fff' : colors.mutedForeground }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        renderItem={renderOrder}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 90, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState icon="shopping-cart" title="لا توجد وصلات" subtitle="اضغط + لإنشاء وصل طلب جديد" />
        }
      />

      <TouchableOpacity style={[styles.fab, { bottom: bottomPad + 20 }]} onPress={() => setShowAdd(true)}>
        <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.fabGrad}>
          <Feather name="plus" size={26} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      {/* ── Delete Confirmation Modal ── */}
      <Modal
        visible={!!deleteConfirmOrder}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmOrder(null)}
      >
        <View style={styles.overlay}>
          <View style={[styles.confirmBox, { backgroundColor: colors.card }]}>
            <Feather name="alert-triangle" size={32} color="#DC2626" style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={[styles.confirmTitle, { color: colors.foreground }]}>حذف الوصل</Text>
            <Text style={[styles.confirmMsg, { color: colors.mutedForeground }]}>
              هل أنت متأكد من حذف وصل &quot;{deleteConfirmOrder?.supplierName}&quot; نهائياً؟{'\n'}لا يمكن التراجع عن هذا الإجراء.
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={[styles.confirmCancelBtn, { borderColor: colors.border }]}
                onPress={() => setDeleteConfirmOrder(null)}
              >
                <Text style={[styles.confirmCancelText, { color: colors.foreground }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDeleteBtn} onPress={handleConfirmedDelete}>
                <Feather name="trash-2" size={15} color="#fff" />
                <Text style={styles.confirmDeleteText}>حذف نهائياً</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── New Order Modal ── */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => { if (!saving) { setShowAdd(false); resetForm(); } }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          {!saving && (
            <TouchableOpacity style={styles.overlay} onPress={() => { setShowAdd(false); resetForm(); }} />
          )}
          {saving && <View style={styles.overlay} />}

          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* ── Step: Supplier ── */}
            {step === 'supplier' && (
              <>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>اختيار المورد</Text>
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
                  <TouchableOpacity
                    style={[styles.toggleRow, { borderColor: colors.primary }]}
                    onPress={() => { setIsNewSupplier(v => !v); setSelectedSupplier(null); }}
                  >
                    <Feather name={isNewSupplier ? 'check-square' : 'square'} size={18} color={colors.primary} />
                    <Text style={[styles.toggleText, { color: colors.primary }]}>مورد جديد</Text>
                  </TouchableOpacity>

                  {isNewSupplier ? (
                    <View style={{ gap: 10, marginTop: 4 }}>
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                        placeholder="اسم المورد *" placeholderTextColor={colors.mutedForeground}
                        value={newSupplierName} onChangeText={setNewSupplierName} textAlign="right" autoFocus
                      />
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                        placeholder="رقم الهاتف (اختياري)" placeholderTextColor={colors.mutedForeground}
                        value={newSupplierPhone} onChangeText={setNewSupplierPhone} textAlign="right" keyboardType="phone-pad"
                      />
                    </View>
                  ) : (
                    <View style={{ gap: 8, marginTop: 10 }}>
                      {suppliers.length === 0 && (
                        <Text style={[styles.emptyNote, { color: colors.mutedForeground }]}>
                          لا يوجد موردون محفوظون. فعّل "مورد جديد" أعلاه.
                        </Text>
                      )}
                      {suppliers.map(s => (
                        <TouchableOpacity
                          key={s.id}
                          style={[styles.supplierCard, {
                            borderColor: selectedSupplier?.id === s.id ? colors.primary : colors.border,
                            backgroundColor: selectedSupplier?.id === s.id ? '#EFF6FF' : colors.background,
                          }]}
                          onPress={() => setSelectedSupplier(s)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.supplierCardName, { color: colors.foreground }]}>{s.name}</Text>
                            {!!s.phone && <Text style={[styles.supplierCardPhone, { color: colors.mutedForeground }]}>{s.phone}</Text>}
                          </View>
                          {selectedSupplier?.id === s.id && <Feather name="check-circle" size={20} color={colors.primary} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.nextBtn, { marginTop: 18 }]}
                    onPress={() => {
                      if (!selectedSupplier && !isNewSupplier) { showToast('اختر موردًا', 'error'); return; }
                      if (isNewSupplier && !newSupplierName.trim()) { showToast('أدخل اسم المورد', 'error'); return; }
                      setStep('items');
                      setTimeout(() => nameRef.current?.focus(), 200);
                    }}
                  >
                    <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.saveBtnGrad}>
                      <Feather name="arrow-left" size={18} color="#fff" />
                      <Text style={styles.saveBtnText}>التالي: إدخال السلع</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}

            {/* ── Step: Items (POS) ── */}
            {step === 'items' && (
              <>
                <View style={styles.stepHeader}>
                  <TouchableOpacity onPress={() => setStep('supplier')} disabled={saving}>
                    <Feather name="arrow-right" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={[styles.sheetTitle, { color: colors.foreground, flex: 1 }]}>إدخال السلع</Text>
                </View>

                <View style={[styles.supplierChipRow]}>
                  <Feather name="user" size={14} color={colors.primary} />
                  <Text style={[styles.supplierChipText, { color: colors.primary }]}>
                    {isNewSupplier ? newSupplierName : selectedSupplier?.name}
                  </Text>
                </View>

                {/* POS input row */}
                <View style={[styles.posRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <TextInput
                    ref={nameRef}
                    style={[styles.posNameInput, { color: colors.foreground }]}
                    placeholder="اسم السلعة"
                    placeholderTextColor={colors.mutedForeground}
                    value={currentName}
                    onChangeText={setCurrentName}
                    textAlign="right"
                    returnKeyType="next"
                    editable={!saving}
                  />
                  <TextInput
                    style={[styles.posQtyInput, { color: colors.foreground, borderColor: colors.border }]}
                    placeholder="كمية"
                    placeholderTextColor={colors.mutedForeground}
                    value={currentQty}
                    onChangeText={setCurrentQty}
                    textAlign="center"
                    returnKeyType="done"
                    onSubmitEditing={addPosItem}
                    editable={!saving}
                  />
                  <TouchableOpacity style={styles.posConfirmBtn} onPress={addPosItem} disabled={saving}>
                    <LinearGradient colors={['#22C55E', '#16A34A']} style={styles.posConfirmGrad}>
                      <Feather name="plus" size={20} color="#fff" />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>

                {/* Running item list */}
                <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {posItems.length === 0 ? (
                    <Text style={[styles.emptyNote, { color: colors.mutedForeground }]}>
                      أدخل اسم السلعة والكمية ثم اضغط +
                    </Text>
                  ) : (
                    posItems.map((item, i) => (
                      <View key={i} style={[styles.posItemRow, { borderColor: colors.border }]}>
                        <TouchableOpacity onPress={() => removePosItem(i)} disabled={saving}>
                          <Feather name="trash-2" size={15} color="#EF4444" />
                        </TouchableOpacity>
                        <TextInput
                          style={[styles.posItemQtyEdit, { borderColor: colors.border, color: colors.foreground }]}
                          value={item.quantity}
                          onChangeText={v => updatePosItemQty(i, v)}
                          textAlign="center"
                          editable={!saving}
                        />
                        <Text style={[styles.posItemName, { color: colors.foreground }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[styles.posItemIndex, { color: colors.mutedForeground }]}>
                          {i + 1}
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>

                {/* Save & Generate PDF button */}
                <TouchableOpacity
                  style={[styles.nextBtn, { opacity: (posItems.length === 0 || saving) ? 0.6 : 1 }]}
                  onPress={handleSaveOrder}
                  disabled={posItems.length === 0 || saving}
                >
                  <LinearGradient
                    colors={['#0C4A6E', '#0369A1']}
                    style={styles.saveBtnGrad}
                  >
                    {saving ? (
                      <>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={styles.saveBtnText}>جارٍ الحفظ...</Text>
                      </>
                    ) : (
                      <>
                        <Feather name="check-circle" size={18} color="#fff" />
                        <Text style={styles.saveBtnText}>
                          حفظ الوصل ({posItems.length} {posItems.length === 1 ? 'سلعة' : 'سلع'})
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  filterRow: { flexDirection: 'row', padding: 16, paddingBottom: 8, gap: 8 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13, fontFamily: 'Changa_500Medium' },

  card: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  supplierName: { fontSize: 17, fontFamily: 'Changa_700Bold', textAlign: 'right', flex: 1 },
  dateText: { fontSize: 12, fontFamily: 'Changa_400Regular' },
  itemsList: { gap: 4 },
  itemRow: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-end' },
  itemName: { fontSize: 14, fontFamily: 'Changa_400Regular', textAlign: 'right', flex: 1 },
  itemQty: { fontSize: 13, fontFamily: 'Changa_700Bold', minWidth: 48, textAlign: 'center' },
  moreItems: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right', fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0' },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  pdfBtnText: { fontSize: 13, fontFamily: 'Changa_600SemiBold' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  actionText: { fontSize: 12, fontFamily: 'Changa_500Medium' },

  fab: { position: 'absolute', left: 20, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', elevation: 8, shadowColor: '#0EA5E9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
  fabGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12, maxHeight: '94%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  supplierChipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  supplierChipText: { fontSize: 14, fontFamily: 'Changa_600SemiBold' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5, marginBottom: 4 },
  toggleText: { fontSize: 15, fontFamily: 'Changa_500Medium' },
  input: { borderRadius: 12, borderWidth: 1, padding: 13, fontSize: 14, fontFamily: 'Changa_400Regular' },
  supplierCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1.5, gap: 10 },
  supplierCardName: { fontSize: 15, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  supplierCardPhone: { fontSize: 13, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  emptyNote: { textAlign: 'center', fontFamily: 'Changa_400Regular', fontSize: 13, paddingVertical: 12 },

  posRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  posNameInput: { flex: 1, padding: 12, fontSize: 14, fontFamily: 'Changa_400Regular' },
  posQtyInput: { width: 72, padding: 12, fontSize: 14, fontFamily: 'Changa_700Bold', borderLeftWidth: 1 },
  posConfirmBtn: { width: 52, height: 52 },
  posConfirmGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  posItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  posItemIndex: { fontSize: 11, fontFamily: 'Changa_400Regular', width: 20, textAlign: 'center' },
  posItemName: { flex: 1, fontSize: 14, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  posItemQtyEdit: { width: 62, borderWidth: 1, borderRadius: 8, padding: 5, fontSize: 13, fontFamily: 'Changa_700Bold', textAlign: 'center' },

  nextBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  saveBtnGrad: { padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  saveBtnText: { fontSize: 16, fontFamily: 'Changa_600SemiBold', color: '#fff' },

  // ── Delete confirmation modal ──────────────────────────────────────────────
  confirmBox: { margin: 28, borderRadius: 20, padding: 24, gap: 12, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
  confirmTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', textAlign: 'center' },
  confirmMsg: { fontSize: 14, fontFamily: 'Changa_400Regular', textAlign: 'center', lineHeight: 22 },
  confirmBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  confirmCancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, padding: 13, alignItems: 'center' },
  confirmCancelText: { fontSize: 15, fontFamily: 'Changa_600SemiBold' },
  confirmDeleteBtn: { flex: 1, backgroundColor: '#DC2626', borderRadius: 12, padding: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  confirmDeleteText: { fontSize: 15, fontFamily: 'Changa_600SemiBold', color: '#fff' },
});
