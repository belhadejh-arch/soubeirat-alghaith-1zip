import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@/types';
import { authApi, usersApi, saveToken, getToken, clearToken, CreateUserPayload } from '@/utils/api';
import { getCurrentDate, getCurrentTime } from '@/utils/helpers';

interface AuthCtx {
  currentUser: User | null;
  users: User[];
  isLoading: boolean;
  login: (username: string, password: string) => Promise<'ok' | 'wrong_password' | 'not_found' | 'suspended' | 'network_error'>;
  logout: () => Promise<void>;
  addUser: (user: CreateUserPayload) => Promise<'ok' | 'username_taken' | 'error'>;
  updateUser: (id: string, updates: Partial<{ status: string; password: string }>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

function mapUser(u: { id: string; name: string; username: string; phone: string; role: string; status: string }): User {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    phone: u.phone ?? '',
    role: u.role as User['role'],
    status: u.status as User['status'],
    password: '',  // never stored client-side
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        // Trigger seed (no-op if already seeded)
        await authApi.seed().catch(() => {});

        const token = await getToken();
        if (token) {
          // Restore session: load users to validate token still works
          const list = await usersApi.list();
          const mapped = list.map(mapUser);
          setUsers(mapped);

          // Try to restore current user from stored id
          const storedId = await import('@react-native-async-storage/async-storage')
            .then(m => m.default.getItem('@current_user_id'))
            .catch(() => null);
          if (storedId) {
            const found = mapped.find(u => u.id === storedId);
            if (found) setCurrentUser(found);
          }
        }
      } catch {
        // Token invalid or no network — clear token
        await clearToken();
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  async function login(
    username: string,
    password: string,
  ): Promise<'ok' | 'wrong_password' | 'not_found' | 'suspended' | 'network_error'> {
    try {
      const { token, user } = await authApi.login(username, password);
      await saveToken(token);

      // Save current user id for session restore
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem('@current_user_id', user.id);

      const mapped = mapUser(user);
      setCurrentUser(mapped);

      // Refresh full users list
      const list = await usersApi.list().catch(() => []);
      setUsers(list.map(mapUser));

      return 'ok';
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'not_found') return 'not_found';
      if (code === 'wrong_password') return 'wrong_password';
      if (code === 'suspended') return 'suspended';
      return 'network_error';
    }
  }

  async function logout(): Promise<void> {
    setCurrentUser(null);
    await clearToken();
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem('@current_user_id');
  }

  async function refreshUsers(): Promise<void> {
    try {
      const list = await usersApi.list();
      setUsers(list.map(mapUser));
    } catch {}
  }

  async function addUser(userData: CreateUserPayload): Promise<'ok' | 'username_taken' | 'error'> {
    try {
      const created = await usersApi.create(userData);
      setUsers(prev => [...prev, mapUser(created)]);
      return 'ok';
    } catch (err: any) {
      if (err?.code === 'username_taken') return 'username_taken';
      return 'error';
    }
  }

  async function updateUser(id: string, updates: Partial<{ status: string; password: string }>): Promise<void> {
    await usersApi.update(id, updates);
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    if (currentUser?.id === id) {
      setCurrentUser(prev => prev ? { ...prev, ...updates } : prev);
    }
  }

  async function deleteUser(id: string): Promise<void> {
    await usersApi.remove(id);
    setUsers(prev => prev.filter(u => u.id !== id));
  }

  return (
    <AuthContext.Provider value={{ currentUser, users, isLoading, login, logout, addUser, updateUser, deleteUser, refreshUsers }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { getCurrentDate, getCurrentTime };
