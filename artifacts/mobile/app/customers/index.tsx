import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal,
  TextInput, Platform, KeyboardAvoidingView, ActivityIndicator,
  RefreshControl, ScrollView,
} from 'react-native';
import { router, Stack } from 'expo-router';
import ConfirmModal from '@/components/ConfirmModal';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { customerFamiliesApi, customersApi } from '@/utils/api';
import type { CustomerFamily, Customer, CustomerStats } from '@/types';

function fmt(n: number) { return n.toLocaleString('fr-DZ') + ' دج'; }

function StatsCard({ label, value, color, bg, icon }: {
  label: string; value: string; color: string; bg: string;
  icon: keyof typeof Feather.glyphMap;
}) {
  return (
    <View style={[sc.card, { backgroundColor: bg, borderColor: color + '40' }]}>
      <Feather name={icon} size={20} color={color} />
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card: { flex: 1, minWidth: '45%', borderRadius: 14, padding: 16, gap: 6, borderWidth: 1, alignItems: 'flex-end' },
  value: { fontSize: 18, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  label: { fontSize: 12, fontFamily: 'Changa_400Regular', color: '#64748B', textAlign: 'right' },
});

export default function CustomersIndexScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;

  // ─── State ────────────────────────────────────────────────────────────────
  const [families, setFamilies] = useState<CustomerFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeView, setActiveView] = useState<'families' | 'stats'>('families');

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'family'>('name');
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [allCustomersLoading, setAllCustomersLoading] = useState(false);
  const [allCustomersLoaded, setAllCustomersLoaded] = useState(false);

  // Family management
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [showEditFamily, setShowEditFamily] = useState(false);
  const [editingFamily, setEditingFamily] = useState<CustomerFamily | null>(null);
  const [familyName, setFamilyName] = useState('');
  const [deleteFamily, setDeleteFamily] = useState<CustomerFamily | null>(null);

  // Stats
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // ─── Load ─────────────────────────────────────────────────────────────────
  const loadFamilies = useCallback(async () => {
    try {
      const rows = await customerFamiliesApi.list();
      setFamilies(rows.map(r => ({
        ...r,
        memberCount: Number(r.memberCount),
        totalBalance: Number(r.totalBalance),
      })));
    } catch {
      showToast('تعذّر تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFamilies(); }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await loadFamilies();
    if (allCustomersLoaded) {
      loadAllCustomers(true);
    }
    setRefreshing(false);
  }

  const loadAllCustomers = useCallback(async (force = false) => {
    if (allCustomersLoaded && !force) return;
    setAllCustomersLoading(true);
    try {
      const rows = await customersApi.list();
      setAllCustomers(rows.map(r => ({
        ...r,
        status: r.status as 'active' | 'blocked',
        balance: Number(r.balance),
      })));
      setAllCustomersLoaded(true);
    } catch {
      showToast('تعذّر تحميل الزبائن', 'error');
    } finally {
      setAllCustomersLoading(false);
    }
  }, [allCustomersLoaded]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await customersApi.getStats();
      setStats({
        ...s,
        todayDebts: s.todayDebts ?? 0,
        todayPayments: s.todayPayments ?? 0,
      });
    } catch {
      showToast('تعذّر تحميل الإحصائيات', 'error');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeView === 'stats') loadStats();
  }, [activeView]);

  // Trigger loading all customers when switching to name search with a query
  useEffect(() => {
    if (searchMode === 'name' && searchQuery.trim() && !allCustomersLoaded) {
      loadAllCustomers();
    }
  }, [searchMode, searchQuery, allCustomersLoaded]);

  // ─── Filtered results ─────────────────────────────────────────────────────
  const filteredFamilies = useMemo(() => {
    if (searchMode !== 'family' || !searchQuery.trim()) return families;
    const q = searchQuery.toLowerCase();
    return families.filter(f => f.name.toLowerCase().includes(q));
  }, [families, searchQuery, searchMode]);

  const filteredCustomers = useMemo(() => {
    if (searchMode !== 'name' || !searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allCustomers.filter(c => c.name.toLowerCase().includes(q));
  }, [allCustomers, searchQuery, searchMode]);

  const showCustomerResults = searchMode === 'name' && searchQuery.trim().length > 0;

  // ─── Family operations ────────────────────────────────────────────────────
  async function handleAddFamily() {
    if (!familyName.trim()) { showToast('أدخل اسم العائلة', 'error'); return; }
    try {
      const row = await customerFamiliesApi.create({ name: familyName.trim() });
      setFamilies(prev => [...prev, { ...row, memberCount: 0, totalBalance: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      showToast('تم إضافة العائلة', 'success');
      setFamilyName('');
      setShowAddFamily(false);
    } catch (err: any) {
      showToast(err?.code === 'duplicate_family' ? 'العائلة موجودة مسبقاً' : 'حدث خطأ', 'error');
    }
  }

  async function handleEditFamily() {
    if (!editingFamily || !familyName.trim()) { showToast('أدخل اسم العائلة', 'error'); return; }
    try {
      const row = await customerFamiliesApi.update(editingFamily.id, { name: familyName.trim() });
      setFamilies(prev => prev.map(f => f.id === editingFamily.id ? { ...f, name: row.name } : f));
      showToast('تم تحديث اسم العائلة', 'success');
      setFamilyName('');
      setEditingFamily(null);
      setShowEditFamily(false);
    } catch (err: any) {
      showToast(err?.code === 'duplicate_family' ? 'العائلة موجودة مسبقاً' : 'حدث خطأ', 'error');
    }
  }

  async function handleDeleteFamily() {
    if (!deleteFamily) return;
    const f = deleteFamily;
    setDeleteFamily(null);
    try {
      await customerFamiliesApi.remove(f.id);
      setFamilies(prev => prev.filter(x => x.id !== f.id));
      showToast('تم حذف العائلة', 'success');
    } catch {
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }

  // ─── Navigate ─────────────────────────────────────────────────────────────
  function openFamily(f: CustomerFamily) {
    router.push({
      pathname: '/customers/[familyId]/',
      params: {
        familyId: f.id,
        familyName: f.name,
        memberCount: String(f.memberCount),
        totalBalance: String(f.totalBalance),
      },
    });
  }

  function openCustomerDirect(c: Customer) {
    router.push({
      pathname: '/customers/[familyId]/[customerId]',
      params: {
        familyId: c.familyId,
        customerId: c.id,
        customerName: c.name,
        familyName: c.familyName,
        balance: String(c.balance),
        status: c.status,
        phone: c.phone ?? '',
      },
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <LinearGradient colors={['#F97316', '#EA580C']} style={[s.header, { paddingTop: topPad + 8 }]}>
        <View style={s.headerRow}>
          <Text style={s.headerTitle}>💳 ديون الزبائن</Text>
          <View style={s.headerTabs}>
            <TouchableOpacity
              style={[s.headerTab, activeView === 'families' && s.headerTabActive]}
              onPress={() => setActiveView('families')}
            >
              <Text style={[s.headerTabText, activeView === 'families' && s.headerTabTextActive]}>العائلات</Text>
            </TouchableOpacity>
            {isAdmin && (
              <TouchableOpacity
                style={[s.headerTab, activeView === 'stats' && s.headerTabActive]}
                onPress={() => setActiveView('stats')}
              >
                <Text style={[s.headerTabText, activeView === 'stats' && s.headerTabTextActive]}>إحصائيات</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </LinearGradient>

      {/* ── Families View ──────────────────────────────────────────────────── */}
      {activeView === 'families' && (
        <>
          {/* Search bar */}
          <View style={[s.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={17} color={colors.mutedForeground} />
            <TextInput
              style={[s.searchInput, { color: colors.foreground }]}
              placeholder={searchMode === 'name' ? 'بحث عن زبون بالاسم...' : 'بحث عن عائلة...'}
              placeholderTextColor={colors.mutedForeground}
              value={searchQuery}
              onChangeText={setSearchQuery}
              textAlign="right"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Search mode toggle */}
          <View style={s.toggleRow}>
            <TouchableOpacity
              style={[s.toggleBtn, searchMode === 'name' && s.toggleBtnActive]}
              onPress={() => { setSearchMode('name'); setSearchQuery(''); }}
            >
              <Text style={[s.toggleBtnText, searchMode === 'name' && s.toggleBtnTextActive]}>🔍 بالاسم</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toggleBtn, searchMode === 'family' && s.toggleBtnActive]}
              onPress={() => { setSearchMode('family'); setSearchQuery(''); }}
            >
              <Text style={[s.toggleBtnText, searchMode === 'family' && s.toggleBtnTextActive]}>🏠 بالعائلة</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color="#F97316" style={{ marginTop: 50 }} size="large" />
          ) : showCustomerResults ? (
            // Customer name search results
            allCustomersLoading ? (
              <ActivityIndicator color="#F97316" style={{ marginTop: 50 }} size="large" />
            ) : (
              <FlatList
                data={filteredCustomers}
                keyExtractor={i => i.id}
                contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 100, gap: 12 }}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <EmptyState icon="user" title="لا توجد نتائج" subtitle="جرّب اسماً آخر" />
                }
                renderItem={({ item: c }) => (
                  <TouchableOpacity
                    style={[s.customerResult, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => openCustomerDirect(c)}
                    activeOpacity={0.8}
                  >
                    <View style={[s.customerAvatar, { backgroundColor: c.status === 'blocked' ? '#EF4444' : '#F97316' }]}>
                      <Text style={s.avatarText}>{c.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[s.customerName, { color: colors.foreground }]}>{c.name}</Text>
                      <Text style={[s.customerSub, { color: colors.mutedForeground }]}>
                        عائلة {c.familyName}
                        {c.status === 'blocked' ? ' • محظور' : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[s.customerBalance, { color: c.balance > 0 ? '#DC2626' : '#16A34A' }]}>
                        {c.balance > 0 ? fmt(c.balance) : '✅ مسوّى'}
                      </Text>
                      <Feather name="chevron-left" size={16} color={colors.mutedForeground} />
                    </View>
                  </TouchableOpacity>
                )}
              />
            )
          ) : (
            // Families list
            <FlatList
              data={filteredFamilies}
              keyExtractor={i => i.id}
              contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 100, gap: 12 }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#F97316']} tintColor="#F97316" />
              }
              ListEmptyComponent={
                <EmptyState icon="users" title="لا توجد عائلات" subtitle="اضغط + لإضافة عائلة جديدة" />
              }
              renderItem={({ item: f }) => (
                <TouchableOpacity
                  style={[s.familyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => openFamily(f)}
                  activeOpacity={0.8}
                >
                  <LinearGradient colors={['#F97316', '#EA580C']} style={s.familyAvatar}>
                    <Text style={s.avatarText}>{f.name.charAt(0)}</Text>
                  </LinearGradient>
                  <View style={s.familyInfo}>
                    <Text style={[s.familyName, { color: colors.foreground }]}>{f.name}</Text>
                    <View style={s.familyMeta}>
                      <Text style={[s.familyMetaSub, { color: colors.mutedForeground }]}>
                        <Feather name="users" size={12} /> {f.memberCount} فرد
                      </Text>
                      <Text style={[s.familyBalance, { color: f.totalBalance > 0 ? '#DC2626' : '#16A34A' }]}>
                        {f.totalBalance > 0 ? fmt(f.totalBalance) : 'لا ديون'}
                      </Text>
                    </View>
                  </View>
                  {isAdmin && (
                    <View style={s.familyActions}>
                      <TouchableOpacity style={s.iconBtn} onPress={() => {
                        setEditingFamily(f); setFamilyName(f.name); setShowEditFamily(true);
                      }}>
                        <Feather name="edit-2" size={15} color={colors.mutedForeground} />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.iconBtn} onPress={() => setDeleteFamily(f)}>
                        <Feather name="trash-2" size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  )}
                  <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity style={[s.fab, { bottom: bottomPad + 20 }]} onPress={() => { setFamilyName(''); setShowAddFamily(true); }}>
            <LinearGradient colors={['#F97316', '#EA580C']} style={s.fabGrad}>
              <Feather name="plus" size={28} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </>
      )}

      {/* ── Stats View ─────────────────────────────────────────────────────── */}
      {activeView === 'stats' && isAdmin && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40, gap: 14 }}>
          {statsLoading ? (
            <ActivityIndicator color="#F97316" style={{ marginTop: 50 }} size="large" />
          ) : stats ? (
            <>
              {/* Today's cards */}
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>📅 إحصائيات اليوم</Text>
              <View style={s.statsGrid}>
                <StatsCard label="ديون مضافة اليوم" value={fmt(stats.todayDebts)} color="#DC2626" bg="#FEE2E2" icon="trending-up" />
                <StatsCard label="مبالغ مسددة اليوم" value={fmt(stats.todayPayments)} color="#16A34A" bg="#DCFCE7" icon="check-circle" />
              </View>

              {/* Overall cards */}
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>📊 الإجمالي العام</Text>
              <View style={s.statsGrid}>
                <StatsCard label="إجمالي الديون" value={fmt(stats.totalDebt)} color="#DC2626" bg="#FEE2E2" icon="credit-card" />
                <StatsCard label="عدد العائلات" value={String(stats.familyCount)} color="#0369A1" bg="#E0F2FE" icon="home" />
                <StatsCard label="عدد الزبائن" value={String(stats.customerCount)} color="#7C3AED" bg="#EDE9FE" icon="users" />
                <StatsCard label="المحظورون" value={String(stats.blockedCount)} color="#DC2626" bg="#FEE2E2" icon="slash" />
              </View>

              {stats.topCustomers.filter(c => c.balance > 0).length > 0 && (
                <>
                  <Text style={[s.sectionTitle, { color: colors.foreground }]}>🏆 أعلى الزبائن مديونية</Text>
                  {stats.topCustomers.filter(c => c.balance > 0).map((c, i) => (
                    <View key={c.customerId} style={[s.rankRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[s.rankNum, { color: colors.mutedForeground }]}>#{i + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.rankName, { color: colors.foreground }]}>{c.customerName}</Text>
                        <Text style={[s.rankSub, { color: colors.mutedForeground }]}>{c.familyName}</Text>
                      </View>
                      <Text style={s.rankBalance}>{fmt(c.balance)}</Text>
                    </View>
                  ))}
                </>
              )}

              {stats.topFamilies.filter(f => f.balance > 0).length > 0 && (
                <>
                  <Text style={[s.sectionTitle, { color: colors.foreground }]}>🏆 أعلى العائلات مديونية</Text>
                  {stats.topFamilies.filter(f => f.balance > 0).map((f, i) => (
                    <View key={f.familyId} style={[s.rankRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[s.rankNum, { color: colors.mutedForeground }]}>#{i + 1}</Text>
                      <Text style={[s.rankName, { color: colors.foreground, flex: 1 }]}>{f.familyName}</Text>
                      <Text style={s.rankBalance}>{fmt(f.balance)}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          ) : null}
        </ScrollView>
      )}

      {/* ── Add/Edit Family Modals ────────────────────────────────────────── */}
      {[
        { visible: showAddFamily, title: 'إضافة عائلة', onSave: handleAddFamily, onClose: () => setShowAddFamily(false) },
        { visible: showEditFamily, title: 'تعديل اسم العائلة', onSave: handleEditFamily, onClose: () => { setShowEditFamily(false); setEditingFamily(null); } },
      ].map(({ visible, title, onSave, onClose }) => (
        <Modal key={title} visible={visible} transparent animationType="slide" onRequestClose={onClose}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <TouchableOpacity style={s.overlay} onPress={onClose} />
            <View style={[s.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
              <View style={[s.handle, { backgroundColor: colors.border }]} />
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>{title}</Text>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>اسم العائلة *</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="مثال: بلقاسمي" placeholderTextColor={colors.mutedForeground}
                value={familyName} onChangeText={setFamilyName} textAlign="right" autoFocus
              />
              <TouchableOpacity style={s.saveBtn} onPress={onSave}>
                <LinearGradient colors={['#F97316', '#EA580C']} style={s.saveBtnGrad}>
                  <Text style={s.saveBtnText}>حفظ</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ))}

      {/* ── Confirm Delete ────────────────────────────────────────────────── */}
      <ConfirmModal
        visible={!!deleteFamily}
        title="حذف العائلة"
        message={`هل تريد حذف عائلة "${deleteFamily?.name}"؟ سيتم حذف جميع الزبائن وعملياتهم.`}
        confirmLabel="حذف"
        onConfirm={handleDeleteFamily}
        onCancel={() => setDeleteFamily(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerTitle: { fontSize: 18, fontFamily: 'Changa_700Bold', color: '#fff' },
  headerTabs: { flexDirection: 'row', gap: 8 },
  headerTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerTabActive: { backgroundColor: '#fff' },
  headerTabText: { fontSize: 13, fontFamily: 'Changa_500Medium', color: 'rgba(255,255,255,0.85)' },
  headerTabTextActive: { color: '#F97316' },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, marginBottom: 0, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Changa_400Regular' },

  toggleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#F97316' },
  toggleBtnText: { fontSize: 13, fontFamily: 'Changa_500Medium', color: '#64748B' },
  toggleBtnTextActive: { color: '#fff' },

  familyCard: { borderRadius: 16, padding: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  familyAvatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 20, fontFamily: 'Changa_700Bold', color: '#fff' },
  familyInfo: { flex: 1, gap: 5 },
  familyName: { fontSize: 17, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  familyMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  familyMetaSub: { fontSize: 13, fontFamily: 'Changa_400Regular' },
  familyBalance: { fontSize: 14, fontFamily: 'Changa_600SemiBold' },
  familyActions: { flexDirection: 'row', gap: 6 },
  iconBtn: { padding: 8 },

  customerResult: { borderRadius: 16, padding: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  customerAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  customerName: { fontSize: 16, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  customerSub: { fontSize: 13, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  customerBalance: { fontSize: 14, fontFamily: 'Changa_700Bold' },

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

  sectionTitle: { fontSize: 16, fontFamily: 'Changa_700Bold', textAlign: 'right', marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  rankRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, gap: 12 },
  rankNum: { fontSize: 14, fontFamily: 'Changa_700Bold', width: 30 },
  rankName: { fontSize: 15, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  rankSub: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  rankBalance: { fontSize: 15, fontFamily: 'Changa_700Bold', color: '#DC2626' },
});
