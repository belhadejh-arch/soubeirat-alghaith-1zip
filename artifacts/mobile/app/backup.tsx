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
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { backupApi } from '@/utils/api';

const BACKUP_HISTORY_KEY = '@backup_history_v2';

type BackupRecord = {
  id: string;
  fileName: string;
  filePath: string; // documentDirectory path on native, data-URL on web
  createdAt: string; // ISO
  size: number; // bytes
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  const hh    = String(d.getHours()).padStart(2, '0');
  const mm    = String(d.getMinutes()).padStart(2, '0');
  return { date: `${day}/${month}/${year}`, time: `${hh}:${mm}` };
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function BackupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { currentUser } = useAuth();

  const [history, setHistory]             = useState<BackupRecord[]>([]);
  const [creating, setCreating]           = useState(false);
  const [restoringId, setRestoringId]     = useState<string | null>(null);
  const [uploadRestoring, setUploadRestoring] = useState(false);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    try {
      const raw = await AsyncStorage.getItem(BACKUP_HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }

  async function persistHistory(records: BackupRecord[]) {
    setHistory(records);
    await AsyncStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(records));
  }

  // ─── Create backup ──────────────────────────────────────────────────────────
  async function handleCreate() {
    if (currentUser?.role !== 'admin') {
      showToast('هذه الميزة متاحة للمدير فقط', 'error'); return;
    }
    setCreating(true);
    try {
      const backup  = await backupApi.export();
      const json    = JSON.stringify(backup, null, 2);
      const now     = new Date();
      const stamp   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
      const fileName = `backup-soubeirat-${stamp}.json`;
      const size    = new TextEncoder().encode(json).length;

      let filePath = '';
      if (Platform.OS === 'web') {
        // Store as base64 data-URL so we can re-download later
        filePath = `data:application/json;base64,${btoa(unescape(encodeURIComponent(json)))}`;
      } else {
        filePath = `${FileSystem.documentDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(filePath, json, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      const record: BackupRecord = {
        id: Date.now().toString(),
        fileName,
        filePath,
        createdAt: now.toISOString(),
        size,
      };

      await persistHistory([record, ...history]);
      showToast('✅ تم إنشاء النسخة الاحتياطية وحفظها', 'success');
    } catch (e) {
      console.error('Create backup error:', e);
      showToast('فشل إنشاء النسخة الاحتياطية', 'error');
    } finally {
      setCreating(false);
    }
  }

  // ─── Download (share) backup ────────────────────────────────────────────────
  async function handleDownload(record: BackupRecord) {
    try {
      if (Platform.OS === 'web') {
        const a    = document.createElement('a');
        a.href     = record.filePath;
        a.download = record.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        const info = await FileSystem.getInfoAsync(record.filePath);
        if (!info.exists) {
          showToast('الملف غير موجود على الجهاز', 'error'); return;
        }
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(record.filePath, {
            mimeType: 'application/json',
            dialogTitle: 'مشاركة النسخة الاحتياطية',
            UTI: 'public.json',
          });
        } else {
          showToast('المشاركة غير متاحة على هذا الجهاز', 'error');
        }
      }
    } catch (e) {
      console.error('Download error:', e);
      showToast('فشل تنزيل النسخة الاحتياطية', 'error');
    }
  }

  // ─── Perform restore (called directly from Alert button) ────────────────────
  async function performRestore(record: BackupRecord) {
    setRestoringId(record.id);
    try {
      let json = '';
      if (Platform.OS === 'web') {
        const b64 = record.filePath.split(',')[1];
        json = decodeURIComponent(escape(atob(b64)));
      } else {
        const info = await FileSystem.getInfoAsync(record.filePath);
        if (!info.exists) {
          showToast('الملف غير موجود على الجهاز', 'error');
          return;
        }
        json = await FileSystem.readAsStringAsync(record.filePath, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }
      const backup = JSON.parse(json);
      if (!backup?.version || !backup?.data) {
        showToast('ملف النسخة الاحتياطية غير صالح', 'error');
        return;
      }
      await backupApi.restore(backup);
      showToast('تمت الاستعادة بنجاح', 'success');
    } catch (e) {
      console.error('Restore error:', e);
      showToast('فشلت عملية الاستعادة', 'error');
    } finally {
      setRestoringId(null);
    }
  }

  // ─── Restore from saved record ──────────────────────────────────────────────
  function handleRestore(record: BackupRecord) {
    Alert.alert(
      'تأكيد الاستعادة',
      `سيتم استبدال جميع البيانات الحالية ببيانات هذه النسخة.\n\n${record.fileName}\n\nهل أنت متأكد؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'استعادة', style: 'destructive', onPress: () => performRestore(record) },
      ],
    );
  }

  // ─── Perform delete (called directly from Alert button) ──────────────────────
  async function performDelete(record: BackupRecord) {
    try {
      if (Platform.OS !== 'web') {
        const info = await FileSystem.getInfoAsync(record.filePath);
        if (info.exists) await FileSystem.deleteAsync(record.filePath);
      }
      // Use functional update to avoid stale closure on history
      const raw = await AsyncStorage.getItem(BACKUP_HISTORY_KEY);
      const current: BackupRecord[] = raw ? JSON.parse(raw) : [];
      await persistHistory(current.filter(r => r.id !== record.id));
      showToast('تم حذف النسخة الاحتياطية', 'success');
    } catch (e) {
      console.error('Delete error:', e);
      showToast('فشل حذف النسخة الاحتياطية', 'error');
    }
  }

  // ─── Delete backup record ───────────────────────────────────────────────────
  function handleDelete(record: BackupRecord) {
    Alert.alert(
      'حذف النسخة الاحتياطية',
      `هل تريد حذف "${record.fileName}" نهائياً؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: () => performDelete(record) },
      ],
    );
  }

  // ─── Perform upload restore (called directly from Alert button) ─────────────
  async function performUploadRestore() {
    setUploadRestoring(true);
    try {
      let jsonText = '';

      if (Platform.OS === 'web') {
        jsonText = await new Promise<string>((resolve, reject) => {
          const input    = document.createElement('input');
          input.type     = 'file';
          input.accept   = '.json,application/json';
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) { reject(new Error('no_file')); return; }
            resolve(await file.text());
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
          showToast('تم إلغاء الاستعادة', 'info');
          return;
        }
        jsonText = await FileSystem.readAsStringAsync(result.assets[0].uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      const backup = JSON.parse(jsonText);
      if (!backup?.version || !backup?.data) {
        showToast('ملف النسخة الاحتياطية غير صالح', 'error');
        return;
      }
      await backupApi.restore(backup);
      showToast('تمت الاستعادة بنجاح', 'success');
    } catch (e: unknown) {
      if (e instanceof Error && (e.message === 'cancelled' || e.message === 'no_file')) {
        showToast('تم إلغاء الاستعادة', 'info');
      } else {
        console.error('Upload restore error:', e);
        showToast('فشلت عملية الاستعادة', 'error');
      }
    } finally {
      setUploadRestoring(false);
    }
  }

  // ─── Upload from device & restore ──────────────────────────────────────────
  function handleUploadRestore() {
    if (currentUser?.role !== 'admin') {
      showToast('هذه الميزة متاحة للمدير فقط', 'error');
      return;
    }
    Alert.alert(
      'تأكيد الاستعادة',
      'سيتم استبدال جميع البيانات الحالية بالبيانات الموجودة في الملف المختار. هل أنت متأكد؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'متابعة', style: 'destructive', onPress: () => performUploadRestore() },
      ],
    );
  }

  const pad = Platform.OS === 'web' ? 34 + insets.bottom : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: pad + 24 }} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={styles.headerIcon}>
            <Feather name="database" size={28} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>💾 النسخ الاحتياطي</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {history.length > 0
                ? `${history.length} نسخة محفوظة`
                : 'لا توجد نسخ احتياطية بعد'}
            </Text>
          </View>
        </View>

        {/* ── Create + Upload ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>

          {/* Create */}
          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleCreate}
            disabled={creating}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#0EA5E920' }]}>
              {creating
                ? <ActivityIndicator size="small" color="#0EA5E9" />
                : <Feather name="plus-circle" size={20} color="#0EA5E9" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>➕ إنشاء نسخة احتياطية</Text>
              <Text style={[styles.actionSub, { color: colors.mutedForeground }]}>
                حفظ كامل لجميع بيانات التطبيق
              </Text>
            </View>
            {!creating && <Feather name="chevron-left" size={18} color={colors.mutedForeground} />}
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Upload from device */}
          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleUploadRestore}
            disabled={uploadRestoring}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#8B5CF620' }]}>
              {uploadRestoring
                ? <ActivityIndicator size="small" color="#8B5CF6" />
                : <Feather name="folder" size={20} color="#8B5CF6" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>📂 رفع نسخة من الجهاز</Text>
              <Text style={[styles.actionSub, { color: colors.mutedForeground }]}>
                استعادة من ملف JSON محفوظ مسبقاً
              </Text>
            </View>
            {!uploadRestoring && <Feather name="chevron-left" size={18} color={colors.mutedForeground} />}
          </TouchableOpacity>
        </View>

        {/* ── Backup History ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>سجل النسخ الاحتياطية</Text>

          {history.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="inbox" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                لا توجد نسخ احتياطية بعد
              </Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                اضغط «إنشاء نسخة احتياطية» لبدء السجل
              </Text>
            </View>
          ) : (
            history.map((record, i) => {
              const { date, time } = formatDate(record.createdAt);
              const isRestoring    = restoringId === record.id;
              return (
                <React.Fragment key={record.id}>
                  <View style={styles.recordRow}>
                    {/* File icon */}
                    <View style={[styles.recordIcon, { backgroundColor: '#0EA5E915' }]}>
                      <Feather name="file-text" size={18} color="#0EA5E9" />
                    </View>

                    {/* Info */}
                    <View style={styles.recordInfo}>
                      <Text style={[styles.recordName, { color: colors.foreground }]} numberOfLines={1}>
                        {record.fileName}
                      </Text>
                      <View style={styles.recordMeta}>
                        <Feather name="calendar" size={10} color={colors.mutedForeground} />
                        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{date}</Text>
                        <Text style={[styles.metaSep, { color: colors.mutedForeground }]}>•</Text>
                        <Feather name="clock" size={10} color={colors.mutedForeground} />
                        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{time}</Text>
                        <Text style={[styles.metaSep, { color: colors.mutedForeground }]}>•</Text>
                        <Feather name="hard-drive" size={10} color={colors.mutedForeground} />
                        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{formatSize(record.size)}</Text>
                      </View>
                    </View>

                    {/* Action buttons */}
                    <View style={styles.recordBtns}>
                      {/* Download */}
                      <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: '#0EA5E915' }]}
                        onPress={() => handleDownload(record)}
                        activeOpacity={0.7}
                      >
                        <Feather name="download" size={14} color="#0EA5E9" />
                      </TouchableOpacity>

                      {/* Restore */}
                      <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: '#10B98115' }]}
                        onPress={() => handleRestore(record)}
                        disabled={isRestoring}
                        activeOpacity={0.7}
                      >
                        {isRestoring
                          ? <ActivityIndicator size="small" color="#10B981" />
                          : <Feather name="refresh-cw" size={14} color="#10B981" />}
                      </TouchableOpacity>

                      {/* Delete */}
                      <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: '#EF444415' }]}
                        onPress={() => handleDelete(record)}
                        activeOpacity={0.7}
                      >
                        <Feather name="trash-2" size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {i < history.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  )}
                </React.Fragment>
              );
            })
          )}
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
  emptyState:   { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyText:    { fontSize: 15, fontFamily: 'Changa_500Medium' },
  emptyHint:    { fontSize: 12, fontFamily: 'Changa_400Regular' },
  recordRow:    { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  recordIcon:   { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recordInfo:   { flex: 1, gap: 4, minWidth: 0 },
  recordName:   { fontSize: 12, fontFamily: 'Changa_600SemiBold', textAlign: 'right' },
  recordMeta:   { flexDirection: 'row', alignItems: 'center', gap: 3, justifyContent: 'flex-end', flexWrap: 'wrap' },
  metaText:     { fontSize: 10, fontFamily: 'Changa_400Regular' },
  metaSep:      { fontSize: 10, fontFamily: 'Changa_400Regular', marginHorizontal: 1 },
  recordBtns:   { flexDirection: 'row', gap: 5, flexShrink: 0 },
  iconBtn:      { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
