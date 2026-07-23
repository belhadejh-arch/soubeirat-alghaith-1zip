import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function Index() {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (currentUser) {
      router.replace('/(tabs)');
    } else {
      router.replace('/login');
    }
  }, [isLoading, currentUser]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#fff" size="large" />
    </View>
  );
}
