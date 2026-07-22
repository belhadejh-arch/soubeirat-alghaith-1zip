import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal,
  TextInput, Platform, Alert, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { User, UserRole } from '@/types';
import { roleLabel } from '@/utils/helpers';

const ROLE_COLORS: Record<UserRole, [string, string]> = {
  admin: ['#7C3AED', '#5B21B6'],
  supervisor: ['#0EA5E9', '#0369A1'],
  worker: ['#22C55E', '#15803D'],
};

const EMPTY_FORM = { name: '', username: '', phone: '', role: 'worker' as UserRole, password: '' };

export default function UsersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { users, currentUser, addUser, updateUser, deleteUser } = useAuth();
  const { showToast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const bottomPad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;
  const isAdmin = currentUser?.role === 'admin';

  async function handleAddUser() {
    if (!form.name.trim()) { showToast('أدخل الاسم الكامل', 'error'); return; }
    if (!form.username.trim()) { showToast('أدخل اسم المستخدم', 'error'); return; }
    if (form.password.length < 4) { showToast('كلمة المرور يجب أن تكون 4 أحرف على الأقل', 'error'); return; }

    const result = await addUser({
      name: form.name.trim(),
      username: form.username.trim(),
      phone: form.phone.trim(),
      role: form.role,
      password: form.password,
    });

    if (result === 'username_taken') {
      showToast('اسم المستخدم مستخدم بالفعل', 'error');
      return;
    }

    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('تمت إضافة المستخدم', 'success');
    setForm(EMPTY_FORM);
    setShowPass(false);
    setShowAdd(false);
  }

  function toggleStatus(user: User) {
    if (user.id === currentUser?.id) { showToast('لا يمكن إيقاف حسابك الحالي', 'error'); return; }
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    Alert.alert(
      newStatus === 'suspended' ? 'إيقاف المستخدم' : 'تفعيل المستخدم',
      `هل تريد ${newStatus === 'suspended' ? 'إيقاف' : 'تفعيل'} ${user.name}؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'تأكيد', onPress: () => updateUser(user.id, { status: newStatus }) },
      ],
    );
  }

  function confirmDelete(user: User) {
    if (user.id === currentUser?.id) { showToast('لا يمكن حذف حسابك الحالي', 'error'); return; }
    Alert.alert('حذف المستخدم', `هل أنت متأكد من حذف ${user.name}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteUser(user.id) },
    ]);
  }

  const renderUser = ({ item }: { item: User }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <LinearGradient colors={ROLE_COLORS[item.role]} style={styles.avatar}>
        <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
      </LinearGradient>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Badge variant={item.status} size="sm" />
          <Badge variant={item.role} size="sm" />
          <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
        </View>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          @{item.username}
          {item.phone ? `  ·  ${item.phone}` : ''}
        </Text>
      </View>
      {isAdmin && (
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => toggleStatus(item)}>
            <Feather
              name={item.status === 'active' ? 'user-x' : 'user-check'}
              size={18}
              color={item.status === 'active' ? '#F59E0B' : '#22C55E'}
            />
          </TouchableOpacity>
          {item.id !== currentUser?.id && (
            <TouchableOpacity onPress={() => confirmDelete(item)}>
              <Feather name="trash-2" size={18} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={users}
        keyExtractor={i => i.id}
        renderItem={renderUser}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 80, gap: 10 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={[styles.total, { color: colors.mutedForeground }]}>{users.length} مستخدم</Text>
        }
        ListEmptyComponent={<EmptyState icon="users" title="لا يوجد مستخدمون" />}
        scrollEnabled={users.length > 0}
      />

      {isAdmin && (
        <TouchableOpacity style={[styles.fab, { bottom: bottomPad + 20 }]} onPress={() => setShowAdd(true)}>
          <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.fabGrad}>
            <Feather name="user-plus" size={22} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} onPress={() => setShowAdd(false)} />
          <ScrollView
            style={[styles.sheet, { backgroundColor: colors.card }]}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>إضافة مستخدم جديد</Text>

            {/* Name */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>الاسم الكامل *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="مثال: أحمد محمد"
              placeholderTextColor={colors.mutedForeground}
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              textAlign="right"
            />

            {/* Username */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>اسم المستخدم * (للدخول)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="مثال: ahmed2024"
              placeholderTextColor={colors.mutedForeground}
              value={form.username}
              onChangeText={v => setForm(f => ({ ...f, username: v.replace(/\s/g, '') }))}
              autoCapitalize="none"
              autoCorrect={false}
              textAlign="right"
            />

            {/* Phone */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>رقم الهاتف</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="05xxxxxxxx"
              placeholderTextColor={colors.mutedForeground}
              value={form.phone}
              onChangeText={v => setForm(f => ({ ...f, phone: v }))}
              keyboardType="phone-pad"
              textAlign="right"
            />

            {/* Password */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>كلمة المرور *</Text>
            <View style={[styles.passRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShowPass(v => !v)} style={{ padding: 4 }}>
                <Feather name={showPass ? 'eye-off' : 'eye'} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              <TextInput
                style={[styles.passInput, { color: colors.foreground }]}
                placeholder="كلمة المرور"
                placeholderTextColor={colors.mutedForeground}
                value={form.password}
                onChangeText={v => setForm(f => ({ ...f, password: v }))}
                secureTextEntry={!showPass}
                textAlign="right"
              />
            </View>

            {/* Role */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>الدور</Text>
            <View style={styles.roleRow}>
              {(['admin', 'supervisor', 'worker'] as UserRole[]).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleChip, { borderColor: ROLE_COLORS[r][0], backgroundColor: form.role === r ? ROLE_COLORS[r][0] : 'transparent' }]}
                  onPress={() => setForm(f => ({ ...f, role: r }))}
                >
                  <Text style={[styles.roleText, { color: form.role === r ? '#fff' : ROLE_COLORS[r][0] }]}>{roleLabel(r)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleAddUser}>
              <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.saveBtnGrad}>
                <Text style={styles.saveBtnText}>إضافة المستخدم</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  total: { fontSize: 13, fontFamily: 'Changa_400Regular', textAlign: 'right', marginBottom: 4 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, borderWidth: 1, gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontFamily: 'Changa_700Bold', color: '#fff' },
  info: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 15, fontFamily: 'Changa_600SemiBold', flex: 1, textAlign: 'right' },
  meta: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  actions: { gap: 12 },
  fab: { position: 'absolute', left: 20, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', elevation: 8 },
  fabGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  sheetTitle: { fontSize: 20, fontFamily: 'Changa_700Bold', textAlign: 'right', marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontFamily: 'Changa_500Medium', textAlign: 'right', marginBottom: 4 },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15, fontFamily: 'Changa_400Regular', marginBottom: 12 },
  passRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, marginBottom: 12 },
  passInput: { flex: 1, paddingVertical: 14, fontSize: 15, fontFamily: 'Changa_400Regular' },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  roleChip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  roleText: { fontSize: 14, fontFamily: 'Changa_600SemiBold' },
  saveBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  saveBtnGrad: { padding: 16, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontFamily: 'Changa_600SemiBold', color: '#fff' },
});
