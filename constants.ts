import { Project, ProjectStatus, Priority } from './types';

export const PRICE_DATABASE = [
  { name: 'Cable RV-K 3G1.5', unit: 'm', price: 0.85, category: 'Material' },
  { name: 'Cable RV-K 3G2.5', unit: 'm', price: 1.20, category: 'Material' },
  { name: 'Cable RV-K 3G6', unit: 'm', price: 2.50, category: 'Material' },
  { name: 'Tubo Corrugado 20mm', unit: 'm', price: 0.45, category: 'Material' },
  { name: 'Tubo Corrugado 25mm', unit: 'm', price: 0.60, category: 'Material' },
  { name: 'Caja Registro 100x100', unit: 'ud', price: 3.20, category: 'Material' },
  { name: 'Mecanismo Enchufe Schuko', unit: 'ud', price: 6.50, category: 'Material' },
  { name: 'Mecanismo Interruptor', unit: 'ud', price: 5.80, category: 'Material' },
  { name: 'Magnetotérmico 10A', unit: 'ud', price: 8.50, category: 'Material' },
  { name: 'Magnetotérmico 16A', unit: 'ud', price: 8.50, category: 'Material' },
  { name: 'Diferencial 40A 30mA', unit: 'ud', price: 25.00, category: 'Material' },
  { name: 'Cuadro Eléctrico 12 Elem.', unit: 'ud', price: 35.00, category: 'Material' },
  { name: 'Hora Oficial 1ª', unit: 'h', price: 45.00, category: 'Mano de Obra' },
  { name: 'Hora Oficial 2ª', unit: 'h', price: 35.00, category: 'Mano de Obra' },
  { name: 'Boletín Eléctrico (CIE)', unit: 'ud', price: 150.00, category: 'Trámites' },
  { name: 'Panel Solar 450W', unit: 'ud', price: 180.00, category: 'Material' },
  { name: 'Inversor Híbrido 5kW', unit: 'ud', price: 1200.00, category: 'Material' },
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: '1',
    type: 'Photovoltaic',
    pvData: {
        peakPower: 9.0,
        modulesCount: 20,
        hasBattery: true,
        batteryCapacity: 10,
        installationType: 'Residential',
        contractedPower: 5.75,
        annualConsumption: 8500,
        roofType: 'Teja'
    },
    name: 'Instalación Solar Residencial - Villa Verde',
    client: 'Comunidad Villa Verde',
    location: 'Av. Las Palmeras 45, Madrid (28001)',
    status: ProjectStatus.IN_PROGRESS,
    progress: 45,
    startDate: '2026-10-15',
    endDate: '2026-11-30',
    budget: 25000,
    description: 'Instalación completa de 20 paneles solares, inversor híbrido y sistema de baterías.',
    transactions: [
      { id: 't1', projectId: '1', type: 'income', category: 'Anticipo', amount: 10000, date: '2026-10-15', description: 'Pago inicial 40%' },
      { id: 't2', projectId: '1', type: 'expense', category: 'Material', amount: 8500, date: '2026-10-20', description: 'Paneles e Inversor' },
      { id: 't3', projectId: '1', type: 'expense', category: 'Logística', amount: 200, date: '2026-10-21', description: 'Transporte de material' },
    ],
    materials: [
      { id: 'm1', projectId: '1', name: 'Panel Solar 450W', quantity: 20, unit: 'unid', minStock: 2, pricePerUnit: 200 },
      { id: 'm2', projectId: '1', name: 'Cable Solar 6mm', quantity: 150, unit: 'metros', minStock: 50, pricePerUnit: 1.5 },
      { id: 'm3', projectId: '1', name: 'Conectores MC4', quantity: 10, unit: 'pares', minStock: 20, pricePerUnit: 2.5 },
    ],
    incidents: [
      { id: 'i1', projectId: '1', title: 'Retraso en entrega de Baterías', description: 'El proveedor indica 1 semana de retraso.', priority: Priority.MEDIUM, status: 'Open', date: '2026-10-25' },
    ],
    budgets: [
       {
         id: 'b1', projectId: '1', name: 'Presupuesto Inicial', date: '2026-09-20', status: 'Accepted', total: 25000,
         items: [
           { id: 'bi1', name: 'Panel Solar 450W', unit: 'ud', quantity: 20, pricePerUnit: 200, category: 'Material' },
           { id: 'bi2', name: 'Mano de Obra Instalación', unit: 'h', quantity: 40, pricePerUnit: 45, category: 'Mano de Obra' }
         ]
       }
    ],
    documents: []
  },
  {
    id: '2',
    type: 'General',
    name: 'Renovación LED Nave Industrial',
    client: 'Logística Rápida SL',
    location: 'Polígono Sur, Nave 3',
    status: ProjectStatus.PLANNING,
    progress: 5,
    startDate: '2026-11-01',
    endDate: '2026-12-15',
    budget: 15000,
    description: 'Sustitución de todas las luminarias de vapor de sodio por campanas LED industriales.',
    transactions: [],
    materials: [
      { id: 'm4', projectId: '2', name: 'Campana LED 200W', quantity: 0, unit: 'unid', minStock: 50, pricePerUnit: 120 },
    ],
    incidents: [],
    budgets: [],
    documents: []
  },
  {
    id: '3',
    type: 'General',
    name: 'Mantenimiento Cuadros Eléctricos',
    client: 'Hospital Central',
    location: 'Calle Salud 1',
    status: ProjectStatus.COMPLETED,
    progress: 100,
    startDate: '2026-09-01',
    endDate: '2026-09-15',
    budget: 5000,
    description: 'Revisión termográfica y apriete de bornas en cuadros generales.',
    transactions: [
      { id: 't4', projectId: '3', type: 'income', category: 'Pago Final', amount: 5000, date: '2026-09-15', description: 'Factura completa' },
      { id: 't5', projectId: '3', type: 'expense', category: 'Mano de Obra', amount: 1200, date: '2026-09-10', description: 'Horas extra técnicos' },
    ],
    materials: [
      { id: 'm5', projectId: '3', name: 'Fusibles NH00 100A', quantity: 12, unit: 'unid', minStock: 5, pricePerUnit: 8 },
    ],
    incidents: [
      { id: 'i2', projectId: '3', title: 'Sobrecalentamiento Fase R', description: 'Detectado en Cuadro 2. Solucionado.', priority: Priority.HIGH, status: 'Resolved', date: '2026-09-02' },
    ],
    budgets: [],
    documents: []
  }
];