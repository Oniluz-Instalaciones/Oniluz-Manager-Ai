
export enum ProjectStatus {
  PLANNING = 'En Planificación',
  IN_PROGRESS = 'En Curso',
  COMPLETED = 'Completado',
  PAUSED = 'Pausado',
}

export enum Priority {
  LOW = 'Baja',
  MEDIUM = 'Media',
  HIGH = 'Alta',
  CRITICAL = 'Crítica',
}

export type ProjectType = 'General' | 'Photovoltaic' | 'Elevator';

export interface PvData {
  peakPower: number; // kWp
  modulesCount: number;
  inverterModel: string;
  hasBattery: boolean;
  batteryCapacity?: number; // kWh
  installationType: 'Residential' | 'Industrial' | 'Solar Farm';
}

export interface ElevatorData {
  solutionType: 'Nexus' | 'Vectio' | 'Supes' | 'Nexus 2:1' | 'Silla Recta' | 'Silla Curva' | 'Plataforma' | 'Elevador Vertical';
  location: 'Interior' | 'Intemperie';
  floors: number;
  installationHeight?: number; // Changed from stairWidth (cm) to Height (m)
  stairMaterial: 'Hormigón' | 'Madera' | 'Metal' | 'Mármol';
  parkingSide: 'Izquierda' | 'Derecha';
  distanceFromBase?: number; // km from Oropesa
}

export interface Transaction {
  id: string;
  projectId: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  date: string;
  description: string;
  userName?: string; // New field for the user who created it
  relatedDocumentId?: string; // Link to a ProjectDocument (ticket/invoice image)
}

export interface InventoryMovement {
  id: string;
  type: 'IN' | 'OUT';
  quantity: number;
  date: string;
  description?: string; // e.g., "Initial Stock", "Invoice #123", "Manual Adjustment"
  projectId?: string;
  invoiceId?: string;
  balanceAfter?: number; // Running balance after this movement
}

export interface Material {
  id: string;
  projectId: string;
  name: string;
  quantity: number;
  unit: string;
  minStock: number; // Alerta si baja de esto
  pricePerUnit: number;
  packageSize?: number; // Cantidad por paquete/bolsa
  movements?: InventoryMovement[]; // History of changes
  createdAt?: string;
}

export interface Incident {
  id: string;
  projectId: string;
  title: string;
  description: string;
  priority: Priority;
  status: 'Open' | 'Resolved';
  date: string;
}

export interface PriceItem {
  id: string;
  name: string;
  unit: string;
  price: number;
  category: string;
  discount?: number; // Percentage discount detected by AI
}

export interface BudgetItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  pricePerUnit: number;
  category: string; // 'Material' | 'Mano de Obra' | 'Maquinaria'
}

export interface Budget {
  id: string;
  projectId: string;
  name: string;
  date: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected';
  items: BudgetItem[];
  total: number;
  aiPrompt?: string;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  name: string;
  type: 'image' | 'pdf' | 'other';
  category?: 'general' | 'technical' | 'financial'; // Updated to include financial
  date: string;
  data: string; // Base64 string
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  id: string;
  projectId: string;
  number: string;
  date: string;
  dueDate?: string;
  clientName: string;
  clientAddress?: string;
  clientNif?: string;
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number; // e.g., 21
  taxAmount: number;
  total: number;
  status: 'Draft' | 'Sent' | 'Paid';
  stockDeducted?: boolean; // Flag to prevent double deduction
}

export interface Project {
  id: string;
  type: ProjectType;
  pvData?: PvData;
  elevatorData?: ElevatorData;
  name: string;
  client: string;
  clientPhone?: string; // Nuevo campo
  clientEmail?: string; // Nuevo campo
  location: string;
  status: ProjectStatus;
  progress: number; // 0 - 100
  startDate: string;
  endDate?: string; // New field for Calendar
  description: string;
  budget: number;
  transactions: Transaction[];
  materials: Material[];
  incidents: Incident[];
  budgets?: Budget[];
  invoices?: Invoice[];
  invoiceData?: Invoice[]; // Legacy/Embedded storage for invoices
  documents: ProjectDocument[];
}

export interface FinancialKPIs {
  netMargin: number;
  totalRevenue: number;
  totalExpenses: number;
  estimatedVAT: number; // Cálculo de IVA 21%
  fixedExpensesRatio: number;
  variableExpensesRatio: number;
}

export interface ProjectProfitability {
  projectId: string;
  projectName: string;
  revenue: number;
  expenses: number;
  margin: number;
  status: 'profit' | 'loss' | 'warning';
}

// --- Internal Finance Types ---

export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  frequency: 'Monthly' | 'Quarterly' | 'Yearly';
  category: 'Rent' | 'Utilities' | 'Insurance' | 'Software' | 'Other';
  nextDueDate?: string;
}

export interface Employee {
  id: string;
  name: string;
  role: 'Technician' | 'Admin' | 'Manager';
  grossSalary: number; // Annual
  socialSecurityCost: number; // Annual (Company cost)
  contractHours: number; // Annual hours
  holidays: number; // Days per year
}

export interface Asset {
  id: string;
  name: string;
  type: 'Vehicle' | 'Tool' | 'Equipment';
  purchaseDate: string;
  cost: number;
  usefulLifeYears: number;
  residualValue: number;
}

export interface Tax {
  id: string;
  name: string;
  model: '303' | '111' | '202';
  amount: number;
  dueDate: string;
  status: 'Pending' | 'Paid';
}

export interface InternalFinancialState {
  cashBalance: number; // Current money in bank
  fixedExpenses: FixedExpense[];
  employees: Employee[];
  assets: Asset[];
  taxes: Tax[];
}