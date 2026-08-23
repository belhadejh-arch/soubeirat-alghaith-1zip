import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
  useRef, ReactNode,
} from 'react';
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
const mapExpense  = (r: ApiExpense):  Expense         => ({
  ...r,
  amount: Number(r.amount),
  source: r.source === 'fund' ? 'fund' : r.source === 'cash' ? 'cash' : 'unknown',
  userId: r.userId ?? '',
});
const mapIncome   = (r: ApiIncome):   DailyIncome     => ({
  ...r,
  amount: Number(r.amount),
  openingCash: Number(r.openingCash ?? 0),
  actualCash: Number(r.actualCash ?? 0),
  expectedCash: r.expectedCash == null ? null : Number(r.expectedCash),
  cashDifference: r.cashDifference == null ? null : Number(r.cashDifference),
  cashExpenses: Number(r.cashExpenses ?? 0),
  fundExpenses: Number(r.fundExpenses ?? 0),
  openingFund: Number(r.openingFund ?? 0),
  fundBalance: Number(r.fundBalance ?? 0),
  actualFund: r.actualFund == null ? null : Number(r.actualFund),
  fundDifference: r.fundDifference == null ? null : Number(r.fundDifference),
  unclassifiedExpenses: Number(r.unclassifiedExpenses ?? 0),
  calculationMode: r.calculationMode === 'physical_cash' ? 'physical_cash' : 'legacy',
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
  closeDay: (actualCash: number, actualFund: number, date: string) => Promise<void>;
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

  // Track the last seen supplier ID set to avoid redundant balance reloads
  const supplierKeyRef = useRef<string>('');

  const load = useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      // Fetch all collections in parallel — incomes included for admins so
      // there is no second sequential round-trip after the initial fan-out.
      const isAdmin = currentUser.role === 'admin';
      const [e, p, s, o, t, n, i] = await Promise.all([
        expensesApi.list(),
        productsApi.list(),
        suppliersApi.list(),
        ordersApi.list(),
        tasksApi.list(),
        notificationsApi.list(),
        isAdmin ? expensesApi.listIncomes() : Promise.resolve([] as ApiIncome[]),
      ]);
      setExpenses(e.map(mapExpense));
      setProducts(p.map(mapProduct));
      setSuppliers(s.map(mapSupplier));
      setOrders(o.map(mapOrder));
      setTasks(t.map(mapTask));
      setNotifications(n.map(mapNotif));
      setIncomes(i.map(mapIncome));
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
      supplierKeyRef.current = '';
      return;
    }
    load();
    requestWebNotificationPermission().catch(() => {});
  }, [authLoading, currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => { await load(); }, [load]);

  // Derived: memoised so consumers only re-render when notifications change
  const unreadCount = useMemo(
    () => notifications.filter(n => !n.isRead).length,
    [notifications],
  );

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

  // Only reload balances when the actual set of supplier IDs changes — not on
  // every reference change from setSuppliers(prev.map(...)).
  useEffect(() => {
    const key = suppliers.map(s => s.id).sort().join(',');
    if (!key || key === supplierKeyRef.current) return;
    supplierKeyRef.current = key;
    loadBalances();
  }, [suppliers, loadBalances]);

  // ─── Products ──────────────────────────────────────────────────────────────
  const addProduct = useCallback(async (p: Omit<MissingProduct, 'id'>) => {
    const row = await productsApi.create(p);
    setProducts(prev => [mapProduct(row), ...prev]);
  }, []);

  const updateProductStatus = useCallback(async (id: string, status: MissingProduct['status'], updatedBy: string) => {
    const updatedAt = getCurrentDate();
    await productsApi.updateStatus(id, status, updatedBy, updatedAt);
    setProducts(prev => prev.map(p => p.id === id ? { ...p, status, updatedBy, updatedAt } : p));
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    await productsApi.remove(id);
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);

  // ─── Expenses ──────────────────────────────────────────────────────────────
  const addExpense = useCallback(async (
    e: Omit<Expense, 'id'>,
    supplierDebt?: { supplierId: string; supplierName: string },
  ) => {
    const row = await expensesApi.create(e);
    setExpenses(prev => [mapExpense(row), ...prev]);
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
  }, []);

  const deleteExpense = useCallback(async (id: string) => {
    await expensesApi.remove(id);
    setExpenses(prev => prev.filter(e => e.id !== id));
  }, []);

  const deleteDay = useCallback(async (date: string) => {
    await expensesApi.removeByDate(date);
    setExpenses(prev => prev.filter(e => e.date !== date));
    setIncomes(prev => prev.filter(i => i.date !== date));
  }, []);

  // ─── Daily cash closing ─────────────────────────────────────────────────────
  const closeDay = useCallback(async (actualCash: number, actualFund: number, date: string) => {
    const row = await expensesApi.closeDay(actualCash, actualFund, date);
    setIncomes(prev => {
      const exists = prev.find(i => i.date === date);
      if (exists) return prev.map(i => i.date === date ? mapIncome(row) : i);
      return [mapIncome(row), ...prev];
    });
  }, []);

  const getTodayIncome = useCallback((): number => {
    return incomes.find(i => i.date === getCurrentDate())?.amount ?? 0;
  }, [incomes]);

  const getTodayExpenses = useCallback((): number => {
    const t = getCurrentDate();
    return expenses.filter(e => e.date === t).reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  // ─── Suppliers ─────────────────────────────────────────────────────────────
  const addSupplier = useCallback(async (s: Omit<Supplier, 'id'>): Promise<Supplier> => {
    const row = await suppliersApi.create(s);
    const mapped = mapSupplier(row);
    setSuppliers(prev => [...prev, mapped]);
    return mapped;
  }, []);

  const updateSupplier = useCallback(async (id: string, data: { name?: string; phone?: string }) => {
    const row = await suppliersApi.update(id, data);
    setSuppliers(prev => prev.map(s => s.id === id ? mapSupplier(row) : s));
  }, []);

  const deleteSupplier = useCallback(async (id: string) => {
    await suppliersApi.remove(id);
    setSuppliers(prev => prev.filter(s => s.id !== id));
  }, []);

  // ─── Orders ────────────────────────────────────────────────────────────────
  const addOrder = useCallback(async (o: Omit<PurchaseOrder, 'id' | 'orderNumber'>): Promise<PurchaseOrder> => {
    const payload = { ...o, orderNumber: generateOrderNumber() };
    const row = await ordersApi.create(payload);
    const order = mapOrder(row);
    setOrders(prev => [order, ...prev]);
    return order;
  }, []);

  const updateOrderStatus = useCallback(async (id: string, status: OrderStatus) => {
    await ordersApi.updateStatus(id, status);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  }, []);

  const deleteOrder = useCallback(async (id: string) => {
    const removed = orders.find(o => o.id === id);
    setOrders(prev => prev.filter(o => o.id !== id));
    try {
      await ordersApi.remove(id);
    } catch (err) {
      if (removed) setOrders(prev => [removed, ...prev.filter(o => o.id !== removed!.id)]);
      throw err;
    }
  }, [orders]);

  // ─── Tasks ─────────────────────────────────────────────────────────────────
  const addTask = useCallback(async (t: Omit<Task, 'id'>) => {
    const row = await tasksApi.create(t);
    setTasks(prev => [mapTask(row), ...prev]);
  }, []);

  const updateTaskStatus = useCallback(async (id: string, status: Task['status'], reason?: string) => {
    await tasksApi.updateStatus(id, status, reason);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status, postponeReason: reason } : t));
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    await tasksApi.remove(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  // ─── Notifications ─────────────────────────────────────────────────────────
  const markNotificationRead = useCallback(async (id: string) => {
    await notificationsApi.markRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  }, []);

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, []);

  const addNotification = useCallback(async (n: Omit<AppNotification, 'id'>) => {
    const row = await notificationsApi.create(n);
    setNotifications(prev => [mapNotif(row), ...prev]);
    showWebNotification('سوبيرات الغيث 🛒', n.message);
  }, []);

  // ─── Stable context value ──────────────────────────────────────────────────
  // Memoised so the context object reference only changes when actual data
  // changes, not on every parent render.  This prevents all consumers from
  // re-rendering unnecessarily.
  const value = useMemo<DataCtx>(() => ({
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
  }), [
    products, expenses, incomes, suppliers, orders, tasks, notifications,
    unreadCount, isLoading,
    balances, balancesLoading, loadBalances,
    refresh,
    addProduct, updateProductStatus, deleteProduct,
    addExpense, deleteExpense, deleteDay,
    closeDay, getTodayIncome, getTodayExpenses,
    addSupplier, updateSupplier, deleteSupplier,
    addOrder, updateOrderStatus, deleteOrder,
    addTask, updateTaskStatus, deleteTask,
    markNotificationRead, markAllRead, addNotification,
  ]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
