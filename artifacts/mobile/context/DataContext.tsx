import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import {
  MissingProduct, Expense, DailyIncome, Supplier,
  PurchaseOrder, Task, AppNotification, OrderStatus,
} from '@/types';
import {
  productsApi, expensesApi, suppliersApi, ordersApi, tasksApi, notificationsApi,
  supplierTransactionsApi,
  ApiProduct, ApiExpense, ApiIncome, ApiSupplier, ApiOrder, ApiTask, ApiNotification,
} from '@/utils/api';
import type { Dispatch, SetStateAction } from 'react';
import { generateOrderNumber } from '@/utils/helpers';
import { useAuth } from '@/context/AuthContext';

// ─── Web Notifications helper ─────────────────────────────────────────────────
// Requests permission once and shows a system notification if granted.
// Works in AppCreator24 / Median.co WebView and standard browsers.
// On native Expo builds, this is a no-op (expo-notifications handles it).
function showWebNotification(title: string, body: string) {
  if (Platform.OS !== 'web') return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, dir: 'rtl', lang: 'ar', icon: '/icon.png' });
  } catch {
    // Not all WebViews support the Notification constructor — fail silently
  }
}

async function requestWebNotificationPermission() {
  if (Platform.OS !== 'web') return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission().catch(() => {});
  }
}

// ─── Mappers: DB row → App type ───────────────────────────────────────────────
const mapProduct  = (r: ApiProduct):  MissingProduct  => ({ ...r, workerId: r.workerId ?? '', updatedBy: r.updatedBy ?? undefined, updatedAt: r.updatedAt ?? undefined, status: r.status as MissingProduct['status'] });
const mapExpense  = (r: ApiExpense):  Expense         => ({ ...r, amount: Number(r.amount), source: r.source === 'fund' ? 'fund' : 'cash', userId: r.userId ?? '' });
const mapIncome   = (r: ApiIncome):   DailyIncome     => ({
  ...r,
  amount: Number(r.amount),
  openingCash: Number(r.openingCash ?? 0),
  actualCash: Number(r.actualCash ?? 0),
  cashExpenses: Number(r.cashExpenses ?? 0),
  fundExpenses: Number(r.fundExpenses ?? 0),
  openingFund: Number(r.openingFund ?? 0),
  fundBalance: Number(r.fundBalance ?? 0),
});
const mapSupplier = (r: ApiSupplier): Supplier        => ({ ...r });
const mapOrder    = (r: ApiOrder):    PurchaseOrder   => ({ ...r, supplierId: r.supplierId ?? '', supplierPhone: r.supplierPhone ?? '', items: (r.items as PurchaseOrder['items']) ?? [], status: r.status as PurchaseOrder['status'], notes: r.notes ?? '' });
const mapTask     = (r: ApiTask):     Task            => ({ ...r, workerId: r.workerId ?? '', createdById: r.createdById ?? '', postponeReason: r.postponeReason ?? undefined, priority: r.priority as Task['priority'], status: r.status as Task['status'] });
const mapNotif    = (r: ApiNotification): AppNotification => ({ ...r, type: r.type as AppNotification['type'] });

interface DataCtx {
  products: MissingProduct[];
  expenses: Expense[];
  incomes: DailyIncome[];
  suppliers: Supplier[];
  orders: PurchaseOrder[];
  tasks: Task[];
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  // Supplier balances (supplierId → balance)
  balances: Record<string, number>;
  balancesLoading: boolean;
  setBalances: Dispatch<SetStateAction<Record<string, number>>>;
  loadBalances: () => Promise<void>;
  refresh: () => Promise<void>;
  addProduct: (p: Omit<MissingProduct, 'id'>) => Promise<void>;
  updateProductStatus: (id: string, status: MissingProduct['status'], updatedBy: string) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addExpense: (e: Omit<Expense, 'id'>, supplierDebt?: { supplierId: string; supplierName: string }) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  deleteDay: (date: string) => Promise<void>;
  closeDay: (actualCash: number, date: string) => Promise<void>;
  getTodayIncome: () => number;
  getTodayExpenses: () => number;
  addSupplier: (s: Omit<Supplier, 'id'>) => Promise<Supplier>;
  updateSupplier: (id: string, data: { name?: string; phone?: string }) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  addOrder: (o: Omit<PurchaseOrder, 'id' | 'orderNumber'>) => Promise<PurchaseOrder>;
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  addTask: (t: Omit<Task, 'id'>) => Promise<void>;
  updateTaskStatus: (id: string, status: Task['status'], reason?: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  addNotification: (n: Omit<AppNotification, 'id'>) => Promise<void>;
}

const DataContext = createContext<DataCtx | null>(null);

function getCurrentDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { currentUser, isLoading: authLoading } = useAuth();

  const [products,      setProducts]      = useState<MissingProduct[]>([]);
  const [expenses,      setExpenses]      = useState<Expense[]>([]);
  const [incomes,       setIncomes]       = useState<DailyIncome[]>([]);
  const [suppliers,     setSuppliers]     = useState<Supplier[]>([]);
  const [orders,        setOrders]        = useState<PurchaseOrder[]>([]);
  const [tasks,         setTasks]         = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading,     setIsLoading]     = useState(false);
  const [balances,      setBalances]      = useState<Record<string, number>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      // Load expenses first and independently. Workers are allowed to see and
      // record expenses even though income endpoints reject them.
      const e = await expensesApi.list();
      setExpenses(e.map(mapExpense));

      const [p, s, o, t, n] = await Promise.all([
        productsApi.list(),
        suppliersApi.list(),
        ordersApi.list(),
        tasksApi.list(),
        notificationsApi.list(),
      ]);
      const i = currentUser.role === 'worker'
        ? [] as ApiIncome[]
        : await expensesApi.listIncomes();
      setProducts(p.map(mapProduct));
      setIncomes(i.map(mapIncome));
      setSuppliers(s.map(mapSupplier));
      setOrders(o.map(mapOrder));
      setTasks(t.map(mapTask));
      setNotifications(n.map(mapNotif));
    } catch {
      // Network unavailable — continue with existing state
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  // Only load data after auth is resolved AND user is logged in
  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      setProducts([]); setExpenses([]); setIncomes([]);
      setSuppliers([]); setOrders([]); setTasks([]);
      setNotifications([]); setIsLoading(false);
      return;
    }
    load();
    // Request web notification permission after login (non-blocking)
    requestWebNotificationPermission().catch(() => {});
  }, [authLoading, currentUser?.id]);

  const refresh = useCallback(async () => { await load(); }, [load]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // ─── Products ──────────────────────────────────────────────────────────────
  async function addProduct(p: Omit<MissingProduct, 'id'>) {
    const row = await productsApi.create(p);
    setProducts(prev => [mapProduct(row), ...prev]);
  }
  async function updateProductStatus(id: string, status: MissingProduct['status'], updatedBy: string) {
    const updatedAt = getCurrentDate();
    await productsApi.updateStatus(id, status, updatedBy, updatedAt);
    setProducts(prev => prev.map(p => p.id === id ? { ...p, status, updatedBy, updatedAt } : p));
  }
  async function deleteProduct(id: string) {
    await productsApi.remove(id);
    setProducts(prev => prev.filter(p => p.id !== id));
  }

  // ─── Expenses ──────────────────────────────────────────────────────────────
  async function addExpense(
    e: Omit<Expense, 'id'>,
    supplierDebt?: { supplierId: string; supplierName: string },
  ) {
     const row = await expensesApi.create(e);
    setExpenses(prev => [mapExpense(row), ...prev]);
    // If a supplier is linked, record the expense as a PAYMENT (deduction from supplier balance)
    if (supplierDebt) {
      await supplierTransactionsApi.create(supplierDebt.supplierId, {
        supplierName: supplierDebt.supplierName,
        type: 'payment',
        amount: String(e.amount),
        note: e.description,
        date: e.date,
        time: e.time,
        userId: e.userId,
        userName: e.userName,
      });
    }
  }
  async function deleteExpense(id: string) {
    await expensesApi.remove(id);
    setExpenses(prev => prev.filter(e => e.id !== id));
  }
  async function deleteDay(date: string) {
    await expensesApi.removeByDate(date);
    setExpenses(prev => prev.filter(e => e.date !== date));
    setIncomes(prev => prev.filter(i => i.date !== date));
  }

  // ─── Daily cash closing ─────────────────────────────────────────────────────
  async function closeDay(actualCash: number, date: string) {
    const row = await expensesApi.closeDay(actualCash, date);
    setIncomes(prev => {
      const exists = prev.find(i => i.date === date);
      if (exists) return prev.map(i => i.date === date ? mapIncome(row) : i);
      return [mapIncome(row), ...prev];
    });
  }
  function getTodayIncome(): number {
    return incomes.find(i => i.date === getCurrentDate())?.amount ?? 0;
  }
  function getTodayExpenses(): number {
    const t = getCurrentDate();
    return expenses.filter(e => e.date === t).reduce((sum, e) => sum + e.amount, 0);
  }

  // ─── Supplier Balances ─────────────────────────────────────────────────────
  const loadBalances = useCallback(async () => {
    setBalancesLoading(true);
    try {
      const rows = await suppliersApi.getBalances();
      const map: Record<string, number> = {};
      rows.forEach(r => { map[r.supplierId] = Number(r.balance); });
      setBalances(map);
    } catch {
      // silently ignore — balances are cosmetic
    } finally {
      setBalancesLoading(false);
    }
  }, []);

  // Load balances whenever suppliers list changes
  useEffect(() => {
    if (suppliers.length > 0) loadBalances();
  }, [suppliers]);

  // ─── Suppliers ─────────────────────────────────────────────────────────────
  async function addSupplier(s: Omit<Supplier, 'id'>): Promise<Supplier> {
    const row = await suppliersApi.create(s);
    const mapped = mapSupplier(row);
    setSuppliers(prev => [...prev, mapped]);
    return mapped;
  }
  async function updateSupplier(id: string, data: { name?: string; phone?: string }) {
    const row = await suppliersApi.update(id, data);
    setSuppliers(prev => prev.map(s => s.id === id ? mapSupplier(row) : s));
  }
  async function deleteSupplier(id: string) {
    await suppliersApi.remove(id);
    setSuppliers(prev => prev.filter(s => s.id !== id));
  }

  // ─── Orders ────────────────────────────────────────────────────────────────
  async function addOrder(o: Omit<PurchaseOrder, 'id' | 'orderNumber'>): Promise<PurchaseOrder> {
    const payload = { ...o, orderNumber: generateOrderNumber() };
    const row = await ordersApi.create(payload);
    const order = mapOrder(row);
    setOrders(prev => [order, ...prev]);
    return order;
  }
  async function updateOrderStatus(id: string, status: OrderStatus) {
    await ordersApi.updateStatus(id, status);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  }
  async function deleteOrder(id: string) {
    // Optimistic: remove from UI immediately so the list updates without waiting
    const removed = orders.find(o => o.id === id);
    setOrders(prev => prev.filter(o => o.id !== id));
    try {
      await ordersApi.remove(id);
    } catch (err) {
      // Rollback if the API call failed
      if (removed) setOrders(prev => [removed, ...prev.filter(o => o.id !== removed!.id)]);
      throw err;
    }
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────
  async function addTask(t: Omit<Task, 'id'>) {
    const row = await tasksApi.create(t);
    setTasks(prev => [mapTask(row), ...prev]);
  }
  async function updateTaskStatus(id: string, status: Task['status'], reason?: string) {
    await tasksApi.updateStatus(id, status, reason);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status, postponeReason: reason } : t));
  }
  async function deleteTask(id: string) {
    await tasksApi.remove(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  // ─── Notifications ─────────────────────────────────────────────────────────
  async function markNotificationRead(id: string) {
    await notificationsApi.markRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  }
  async function markAllRead() {
    await notificationsApi.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }
  async function addNotification(n: Omit<AppNotification, 'id'>) {
    const row = await notificationsApi.create(n);
    setNotifications(prev => [mapNotif(row), ...prev]);
    // Show a system notification when the app is backgrounded or in another tab
    showWebNotification('سوبيرات الغيث 🛒', n.message);
  }

  return (
    <DataContext.Provider value={{
      products, expenses, incomes, suppliers, orders, tasks, notifications,
      unreadCount, isLoading,
      balances, balancesLoading, setBalances, loadBalances,
      refresh,
      addProduct, updateProductStatus, deleteProduct,
      addExpense, deleteExpense, deleteDay,
      closeDay, getTodayIncome, getTodayExpenses,
      addSupplier, updateSupplier, deleteSupplier,
      addOrder, updateOrderStatus, deleteOrder,
      addTask, updateTaskStatus, deleteTask,
      markNotificationRead, markAllRead, addNotification,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
