export type UserRole = 'admin' | 'supervisor' | 'worker';
export type UserStatus = 'active' | 'suspended';
export type ProductStatus = 'pending' | 'ordered' | 'cancelled' | 'unavailable';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'done' | 'postponed';
export type OrderStatus = 'draft' | 'sent' | 'received';

export interface User {
  id: string;
  name: string;
  username: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  password: string;
  avatar?: string;
}

export interface MissingProduct {
  id: string;
  name: string;
  quantity: string;
  section: string;
  workerId: string;
  workerName: string;
  date: string;
  time: string;
  status: ProductStatus;
  updatedBy?: string;
  updatedAt?: string;
}

export interface Expense {
  id: string;
  amount: number;
  type: string;
  description: string;
  date: string;
  time: string;
  userId: string;
  userName: string;
}

export interface DailyIncome {
  id: string;
  amount: number;
  date: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
}

export interface SupplierTransaction {
  id: string;
  supplierId: string;
  supplierName: string;
  type: 'debt' | 'payment';
  amount: number;
  note: string;
  date: string;
  createdAt?: string;
}

export interface PurchaseOrderItem {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  notes: string;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  items: PurchaseOrderItem[];
  date: string;
  status: OrderStatus;
  notes: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  workerId: string;
  workerName: string;
  date: string;
  time: string;
  priority: TaskPriority;
  status: TaskStatus;
  postponeReason?: string;
  createdById: string;
  createdByName: string;
}

export interface AppNotification {
  id: string;
  message: string;
  type: 'product' | 'task' | 'order' | 'system';
  isRead: boolean;
  date: string;
  time: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  date: string;
  time: string;
}

export interface CustomerFamily {
  id: string;
  name: string;
  memberCount: number;
  totalBalance: number;
  createdAt?: string;
}

export interface Customer {
  id: string;
  familyId: string;
  familyName: string;
  name: string;
  phone: string;
  status: 'active' | 'blocked';
  balance: number;
  lastPaymentDate: string | null;
  txCount: number;
  createdAt?: string;
}

export interface CustomerTransaction {
  id: string;
  customerId: string;
  customerName: string;
  familyId: string;
  familyName: string;
  type: 'debt' | 'payment';
  amount: number;
  description: string;
  userId: string | null;
  userName: string;
  date: string;
  time: string;
  balanceBefore: number;
  balanceAfter: number;
  createdAt?: string;
}

export interface CustomerStats {
  totalDebt: number;
  familyCount: number;
  customerCount: number;
  blockedCount: number;
  todayDebts: number;
  todayPayments: number;
  topCustomers: { customerId: string; customerName: string; familyName: string; balance: number }[];
  topFamilies: { familyId: string; familyName: string; balance: number }[];
}
