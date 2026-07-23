import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal,
  TextInput, Platform, KeyboardAvoidingView, ScrollView,
  RefreshControl,
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
import { Task, TaskStatus, TaskPriority } from '@/types';
import { getCurrentDate, getCurrentTime, priorityLabel } from '@/utils/helpers';

const PRIORITY_COLORS: Record<TaskPriority, [string, string]> = {
  high: ['#EF4444', '#DC2626'],
  medium: ['#F59E0B', '#D97706'],
  low: ['#22C55E', '#16A34A'],
};

const STATUS_FILTERS: { label: string; value: 'all' | TaskStatus }[] = [
  { label: 'الكل', value: 'all' },
  { label: 'معلق', value: 'pending' },
  { label: 'منجز', value: 'done' },
  { label: 'مؤجل', value: 'postponed' },
];

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, users } = useAuth();
  const { tasks, addTask, updateTaskStatus, deleteTask, addNotification, refresh } = useData();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showPostpone, setShowPostpone] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [postponeReason, setPostponeReason] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // Time defaults to NOW so tasks record the real creation time
  const [form, setForm] = useState({
    title: '', description: '', workerId: '',
    priority: 'medium' as TaskPriority,
    time: getCurrentTime(),
  });

  const topPad = Platform.OS === 'web' ? 67 + insets.top : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + 60 + insets.bottom : 60 + insets.bottom;

  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const workers = users.filter(u => u.status === 'active');

  const filtered = useMemo(() => tasks.filter(t => filter === 'all' || t.status === filter), [tasks, filter]);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function handleAddTask() {
    if (!form.title.trim()) { showToast('أدخل عنوان المهمة', 'error'); return; }
    if (!form.workerId) { showToast('اختر العامل', 'error'); return; }
    const worker = users.find(u => u.id === form.workerId);
    const now = getCurrentTime();
    await addTask({
      title: form.title.trim(), description: form.description.trim(),
      workerId: form.workerId, workerName: worker?.name ?? '',
      date: getCurrentDate(), time: now, priority: form.priority,
      status: 'pending', createdById: currentUser?.id ?? '', createdByName: currentUser?.name ?? '',
    });
    await addNotification({
      message: `${currentUser?.name} أنشأ مهمة جديدة: ${form.title}`,
      type: 'task', isRead: false, date: getCurrentDate(), time: now,
    });
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('تمت إضافة المهمة', 'success');
    setForm({ title: '', description: '', workerId: '', priority: 'medium', time: getCurrentTime() });
    setShowAdd(false);
  }

  async function handleDone(task: Task) {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await updateTaskStatus(task.id, 'done');
    await addNotification({
      message: `${currentUser?.name} أنجز المهمة: ${task.title}`,
      type: 'task', isRead: false, date: getCurrentDate(), time: getCurrentTime(),
    });
    showToast('تم إنجاز المهمة!', 'success');
  }

  async function handlePostpone() {
    if (!postponeReason.trim()) { showToast('أدخل سبب التأجيل', 'error'); return; }
    await updateTaskStatus(selectedTask!.id, 'postponed', postponeReason.trim());
    await addNotification({
      message: `${currentUser?.name} أجّل المهمة: ${selectedTask?.title}`,
      type: 'task', isRead: false, date: getCurrentDate(), time: getCurrentTime(),
    });
    showToast('تم تأجيل المهمة', 'info');
    setPostponeReason('');
    setShowPostpone(false);
    setSelectedTask(null);
  }

  function confirmDelete(id: string) {
    setDeleteConfirmId(id);
  }

  async function handleConfirmedDelete() {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    try {
      await deleteTask(id);
      showToast('تم حذف المهمة', 'success');
    } catch {
      showToast('تعذّر حذف المهمة', 'error');
    }
  }

  const isMyTask = (t: Task) => t.workerId === currentUser?.id;

  const renderItem = ({ item }: { item: Task }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.priorityStrip, { backgroundColor: PRIORITY_COLORS[item.priority][0] }]} />
      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <Badge variant={item.status} />
          <Badge variant={item.priority} />
          <Text style={[styles.taskTitle, { color: colors.foreground }]}>{item.title}</Text>
        </View>
        {item.description ? <Text style={[styles.taskDesc, { color: colors.mutedForeground }]}>{item.description}</Text> : null}
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{item.workerName}</Text>
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{item.time} • {item.date}</Text>
        </View>
        {item.postponeReason && (
          <Text style={[styles.postponeText, { color: colors.warning }]}>سبب التأجيل: {item.postponeReason}</Text>
        )}

        {/* Actions for pending tasks */}
        {item.status === 'pending' && (canManage || isMyTask(item)) && (
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#DCFCE7' }]} onPress={() => handleDone(item)}>
              <Feather name="check" size={14} color="#16A34A" />
              <Text style={[styles.actionText, { color: '#16A34A' }]}>تم الإنجاز</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FEF3C7' }]} onPress={() => { setSelectedTask(item); setShowPostpone(true); }}>
              <Feather name="clock" size={14} color="#D97706" />
              <Text style={[styles.actionText, { color: '#D97706' }]}>تأجيل</Text>
            </TouchableOpacity>
            {canManage && (
              <TouchableOpacity onPress={() => confirmDelete(item.id)}>
                <Feather name="trash-2" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Admin can delete done/postponed tasks to clean up the list */}
        {canManage && item.status !== 'pending' && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]}
              onPress={() => confirmDelete(item.id)}
            >
              <Feather name="trash-2" size={13} color="#DC2626" />
              <Text style={[styles.actionText, { color: '#DC2626' }]}>حذف</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={styles.headerTitle}>المهام</Text>
        <Text style={styles.headerSub}>{tasks.filter(t => t.status === 'pending').length} مهمة معلقة</Text>
      </LinearGradient>

      {/* Filter */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity key={f.value} style={[styles.filterTab, { borderColor: colors.border, backgroundColor: filter === f.value ? colors.primary : colors.card }]} onPress={() => setFilter(f.value)}>
            <Text style={[styles.filterText, { color: filter === f.value ? '#fff' : colors.mutedForeground }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad, gap: 10 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
        ListEmptyComponent={<EmptyState icon="check-square" title="لا توجد مهام" subtitle="اضغط على + لإضافة مهمة جديدة" />}
      />

      {canManage && (
        <TouchableOpacity style={[styles.fab, { bottom: bottomPad + 16 }]} onPress={() => setShowAdd(true)}>
          <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.fabGrad}>
            <Feather name="plus" size={26} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Add Task Modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={() => setShowAdd(false)} />
          <ScrollView style={[styles.sheet, { backgroundColor: colors.card }]} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>إضافة مهمة</Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>عنوان المهمة *</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="اسم المهمة..." placeholderTextColor={colors.mutedForeground} value={form.title}
              onChangeText={v => setForm(f => ({ ...f, title: v }))} textAlign="right" />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>الوصف</Text>
            <TextInput style={[styles.input, styles.textarea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="وصف تفصيلي للمهمة..." placeholderTextColor={colors.mutedForeground} value={form.description}
              onChangeText={v => setForm(f => ({ ...f, description: v }))} multiline textAlign="right" />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>تعيين إلى *</Text>
            <View style={styles.workerGrid}>
              {workers.map(w => (
                <TouchableOpacity key={w.id} style={[styles.workerChip, { borderColor: colors.border, backgroundColor: form.workerId === w.id ? colors.primary : colors.background }]} onPress={() => setForm(f => ({ ...f, workerId: w.id }))}>
                  <Text style={[styles.workerText, { color: form.workerId === w.id ? '#fff' : colors.foreground }]}>{w.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>الأولوية</Text>
            <View style={styles.priorityRow}>
              {(['low', 'medium', 'high'] as TaskPriority[]).map(p => (
                <TouchableOpacity key={p} style={[styles.priorityChip, { borderColor: PRIORITY_COLORS[p][0], backgroundColor: form.priority === p ? PRIORITY_COLORS[p][0] : 'transparent' }]} onPress={() => setForm(f => ({ ...f, priority: p }))}>
                  <Text style={[styles.priorityText, { color: form.priority === p ? '#fff' : PRIORITY_COLORS[p][0] }]}>{priorityLabel(p)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleAddTask}>
              <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.saveBtnGrad}>
                <Text style={styles.saveBtnText}>إضافة المهمة</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        visible={!!deleteConfirmId}
        title="حذف المهمة"
        message="هل أنت متأكد من الحذف نهائياً؟ لا يمكن التراجع."
        confirmLabel="حذف"
        onConfirm={handleConfirmedDelete}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {/* Postpone Modal */}
      <Modal visible={showPostpone} transparent animationType="slide" onRequestClose={() => setShowPostpone(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={() => setShowPostpone(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>تأجيل المهمة</Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>سبب التأجيل *</Text>
            <TextInput style={[styles.input, styles.textarea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="اكتب سبب التأجيل..." placeholderTextColor={colors.mutedForeground} value={postponeReason}
              onChangeText={setPostponeReason} multiline textAlign="right" autoFocus />
            <TouchableOpacity style={styles.saveBtn} onPress={handlePostpone}>
              <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.saveBtnGrad}>
                <Text style={styles.saveBtnText}>تأجيل المهمة</Text>
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
  filterRow: { flexDirection: 'row', padding: 16, paddingBottom: 8, gap: 8 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13, fontFamily: 'Changa_500Medium' },
  card: { borderRadius: 14, borderWidth: 1, flexDirection: 'row', overflow: 'hidden' },
  priorityStrip: { width: 5 },
  cardContent: { flex: 1, padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  taskTitle: { fontSize: 15, fontFamily: 'Changa_600SemiBold', flex: 1, textAlign: 'right' },
  taskDesc: { fontSize: 13, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontSize: 12, fontFamily: 'Changa_400Regular' },
  postponeText: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-end' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  actionText: { fontSize: 12, fontFamily: 'Changa_500Medium' },
  fab: { position: 'absolute', left: 20, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', shadowColor: '#0EA5E9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  fabGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12, maxHeight: '90%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  sheetTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  fieldLabel: { fontSize: 13, fontFamily: 'Changa_500Medium', textAlign: 'right' },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15, fontFamily: 'Changa_400Regular' },
  textarea: { height: 90, textAlignVertical: 'top' },
  workerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  workerChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  workerText: { fontSize: 13, fontFamily: 'Changa_400Regular' },
  priorityRow: { flexDirection: 'row', gap: 10 },
  priorityChip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  priorityText: { fontSize: 14, fontFamily: 'Changa_600SemiBold' },
  saveBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  saveBtnGrad: { padding: 16, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontFamily: 'Changa_600SemiBold', color: '#fff' },
});
