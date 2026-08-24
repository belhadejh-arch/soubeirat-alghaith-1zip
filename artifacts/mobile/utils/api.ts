import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@auth_token';
let tokenCache: string | null | undefined;
let tokenCacheGeneration = 0;

// ─── Base URL ─────────────────────────────────────────────────────────────────
const BASE = (
  process.env.EXPO_PUBLIC_API_URL ??
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : 'http://localhost:3000')
).replace(/\/$/, '');

// ─── Token management ─────────────────────────────────────────────────────────
export async function getToken(): Promise<string | null> {
  if (tokenCache !== undefined) return tokenCache;
  const readGeneration = tokenCacheGeneration;
  try {
    const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
    if (tokenCacheGeneration === readGeneration && tokenCache === undefined) {
      tokenCache = storedToken;
    }
    return tokenCache ?? null;
  } catch {
    if (tokenCacheGeneration === readGeneration && tokenCache === undefined) {
      tokenCache = null;
    }
    return null;
  }
}
export async function saveToken(token: string): Promise<void> {
  tokenCacheGeneration += 1;
  tokenCache = token;
  await AsyncStorage.setItem(TOKEN_KEY, token);
}
export async function clearToken(): Promise<void> {
  tokenCacheGeneration += 1;
  tokenCache = null;
  await AsyncStorage.removeItem(TOKEN_KEY);
}

// ─── GET in-flight deduplication ─────────────────────────────────────────────
// When two consumers call the same GET URL simultaneously (e.g. two screens on
// focus both calling dailyAccountingApi.status()), they share one network request.
const inflightGets = new Map<string, Promise<unknown>>();

// ─── Core fetch ───────────────────────────────────────────────────────────────
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  authenticated = true,
): Promise<T> {
  const url = `${BASE}/api${path}`;
  const token = authenticated ? await getToken() : null;
  // Authenticated GETs are isolated by token so a request from an old session
  // can never be reused after logout/login.
  const inflightKey = `${url}|${token ?? 'public'}`;

  // Return the existing in-flight promise for duplicate concurrent GET calls
  if (method === 'GET') {
    const existing = inflightGets.get(inflightKey);
    if (existing) return existing as Promise<T>;
  }

  const fetchPromise = (async (): Promise<T> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      // Actual network failure (no connectivity, server down, DNS failure, etc.)
      throw Object.assign(new Error('network_error'), { code: 'network_error' });
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'server_error' }));
      const code = err.error ?? 'server_error';
      throw Object.assign(new Error(code), { status: res.status, code });
    }
    return res.json() as Promise<T>;
  })();

  if (method === 'GET') {
    inflightGets.set(inflightKey, fetchPromise);
    fetchPromise.finally(() => inflightGets.delete(inflightKey));
  }

  return fetchPromise;
}

export const api = {
  get:    <T>(path: string) => request<T>('GET', path),
  post:   <T>(path: string, body: unknown, auth = true) => request<T>('POST', path, body, auth),
  patch:  <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login:  (username: string, password: string) =>
    api.post<{ token: string; user: ApiUser }>('/auth/login', { username, password }, false),
  me:     () => api.get<ApiUser>('/auth/me'),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  list:   () => api.get<ApiUser[]>('/users'),
  create: (data: CreateUserPayload) => api.post<ApiUser>('/users', data),
  update: (id: string, data: Partial<{ status: string; password: string }>) =>
    api.patch<{ ok: boolean }>(`/users/${id}`, data),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/users/${id}`),
};

// ─── Missing Products ─────────────────────────────────────────────────────────
export const productsApi = {
  list:         () => api.get<ApiProduct[]>('/products'),
  create:       (data: unknown) => api.post<ApiProduct>('/products', data),
  updateStatus: (id: string, status: string, updatedBy: string, updatedAt: string) =>
    api.patch<{ ok: boolean }>(`/products/${id}/status`, { status, updatedBy, updatedAt }),
  remove:       (id: string) => api.delete<{ ok: boolean }>(`/products/${id}`),
};

// ─── Expenses ─────────────────────────────────────────────────────────────────
export const expensesApi = {
  list:         () => api.get<ApiExpense[]>('/expenses'),
  create:       (data: unknown) => api.post<ApiExpense>('/expenses', data),
  remove:       (id: string) => api.delete<{ ok: boolean }>(`/expenses/${id}`),
  removeByDate: (date: string) => api.delete<{ ok: boolean }>(`/expenses/by-date/${date}`),
  getAccountingPeriod: () => api.get<ApiExpensePeriodSummary>('/expenses/accounting-period'),
  resetAccountingPeriod: () => api.post<ApiExpensePeriod>('/expenses/accounting-period/reset', {}),
  listIncomes:  () => api.get<ApiIncome[]>('/expenses/incomes'),
  closeDay: (actualCash: number, actualFund: number, date: string) =>
    api.post<ApiIncome>('/expenses/close-day', {
      actualCash: String(actualCash),
      actualFund: String(actualFund),
      date,
    }),
  getStats: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return api.get<{ expenses: ApiExpense[]; incomes: ApiIncome[] }>(`/expenses/stats${qs ? '?' + qs : ''}`);
  },
};

// ─── Daily Accounting ─────────────────────────────────────────────────────────
export const dailyAccountingApi = {
  status: () => api.get<ApiDailyStatus>('/daily-accounting/status'),
  open: (openingCash: number) =>
    api.post<ApiDailyPublicDay>('/daily-accounting/open', { openingCash }),
  close: (actualCash: number) =>
    api.post<ApiDailyCloseResult>('/daily-accounting/close', { actualCash }),
  statistics: () =>
    api.get<ApiDailyStatistics>('/daily-accounting/statistics'),
};

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliersApi = {
  list:        () => api.get<ApiSupplier[]>('/suppliers'),
  create:      (data: unknown) => api.post<ApiSupplier>('/suppliers', data),
  update:      (id: string, data: { name?: string; phone?: string }) => api.patch<ApiSupplier>(`/suppliers/${id}`, data),
  remove:      (id: string) => api.delete<{ ok: boolean }>(`/suppliers/${id}`),
  getBalances: () => api.get<{ supplierId: string; balance: number }[]>('/suppliers/balances'),
};

// ─── Supplier Transactions ────────────────────────────────────────────────────
export const supplierTransactionsApi = {
  list:   (supplierId: string) =>
    api.get<ApiSupplierTransaction[]>(`/suppliers/${supplierId}/transactions`),
  create: (supplierId: string, data: unknown) =>
    api.post<ApiSupplierTransaction>(`/suppliers/${supplierId}/transactions`, data),
  remove: (supplierId: string, txId: string) =>
    api.delete<{ ok: boolean }>(`/suppliers/${supplierId}/transactions/${txId}`),
};

// ─── Purchase Orders ──────────────────────────────────────────────────────────
export const ordersApi = {
  list:         () => api.get<ApiOrder[]>('/orders'),
  create:       (data: unknown) => api.post<ApiOrder>('/orders', data),
  updateStatus: (id: string, status: string) =>
    api.patch<{ ok: boolean }>(`/orders/${id}/status`, { status }),
  remove:       (id: string) => api.delete<{ ok: boolean }>(`/orders/${id}`),
};

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasksApi = {
  list:         () => api.get<ApiTask[]>('/tasks'),
  create:       (data: unknown) => api.post<ApiTask>('/tasks', data),
  updateStatus: (id: string, status: string, postponeReason?: string) =>
    api.patch<{ ok: boolean }>(`/tasks/${id}/status`, { status, postponeReason }),
  remove:       (id: string) => api.delete<{ ok: boolean }>(`/tasks/${id}`),
};

// ─── Customers ────────────────────────────────────────────────────────────────
export const customerFamiliesApi = {
  list:   () => api.get<ApiCustomerFamily[]>('/customers/families'),
  create: (data: { name: string }) => api.post<ApiCustomerFamily>('/customers/families', data),
  update: (id: string, data: { name: string }) => api.patch<ApiCustomerFamily>(`/customers/families/${id}`, data),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/customers/families/${id}`),
};

export const customersApi = {
  list:        (familyId?: string) => api.get<ApiCustomer[]>(`/customers${familyId ? `?familyId=${familyId}` : ''}`),
  create:      (data: unknown) => api.post<ApiCustomer>('/customers', data),
  update:      (id: string, data: unknown) => api.patch<ApiCustomer>(`/customers/${id}`, data),
  remove:      (id: string) => api.delete<{ ok: boolean }>(`/customers/${id}`),
  toggleBlock: (id: string) => api.patch<ApiCustomer>(`/customers/${id}/block`, {}),
  getStats:    () => api.get<ApiCustomerStats>('/customers/stats'),
};

export const customerTransactionsApi = {
  list:   (customerId: string) => api.get<ApiCustomerTransaction[]>(`/customers/${customerId}/transactions`),
  create: (customerId: string, data: unknown) => api.post<ApiCustomerTransaction>(`/customers/${customerId}/transactions`, data),
  remove: (txId: string) => api.delete<{ ok: boolean }>(`/customers/transactions/${txId}`),
  listToday: () => api.get<ApiCustomerTransaction[]>('/customers/stats/today-transactions'),
};

// ─── Backup ───────────────────────────────────────────────────────────────────
export const backupApi = {
  export:  () => api.get<BackupExport>('/backup'),
  restore: (data: BackupExport) => api.post<{ ok: boolean; restoredAt: string }>('/backup/restore', data),
  report:  () => api.get<ReportData>('/backup/report'),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  list:        () => api.get<ApiNotification[]>('/notifications'),
  create:      (data: unknown) => api.post<ApiNotification>('/notifications', data),
  markRead:    (id: string) => api.patch<{ ok: boolean }>(`/notifications/${id}/read`, {}),
  markAllRead: () => api.post<{ ok: boolean }>('/notifications/read-all', {}),
};

// ─── API Types ────────────────────────────────────────────────────────────────
export interface ApiUser {
  id: string; name: string; username: string; phone: string;
  role: string; status: string; createdAt: string;
}
export interface CreateUserPayload {
  name: string; username: string; phone?: string; role: string; password: string;
}
export interface ApiProduct {
  id: string; name: string; quantity: string; section: string;
  workerId: string | null; workerName: string; date: string; time: string;
  status: string; updatedBy: string | null; updatedAt: string | null; createdAt: string;
}
export interface ApiExpense {
  id: string; amount: string; type: string; source: string | null; description: string;
  accountingPeriodId: string | null;
  date: string; time: string; userId: string | null; userName: string; createdAt: string;
}
export interface ApiExpensePeriod {
  id: string;
  periodNumber?: number;
  startedAt: string;
  startedById: string | null;
  startedByName: string;
  currentTotal?: number;
}
export interface ApiExpensePeriodSummary {
  period: ApiExpensePeriod | null;
  currentTotal: number;
  historicalTotal: number;
  historicalCount: number;
  canReset: boolean;
}
export interface ApiIncome {
  id: string; amount: string; date: string; openingCash: string; actualCash: string;
  expectedCash: string | null; cashDifference: string | null;
  cashExpenses: string; fundExpenses: string; openingFund: string; fundBalance: string;
  actualFund: string | null; fundDifference: string | null;
  unclassifiedExpenses: string; calculationMode: string;
  createdAt: string;
}
export interface ApiDailyPublicDay {
  id: string;
  date: string;
  status: string;
  openingCash: string;
  openedByName: string;
  openedAt: string;
}
export interface ApiDailyStatus {
  state: 'not_open' | 'open' | 'closed_today';
  day: ApiDailyPublicDay | null;
  currentFund?: number;
}
export interface ApiDailyCloseResult {
  id: string;
  date: string;
  status: string;
  actualCash: string;
  rossat: string;
  transferredToFund: string;
  totalExpenses: string;
  net: string;
}
export interface ApiDailyStatisticsDay {
  id: string;
  date: string;
  rossat: string;
  totalExpenses: string;
  totalIncome: string;
  net: string;
  actualCash: string | null;
  tillExpenses: string;
  fundExpenses: string;
  closedAt: string | null;
}
export interface ApiDailyStatistics {
  summary: {
    fundBalance: number;
    totalExpenses: number;
    historicalExpenses?: number;
    totalIncome: number;
  };
  days: ApiDailyStatisticsDay[];
}
export interface ApiSupplier {
  id: string; name: string; phone: string; address: string; notes: string; createdAt: string;
}
export interface ApiSupplierTransaction {
  id: string; supplierId: string; supplierName: string;
  type: string; amount: string; note: string; date: string; time: string;
  userId: string | null; userName: string;
  balanceBefore: string; balanceAfter: string;
  createdAt: string;
}
export interface ApiOrder {
  id: string; orderNumber: string; supplierId: string | null;
  supplierName: string; supplierPhone: string;
  items: unknown; date: string; status: string; notes: string; createdAt: string;
}
export interface ApiTask {
  id: string; title: string; description: string;
  workerId: string | null; workerName: string; date: string; time: string;
  priority: string; status: string; postponeReason: string | null;
  createdById: string | null; createdByName: string; createdAt: string;
}
export interface ApiNotification {
  id: string; message: string; type: string;
  isRead: boolean; date: string; time: string; createdAt: string;
}
export interface ApiCustomerFamily {
  id: string; name: string; memberCount: number; totalBalance: number; createdAt: string;
}
export interface ApiCustomer {
  id: string; familyId: string; familyName: string; name: string; phone: string;
  status: string; balance: number; lastPaymentDate: string | null; txCount: number; createdAt: string;
}
export interface ApiCustomerTransaction {
  id: string; customerId: string; customerName: string; familyId: string; familyName: string;
  type: string; amount: string; description: string; userId: string | null; userName: string;
  date: string; time: string; balanceBefore: string; balanceAfter: string; createdAt: string;
}
// ─── Backup / Report Types ────────────────────────────────────────────────────
export interface BackupExport {
  version: string;
  app: string;
  exportedAt: string;
  data: {
    users: unknown[];
    products: unknown[];
    expenses: unknown[];
    incomes: unknown[];
    suppliers: unknown[];
    supplierTransactions: unknown[];
    customerFamilies: unknown[];
    customers: unknown[];
    customerTransactions: unknown[];
    orders: unknown[];
    tasks: unknown[];
    notifications: unknown[];
    dailyAccounts?: unknown[];
    expensePeriods?: unknown[];
  };
}

export interface ReportSummary {
  totalIncome: number;
  totalExpenses: number;
  currentPeriodTotal?: number;
  netProfit: number;
  totalCustomerDebt: number;
  totalSupplierDebt: number;
  userCount: number;
  supplierCount: number;
  customerCount: number;
  customerFamilyCount: number;
  productCount: number;
  taskCount: number;
  notificationCount: number;
  orderCount: number;
}

export interface ReportData {
  generatedAt: string;
  summary: ReportSummary;
  data: {
    users: ApiUser[];
    products: ApiProduct[];
    expenses: ApiExpense[];
    incomes: ApiIncome[];
    suppliers: ApiSupplier[];
    supplierTransactions: ApiSupplierTransaction[];
    customerFamilies: ApiCustomerFamily[];
    customers: ApiCustomer[];
    customerTransactions: ApiCustomerTransaction[];
    orders: ApiOrder[];
    tasks: ApiTask[];
    notifications: ApiNotification[];
    dailyAccounts?: unknown[];
    expensePeriods?: ApiExpensePeriod[];
  };
}

export interface ApiCustomerStats {
  totalDebt: number; familyCount: number; customerCount: number; blockedCount: number;
  todayDebts: number; todayPayments: number;
  topCustomers: { customerId: string; customerName: string; familyName: string; balance: number }[];
  topFamilies: { familyId: string; familyName: string; balance: number }[];
}
