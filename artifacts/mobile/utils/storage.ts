import AsyncStorage from '@react-native-async-storage/async-storage';

export async function loadData<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export async function saveData<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // silent
  }
}

export async function removeData(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // silent
  }
}

export const KEYS = {
  USERS: 'users',
  CURRENT_USER: 'current_user',
  MISSING_PRODUCTS: 'missing_products',
  EXPENSES: 'expenses',
  DAILY_INCOMES: 'daily_incomes',
  SUPPLIERS: 'suppliers',
  PURCHASE_ORDERS: 'purchase_orders',
  TASKS: 'tasks',
  NOTIFICATIONS: 'notifications',
  ACTIVITY_LOGS: 'activity_logs',
  SETTINGS: 'app_settings',
  SEEDED: 'data_seeded_v2',
};
