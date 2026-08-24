import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '@/types';
import { authApi, usersApi, saveToken, getToken, clearToken, CreateUserPayload } from '@/utils/api';
import { getCurrentDate, getCurrentTime } from '@/utils/helpers';

interface AuthCtx {
  currentUser: User | null;
  users: User[];
  isLoading: boolean;
  sessionVersion: number;
  login: (username: string, password: string) => Promise<'ok' | 'wrong_password' | 'not_found' | 'suspended' | 'network_error' | 'server_error'>;
  logout: () => Promise<void>;
  addUser: (user: CreateUserPayload) => Promise<'ok' | 'username_taken' | 'error'>;
  updateUser: (id: string, updates: Partial<{ status: User['status']; password: string }>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);
const CURRENT_USER_KEY = '@current_user';
const LEGACY_CURRENT_USER_ID_KEY = '@current_user_id';

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
  const sessionVersionRef = useRef(0);
  const [sessionVersion, setSessionVersion] = useState(0);
  const authStorageQueueRef = useRef<Promise<void>>(Promise.resolve());

  const advanceSession = (): number => {
    const next = sessionVersionRef.current + 1;
    sessionVersionRef.current = next;
    setSessionVersion(next);
    return next;
  };

  const queueAuthStorage = (operation: () => Promise<void>): Promise<void> => {
    const next = authStorageQueueRef.current.then(operation, operation);
    authStorageQueueRef.current = next.catch(() => {});
    return next;
  };

  useEffect(() => {
    let active = true;

    const loadUsersInBackground = (expectedSession: number) => {
      setTimeout(() => {
        if (!active || sessionVersionRef.current !== expectedSession) return;
        usersApi.list()
          .then(list => {
            if (active && sessionVersionRef.current === expectedSession) {
              setUsers(list.map(mapUser));
            }
          })
          .catch(() => {});
      }, 800);
    };

    async function init() {
      const expectedSession = sessionVersionRef.current;
      try {
        const [token, cachedUserJson] = await Promise.all([
          getToken(),
          AsyncStorage.getItem(CURRENT_USER_KEY).catch(() => null),
        ]);

        if (!token) return;

        if (cachedUserJson) {
          try {
            const cachedUser = JSON.parse(cachedUserJson) as User;
            if (cachedUser?.id && active && sessionVersionRef.current === expectedSession) {
              // Open the app immediately; validate the token in the background.
              setCurrentUser(cachedUser);
              setIsLoading(false);
            }
          } catch {
            // Ignore an invalid legacy cache and use /auth/me below.
          }
        }

        const user = mapUser(await authApi.me());
        if (!active || sessionVersionRef.current !== expectedSession) return;
        setCurrentUser(user);
        void queueAuthStorage(async () => {
          if (sessionVersionRef.current === expectedSession) {
            await AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
          }
        });
        loadUsersInBackground(expectedSession);
      } catch (error: any) {
        if (!active || sessionVersionRef.current !== expectedSession) return;
        // Preserve an already restored cached session during a temporary network
        // outage; authenticated requests can retry when connectivity returns.
        const cached = await AsyncStorage.getItem(CURRENT_USER_KEY).catch(() => null);
        if (!active || sessionVersionRef.current !== expectedSession) return;
        const code = error?.code ?? '';
        const invalidSession = ['unauthorized', 'invalid_token', 'invalid_session', 'suspended'].includes(code);
        if (!cached || invalidSession) {
          const invalidatedSession = advanceSession();
          await queueAuthStorage(async () => {
            if (sessionVersionRef.current !== invalidatedSession) return;
            await Promise.all([
              clearToken(),
              AsyncStorage.multiRemove([CURRENT_USER_KEY, LEGACY_CURRENT_USER_ID_KEY]),
            ]);
          });
          if (active && sessionVersionRef.current === invalidatedSession) {
            setCurrentUser(null);
            setUsers([]);
          }
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void init();
    return () => { active = false; };
  }, []);

  async function login(
    username: string,
    password: string,
  ): Promise<'ok' | 'wrong_password' | 'not_found' | 'suspended' | 'network_error' | 'server_error'> {
    const sessionWhenLoginStarted = sessionVersionRef.current;
    let expectedSession: number | null = null;
    try {
      const { token, user } = await authApi.login(username, password);
      if (sessionVersionRef.current !== sessionWhenLoginStarted) return 'server_error';
      const mapped = mapUser(user);
      expectedSession = advanceSession();
      // Only fast local persistence is on the critical path. The previous
      // implementation waited for another full users API request before routing.
      await queueAuthStorage(async () => {
        if (sessionVersionRef.current !== expectedSession) return;
        await Promise.all([
          saveToken(token),
          AsyncStorage.multiSet([
            [CURRENT_USER_KEY, JSON.stringify(mapped)],
            [LEGACY_CURRENT_USER_ID_KEY, user.id],
          ]),
        ]);
      });
      if (sessionVersionRef.current !== expectedSession) return 'server_error';
      setCurrentUser(mapped);

      // Employee data is useful later but must never delay entering the app.
      setTimeout(() => {
        if (sessionVersionRef.current !== expectedSession) return;
        void usersApi.list()
          .then(list => {
            if (sessionVersionRef.current === expectedSession) {
              setUsers(list.map(mapUser));
            }
          })
          .catch(() => {});
      }, 800);

      return 'ok';
    } catch (err: any) {
      if (expectedSession !== null && sessionVersionRef.current === expectedSession) {
        const failedSession = advanceSession();
        await queueAuthStorage(async () => {
          if (sessionVersionRef.current !== failedSession) return;
          await Promise.all([
            clearToken(),
            AsyncStorage.multiRemove([CURRENT_USER_KEY, LEGACY_CURRENT_USER_ID_KEY]),
          ]);
        }).catch(() => {});
        if (sessionVersionRef.current === failedSession) {
          setCurrentUser(null);
          setUsers([]);
        }
      }
      const code = err?.code ?? '';
      if (code === 'not_found') return 'not_found';
      if (code === 'wrong_password') return 'wrong_password';
      if (code === 'suspended') return 'suspended';
      if (code === 'network_error') return 'network_error';
      return 'server_error';
    }
  }

  async function logout(): Promise<void> {
    const loggedOutSession = advanceSession();
    setCurrentUser(null);
    setUsers([]);
    await queueAuthStorage(async () => {
      if (sessionVersionRef.current !== loggedOutSession) return;
      await Promise.all([
        clearToken(),
        AsyncStorage.multiRemove([CURRENT_USER_KEY, LEGACY_CURRENT_USER_ID_KEY]),
      ]);
    });
  }

  async function refreshUsers(): Promise<void> {
    const expectedSession = sessionVersionRef.current;
    try {
      const list = await usersApi.list();
      if (sessionVersionRef.current === expectedSession) {
        setUsers(list.map(mapUser));
      }
    } catch {}
  }

  async function addUser(userData: CreateUserPayload): Promise<'ok' | 'username_taken' | 'error'> {
    const expectedSession = sessionVersionRef.current;
    try {
      const created = await usersApi.create(userData);
      if (sessionVersionRef.current === expectedSession) {
        setUsers(prev => [...prev, mapUser(created)]);
      }
      return 'ok';
    } catch (err: any) {
      if (err?.code === 'username_taken') return 'username_taken';
      return 'error';
    }
  }

  async function updateUser(id: string, updates: Partial<{ status: User['status']; password: string }>): Promise<void> {
    const expectedSession = sessionVersionRef.current;
    const expectedUserId = currentUser?.id;
    await usersApi.update(id, updates);
    if (sessionVersionRef.current !== expectedSession) return;
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    if (expectedUserId === id) {
      setCurrentUser(prev => prev ? { ...prev, ...updates } : prev);
    }
  }

  async function deleteUser(id: string): Promise<void> {
    const expectedSession = sessionVersionRef.current;
    await usersApi.remove(id);
    if (sessionVersionRef.current === expectedSession) {
      setUsers(prev => prev.filter(u => u.id !== id));
    }
  }

  return (
    <AuthContext.Provider value={{ currentUser, users, isLoading, sessionVersion, login, logout, addUser, updateUser, deleteUser, refreshUsers }}>
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
