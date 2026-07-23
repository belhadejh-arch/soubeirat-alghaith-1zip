import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  TextInput, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!username.trim()) { setError('أدخل اسم المستخدم'); return; }
    if (!password) { setError('أدخل كلمة المرور'); return; }
    setError('');
    setLoading(true);
    const result = await login(username, password);
    setLoading(false);
    if (result === 'ok') {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } else {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (result === 'not_found') setError('اسم المستخدم غير موجود');
      else if (result === 'wrong_password') setError('كلمة المرور غير صحيحة');
      else if (result === 'suspended') setError('تم إيقاف هذا الحساب، تواصل مع المدير');
      else if (result === 'server_error') setError('حدث خطأ في الخادم، حاول مجدداً');
      else setError('تعذّر الاتصال بالخادم، تحقق من الإنترنت وحاول مجدداً');
    }
  }

  return (
    <LinearGradient
      colors={['#0C4A6E', '#0369A1', '#0EA5E9']}
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <View style={styles.inner}>

          {/* Logo */}
          <View style={styles.logoWrap}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>تسجيل الدخول</Text>
            <Text style={styles.cardSub}>نظام إدارة سوبيرات الغيث</Text>

            {/* Username */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>اسم المستخدم</Text>
              <View style={styles.inputRow}>
                <Feather name="user" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="أدخل اسم المستخدم"
                  placeholderTextColor="#94A3B8"
                  value={username}
                  onChangeText={v => { setUsername(v); setError(''); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  textAlign="right"
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>كلمة المرور</Text>
              <View style={styles.inputRow}>
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.inputIcon}>
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color="#94A3B8" />
                </TouchableOpacity>
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  placeholder="أدخل كلمة المرور"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={v => { setPassword(v); setError(''); }}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  textAlign="right"
                />
              </View>
            </View>

            {/* Error — fixed height so card doesn't jump */}
            <View style={styles.errorWrap}>
              {!!error && (
                <View style={styles.errorRow}>
                  <Feather name="alert-circle" size={14} color="#EF4444" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
            </View>

            {/* Submit */}
            <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
              <LinearGradient colors={['#0EA5E9', '#0369A1']} style={styles.btnGrad}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>دخول</Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>للدخول بحساب جديد، تواصل مع المدير</Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  kav: {
    flex: 1,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },
  logoWrap: {
    alignItems: 'center',
  },
  logo: {
    width: 130,
    height: 130,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 24,
    padding: 24,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  cardTitle: {
    fontSize: 22,
    fontFamily: 'Changa_700Bold',
    color: '#0C4A6E',
    textAlign: 'center',
  },
  cardSub: {
    fontSize: 13,
    fontFamily: 'Changa_400Regular',
    color: '#64748B',
    textAlign: 'center',
    marginTop: -6,
  },
  fieldWrap: { gap: 5 },
  fieldLabel: {
    fontSize: 14,
    fontFamily: 'Changa_600SemiBold',
    color: '#334155',
    textAlign: 'right',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    gap: 10,
  },
  inputIcon: { padding: 2 },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: 'Changa_400Regular',
    color: '#1E293B',
  },
  errorWrap: {
    minHeight: 22,
    justifyContent: 'center',
    marginVertical: -4,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontFamily: 'Changa_500Medium',
  },
  btn: { borderRadius: 14, overflow: 'hidden' },
  btnGrad: { padding: 15, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 17, fontFamily: 'Changa_700Bold', color: '#fff' },
  hint: {
    fontSize: 12,
    fontFamily: 'Changa_400Regular',
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
});
