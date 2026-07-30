import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { backupApi } from '@/utils/api';

const LAST_BACKUP_KEY = '@last_backup_date';
const AUTO_BACKUP_KEY = '@auto_backup_schedule';

type Schedule = 'none' | 'weekly' | 'monthly';

function fmt(iso: string | null) {
  if (!iso) return 'لا توجد نسخة احتياطية';
  const d = new Date(iso);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  const hh    = String(d.getHours()).padStart(2, '0');
  const mm    = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} — ${hh}:${mm}`;
}

export default function BackupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { currentUser } = useAuth();

  const [lastBackup, setLastBackup]   = useState<string | null>(null);
  const [schedule, setSchedule]       = useState<Schedule>('none');
  const [exporting, setExporting]     = useState(false);
  const [restoring, setRestoring]     = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LAST_BACKUP_KEY).then(v => v && setLastBackup(v));
    AsyncStorage.getItem(AUTO_BACKUP_KEY).then(v => v && setSchedule(v as Schedule));
  }, []);

  // ─── Create & share backup ──────────────────────────────────────────────────
  async function handleExport() {
    if (currentUser?.role !== 'admin') {
      showToast('هذه الميزة متاحة للمدير فقط', 'error'); return;
    }
    setExporting(true);
    try {
      const backup = await backupApi.export();
      const json   = JSON.stringify(backup, null, 2);
      const now    = new Date();
      const stamp  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const fileName = `backup-soubeirat-${stamp}.json`;

      if (Platform.OS === 'web') {
        // Web download
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 15_000);
      } else {
        // Native: write to cache dir then share
        const path = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, {
            mimeType: 'application/json',
            dialogTitle: 'مشاركة النسخة الاحتياطية',
            UTI: 'public.json',
          });
        }
      }

      const nowIso = new Date().toISOString();
      await AsyncStorage.setItem(LAST_BACKUP_KEY, nowIso);
      setLastBackup(nowIso);
      showToast('تم إنشاء النسخة الاحتياطية بنجاح', 'success');
    } catch (e) {
      console.error('Export error:', e);
      showToast('فشل إنشاء النسخة الاحتياطية', 'error');
    } finally {
      setExporting(false);
    }
  }

  // ─── Restore ────────────────────────────────────────────────────────────────
  async function handleRestore() {
    if (currentUser?.role !== 'admin') {
      showToast('هذه الميزة متاحة للمدير فقط', 'error'); return;
    }

    const confirm = await new Promise<boolean>(resolve => {
      Alert.alert(
        'تأكيد الاستعادة',
        'سيتم استبدال جميع البيانات الحالية بالبيانات الموجودة في ملف النسخة الاحتياطية. هل أنت متأكد؟',
        [
          { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
          { text: 'استعادة', style: 'destructive', onPress: () => resolve(true) },
        ],
      );
    });
    if (!confirm) return;

    setRestoring(true);
    try {
      let jsonText = '';

      if (Platform.OS === 'web') {
        // Web: use file input
        jsonText = await new Promise<string>((resolve, reject) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json,application/json';
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) { reject(new Error('no_file')); return; }
            const text = await file.text();
            resolve(text);
          };
          input.oncancel = () => reject(new Error('cancelled'));
          document.body.appendChild(input);
          input.click();
          document.body.removeChild(input);
        });
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/json', 'text/plain', '*/*'],
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.[0]?.uri) {
          showToast('تم إلغاء الاستعادة', 'info'); return;
        }
        jsonText = await FileSystem.readAsStringAsync(result.assets[0].uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      const backup = JSON.parse(jsonText);
      if (!backup?.version || !backup?.data) {
        showToast('ملف النسخة الاحتياطية غير صالح', 'error'); return;
      }

      await backupApi.restore(backup);
      showToast('تمت الاستعادة بنجاح', 'success');
    } catch (e: unknown) {
      if (e instanceof Error && (e.message === 'cancelled' || e.message === 'no_file')) {
        showToast('تم إلغاء الاستعادة', 'info');
      } else {
        console.error('Restore error:', e);
        showToast('فشلت عملية الاستعادة', 'error');
      }
    } finally {
      setRestoring(false);
    }
  }

  // ─── Auto backup schedule ───────────────────────────────────────────────────
  async function setAutoSchedule(s: Schedule) {
    setSchedule(s);
    await AsyncStorage.setItem(AUTO_BACKUP_KEY, s);
    const labels: Record<Schedule, string> = {
      none: 'تم إيقاف النسخ الاحتياطي التلقائي',
      weekly: 'تم تفعيل النسخ الاحتياطي الأسبوعي',
      monthly: 'تم تفعيل النسخ الاحتياطي الشهري',
    };
    showToast(labels[s], 'success');
  }

  const pad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: pad + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header card */}
        <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={styles.headerIcon}>
            <Feather name="database" size={28} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>النسخ الاحتياطي</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              آخر نسخة: {fmt(lastBackup)}
            </Text>
          </View>
        </View>

        {/* Create & Download */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>إنشاء نسخة احتياطية</Text>

          <TouchableOpacity
            style={[styles.actionRow, { borderColor: colors.border }]}
            onPress={handleExport}
            disabled={exporting}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#0EA5E920' }]}>
              {exporting
                ? <ActivityIndicator size="small" color="#0EA5E9" />
                : <Feather name="download-cloud" size={20} color="#0EA5E9" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>إنشاء وتنزيل نسخة احتياطية</Text>
              <Text style={[styles.actionSub, { color: colors.mutedForeground }]}>
                تشمل جميع البيانات — صيغة JSON
              </Text>
            </View>
            <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <TouchableOpacity
            style={[styles.actionRow, { borderColor: colors.border }]}
            onPress={handleRestore}
            disabled={restoring}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F59E0B20' }]}>
              {restoring
                ? <ActivityIndicator size="small" color="#F59E0B" />
                : <Feather name="upload-cloud" size={20} color="#F59E0B" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>استعادة من ملف</Text>
              <Text style={[styles.actionSub, { color: colors.mutedForeground }]}>
                اختر ملف JSON من جهازك
              </Text>
            </View>
            <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* What's included */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>محتويات النسخة الاحتياطية</Text>
          {[
            ['users', 'المستخدمون'],
            ['suppliers', 'الموردون'],
            ['customers', 'الزبائن والعائلات'],
            ['expenses', 'الإيرادات والمصاريف'],
            ['orders', 'طلبات الشراء'],
            ['tasks', 'المهام'],
            ['notifications', 'الإشعارات'],
            ['products', 'المنتجات الناقصة'],
          ].map(([icon, label], i, arr) => (
            <React.Fragment key={label}>
              <View style={styles.includeRow}>
                <View style={[styles.checkIcon, { backgroundColor: '#10B98120' }]}>
                  <Feather name="check" size={14} color="#10B981" />
                </View>
                <Text style={[styles.includeLabel, { color: colors.foreground }]}>{label}</Text>
              </View>
              {i < arr.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
            </React.Fragment>
          ))}
        </View>

        {/* Auto backup schedule */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>النسخ الاحتياطي التلقائي</Text>
          {([
            ['none',    'إيقاف', 'لا يتم النسخ تلقائياً'],
            ['weekly',  'أسبوعي', 'نسخة احتياطية كل أسبوع'],
            ['monthly', 'شهري',   'نسخة احتياطية كل شهر'],
          ] as [Schedule, string, string][]).map(([val, label, sub], i, arr) => (
            <React.Fragment key={val}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => setAutoSchedule(val)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.radio,
                  { borderColor: schedule === val ? colors.primary : colors.border },
                ]}>
                  {schedule === val && (
                    <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionLabel, { color: colors.foreground }]}>{label}</Text>
                  <Text style={[styles.actionSub, { color: colors.mutedForeground }]}>{sub}</Text>
                </View>
              </TouchableOpacity>
              {i < arr.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
            </React.Fragment>
          ))}
        </View>

        {/* Note about cloud */}
        <View style={[styles.noteCard, { backgroundColor: colors.card, borderColor: '#0EA5E940' }]}>
          <Feather name="cloud" size={16} color="#0EA5E9" />
          <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
            يمكن ربط التخزين السحابي في المستقبل لرفع النسخ الاحتياطية تلقائياً إلى Google Drive أو iCloud.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  headerCard:   { flexDirection: 'row', alignItems: 'center', margin: 16, padding: 16, borderRadius: 16, borderWidth: 1, gap: 14 },
  headerIcon:   { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 18, fontFamily: 'Changa_700Bold', textAlign: 'right' },
  headerSub:    { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right', marginTop: 2 },
  section:      { marginHorizontal: 16, marginBottom: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: 12, fontFamily: 'Changa_500Medium', padding: 16, paddingBottom: 8, textAlign: 'right' },
  actionRow:    { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  actionIcon:   { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel:  { fontSize: 15, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  actionSub:    { fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right', marginTop: 2 },
  divider:      { height: 1, marginHorizontal: 16 },
  includeRow:   { flexDirection: 'row', alignItems: 'center', padding: 14, paddingVertical: 12, gap: 12 },
  checkIcon:    { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  includeLabel: { flex: 1, fontSize: 14, fontFamily: 'Changa_500Medium', textAlign: 'right' },
  radio:        { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot:     { width: 10, height: 10, borderRadius: 5 },
  noteCard:     { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, padding: 14, borderRadius: 14, borderWidth: 1, gap: 10, alignItems: 'flex-start' },
  noteText:     { flex: 1, fontSize: 12, fontFamily: 'Changa_400Regular', textAlign: 'right', lineHeight: 18 },
});
