
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
  solutionType: 'Silla Recta' | 'Silla Curva' | 'Plataforma' | 'Elevador Vertical';
  location: 'Interior' | 'Intemperie';
  floors: number;
  stairWidth?: number; // cm
  stairMaterial: 'Hormigón' | 'Madera' | 'Metal' | 'Mármol';
  parkingSide: 'Izquierda' | 'Derecha';
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
}

export interface Material {
  id: string;
  projectId: string;
  name: string;
  quantity: number;
  unit: string;
  minStock: number; // Alerta si baja de esto
  pricePerUnit: number;
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
  date: string;
  data: string; // Base64 string
}

export interface Project {
  id: string;
  type: ProjectType;
  pvData?: PvData;
  elevatorData?: ElevatorData;
  name: string;
  client: string;
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
  documents: ProjectDocument[];
}