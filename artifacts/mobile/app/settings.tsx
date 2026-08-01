import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Switch, TextInput, ActivityIndicator } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { backupApi } from '@/utils/api';
import { generateComprehensiveReport, shareComprehensiveReport } from '@/utils/reportPdfGenerator';

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isDark, toggleDark } = useTheme();
  const { showToast } = useToast();
  const { currentUser } = useAuth();
  const [storeName, setStoreName] = useState('سوبيرات الغيث');
  const [editingStore, setEditingStore] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  const bottomPad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;

  async function handleGenerateReport() {
    if (generatingReport) return;
    setGeneratingReport(true);
    try {
      showToast('جاري تحميل بيانات التقرير…', 'info');
      const reportData = await backupApi.report();
      showToast('جاري إنشاء ملف PDF…', 'info');
      const uri = await generateComprehensiveReport(reportData, storeName, currentUser?.name ?? 'المدير');
      await shareComprehensiveReport(uri, storeName);
      showToast('تم إنشاء التقرير الشامل بنجاح', 'success');
    } catch (e) {
      console.error('Report error:', e);
      showToast('فشل إنشاء التقرير', 'error');
    } finally {
      setGeneratingReport(false);
    }
  }

  const rows = [
    { icon: 'bell' as const, label: 'الإشعارات الفورية', isSwitch: true, switchValue: true, onSwitch: (v: boolean) => showToast(v ? 'تم تفعيل الإشعارات' : 'تم إيقاف الإشعارات', 'info') },
    { icon: 'moon' as const, label: 'الوضع الداكن', isSwitch: true, switchValue: isDark, onSwitch: toggleDark },
    { icon: 'globe' as const, label: 'اللغة', value: 'العربية' },
    { icon: 'info' as const, label: 'الإصدار', value: '1.0.0' },
    { icon: 'shield' as const, label: 'سياسة الخصوصية', onPress: () => showToast('سياسة الخصوصية', 'info') },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomPad + 24 }} showsVerticalScrollIndicator={false}>

        {/* Store Card */}
        <View style={[styles.storeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={styles.storeIcon}>
            <Feather name="shopping-bag" size={28} color="#fff" />
          </LinearGradient>
          <View style={styles.storeInfo}>
            {editingStore ? (
              <TextInput
                style={[styles.storeInput, { color: colors.foreground, borderColor: colors.primary }]}
                value={storeName}
                onChangeText={setStoreName}
                onBlur={() => { setEditingStore(false); showToast('تم حفظ اسم المتجر', 'success'); }}
                autoFocus
                textAlign="right"
              />
            ) : (
              <Text style={[styles.storeName, { color: colors.foreground }]}>{storeName}</Text>
            )}
            <Text style={[styles.storeLabel, { color: colors.mutedForeground }]}>اسم المتجر</Text>
          </View>
          <TouchableOpacity onPress={() => setEditingStore(v => !v)}>
            <Feather name={editingStore ? 'check' : 'edit-2'} size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Logged-in user info */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>الحساب الحالي</Text>
          <View style={styles.userRow}>
            <View style={[styles.userAvatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.userAvatarText}>{currentUser?.name?.charAt(0) ?? '؟'}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: colors.foreground }]}>{currentUser?.name}</Text>
              <Text style={[styles.userRole, { color: colors.mutedForeground }]}>{currentUser?.phone}</Text>
            </View>
          </View>
        </View>

        {/* Backup Section — admin only */}
        {currentUser?.role === 'admin' && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>💾 النسخ الاحتياطي</Text>

            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push('/backup')}
              activeOpacity={0.7}
            >
              <View style={[styles.rowIcon, { backgroundColor: '#0EA5E920' }]}>
                <Feather name="database" size={18} color="#0EA5E9" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>إدارة النسخ الاحتياطي</Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>إنشاء • استعادة • سجل النسخ</Text>
              </View>
              <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        {/* Reports Section — admin only */}
        {currentUser?.role === 'admin' && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>📄 تحميل التقارير</Text>

            <TouchableOpacity
              style={styles.row}
              onPress={handleGenerateReport}
              disabled={generatingReport}
              activeOpacity={0.7}
            >
              <View style={[styles.rowIcon, { backgroundColor: '#10B98120' }]}>
                {generatingReport
                  ? <ActivityIndicator size="small" color="#10B981" />
                  : <Feather name="file-text" size={18} color="#10B981" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>التقرير الشامل</Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                  PDF بجميع البيانات — إيرادات، مصاريف، موردون، زبائن، مهام…
                </Text>
              </View>
              {!generatingReport && <Feather name="chevron-left" size={18} color={colors.mutedForeground} />}
            </TouchableOpacity>
          </View>
        )}

        {/* Settings Rows */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>التفضيلات</Text>
          {rows.map((row, i) => (
            <React.Fragment key={row.label}>
              <TouchableOpacity
                style={styles.row}
                onPress={row.onPress}
                disabled={!row.onPress && !row.isSwitch}
                activeOpacity={row.onPress ? 0.7 : 1}
              >
                <View style={[styles.rowIcon, { backgroundColor: colors.primary + '20' }]}>
                  <Feather name={row.icon} size={18} color={colors.primary} />
                </View>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{row.label}</Text>
                {row.isSwitch ? (
                  <Switch
                    value={row.switchValue}
                    onValueChange={row.onSwitch}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                ) : row.value ? (
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{row.value}</Text>
                ) : (
                  <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
                )}
              </TouchableOpacity>
              {i < rows.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
            </React.Fragment>
          ))}
        </View>

        <Text style={[styles.brand, { color: colors.mutedForeground }]}>سوبيرات الغيث • نظام إدارة السوبرماركت</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  storeCard: { flexDirection: 'row', alignItems: 'center', margin: 16, padding: 16, borderRadius: 16, borderWidth: 1, gap: 14 },
  storeIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  storeInfo: { flex: 1 },
  storeName: { fontSize: 20, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  storeLabel: { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  storeInput: { fontSize: 20, fontFamily: 'Changa_700Bold', borderBottomWidth: 2, paddingVertical: 4, textAlign: 'right' },
  section: { marginHorizontal: 16, marginBottom: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: 12, fontFamily: 'Changa_500Medium', padding: 16, paddingBottom: 8, textAlign: 'right' },
  userRow: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 8, gap: 12 },
  userAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: 20, fontFamily: 'Changa_700Bold', color: '#fff' },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  userRole: { fontSize: 13, fontFamily: 'Changa_400Regular', textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: 'Changa_500Medium', textAlign: 'right' },
  rowSub: { fontSize: 11, fontFamily: 'Changa_400Regular', textAlign: 'right', marginTop: 1 },
  rowValue: { fontSize: 14, fontFamily: 'Changa_400Regular' },
  divider: { height: 1, marginHorizontal: 16 },
  brand: { textAlign: 'center', fontSize: 12, fontFamily: 'Changa_400Regular', margin: 16 },
});
