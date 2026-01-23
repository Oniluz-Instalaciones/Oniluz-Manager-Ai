import React, { useState } from 'react';
import { Project, Transaction, Material, Incident, ProjectStatus, Priority, PriceItem } from '../types';
import { 
  ArrowLeft, Plus, Trash2, AlertTriangle, CheckCircle, 
  TrendingUp, TrendingDown, Package, FileText, Settings, BrainCircuit, X, Receipt, Paperclip, ChevronDown, Building2, Calendar, RotateCcw
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { analyzeProjectStatus } from '../services/geminiService';
import BudgetManager from './BudgetManager';
import DocumentManager from './DocumentManager';
import { supabase } from '../lib/supabase';

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
  onUpdate: (updatedProject: Project) => void;
  onDelete: (projectId: string) => void;
  priceDatabase: PriceItem[];
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, onBack, onUpdate, onDelete, priceDatabase }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'stock' | 'incidents' | 'budgets' | 'documents' | 'settings'>('overview');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [history, setHistory] = useState<Project[]>([]);

  const updateProjectWithHistory = (newProjectState: Project) => {
      setHistory(prev => [...prev, project]);
      onUpdate(newProjectState);
  };

  const handleUndo = () => {
      if (history.length === 0) return;
      const previousState = history[history.length - 1];
      const newHistory = history.slice(0, -1);
      setHistory(newHistory);
      onUpdate(previousState);
  };

  const totalIncome = project.transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = project.transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const profit = totalIncome - totalExpense;

  const financialData = [
    { name: 'Ingresos', value: totalIncome, color: '#10b981' },
    { name: 'Gastos', value: totalExpense, color: '#ef4444' },
  ];

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    const result = await analyzeProjectStatus(project);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as ProjectStatus;
    updateProjectWithHistory({ ...project, status: newStatus });
    await supabase.from('projects').update({ status: newStatus }).eq('id', project.id);
  };

  // --- Actions ---

  const handleAddTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newTransaction: Transaction = {
      id: crypto.randomUUID(), // Temp ID for UI
      projectId: project.id,
      description: formData.get('description') as string,
      amount: Number(formData.get('amount')),
      type: formData.get('type') as 'income' | 'expense',
      category: formData.get('category') as string,
      date: new Date().toISOString().split('T')[0],
    };
    
    // DB Update - Removed ID
    await supabase.from('transactions').insert({
        project_id: newTransaction.projectId,
        type: newTransaction.type,
        category: newTransaction.category,
        amount: newTransaction.amount,
        date: newTransaction.date || null,
        description: newTransaction.description
    });

    const updated = { ...project, transactions: [newTransaction, ...project.transactions] };
    updateProjectWithHistory(updated);
    e.currentTarget.reset();
  };

  const handleAddMaterial = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newMaterial: Material = {
      id: crypto.randomUUID(), // Temp ID for UI
      projectId: project.id,
      name: formData.get('name') as string,
      quantity: Number(formData.get('quantity')),
      unit: formData.get('unit') as string,
      minStock: Number(formData.get('minStock')),
      pricePerUnit: Number(formData.get('pricePerUnit')),
    };

    // DB Update - Removed ID
    await supabase.from('materials').insert({
        project_id: newMaterial.projectId,
        name: newMaterial.name,
        quantity: newMaterial.quantity,
        unit: newMaterial.unit,
        min_stock: newMaterial.minStock,
        price_per_unit: newMaterial.pricePerUnit
    });

    updateProjectWithHistory({ ...project, materials: [...project.materials, newMaterial] });
    e.currentTarget.reset();
  };

  const handleDeleteMaterial = async (id: string) => {
      await supabase.from('materials').delete().eq('id', id);
      updateProjectWithHistory({...project, materials: project.materials.filter(m => m.id !== id)});
  }

  const handleAddIncident = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newIncident: Incident = {
      id: crypto.randomUUID(), // Temp ID for UI
      projectId: project.id,
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      priority: formData.get('priority') as Priority,
      status: 'Open',
      date: new Date().toISOString().split('T')[0],
    };

    // DB Update - Removed ID
    await supabase.from('incidents').insert({
        project_id: newIncident.projectId,
        title: newIncident.title,
        description: newIncident.description,
        priority: newIncident.priority,
        status: newIncident.status,
        date: newIncident.date || null
    });

    updateProjectWithHistory({ ...project, incidents: [newIncident, ...project.incidents] });
    e.currentTarget.reset();
  };

  const toggleIncidentStatus = async (id: string) => {
    const updatedIncidents = project.incidents.map(inc => 
      inc.id === id ? { ...inc, status: inc.status === 'Open' ? 'Resolved' : 'Open' as 'Open'|'Resolved' } : inc
    );
    
    const incident = updatedIncidents.find(i => i.id === id);
    if (incident) {
        await supabase.from('incidents').update({ status: incident.status }).eq('id', id);
    }

    updateProjectWithHistory({ ...project, incidents: updatedIncidents });
  };


  // --- Render Functions ---

  const renderTabs = () => (
    <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-700 mb-8 bg-white dark:bg-slate-800 sticky top-0 z-10 px-6 transition-colors">
      {[
        { id: 'overview', label: 'Resumen', icon: FileText },
        { id: 'financials', label: 'Finanzas', icon: TrendingUp },
        { id: 'budgets', label: 'Presupuestos', icon: Receipt },
        { id: 'documents', label: 'Documentos', icon: Paperclip },
        { id: 'stock', label: 'Stock Material', icon: Package },
        { id: 'incidents', label: 'Incidencias', icon: AlertTriangle },
        { id: 'settings', label: 'Configuración', icon: Settings },
      ].map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id as any)}
          className={`flex items-center px-6 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-all duration-200 ${
            activeTab === tab.id
              ? 'border-[#0047AB] text-[#0047AB] dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          <tab.icon className="w-4 h-4 mr-2" />
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col font-sans transition-colors duration-300">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 shadow-sm px-8 py-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-700 transition-colors">
        <div className="flex items-center">
          <button onClick={onBack} className="mr-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">{project.name}</h1>
            <div className="flex items-center mt-2 gap-3">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center"><Building2 className="w-3.5 h-3.5 mr-1" /> {project.client}</span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <div className="relative group">
                    <select
                        value={project.status}
                        onChange={handleStatusChange}
                        className={`appearance-none pl-4 pr-10 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#0047AB] transition-all shadow-sm border-0 ${
                            project.status === ProjectStatus.IN_PROGRESS ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400' :
                            project.status === ProjectStatus.PLANNING ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            project.status === ProjectStatus.PAUSED ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400' :
                            'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}
                    >
                        {Object.values(ProjectStatus).map((status) => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-current pointer-events-none opacity-60" />
                </div>
            </div>
          </div>
        </div>
        
        <div>
           <button 
             onClick={handleUndo}
             disabled={history.length === 0}
             className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${
                 history.length === 0 
                 ? 'bg-slate-100 dark:bg-slate-700 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                 : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-slate-300 shadow-md transform hover:-translate-y-0.5'
             }`}
           >
               <RotateCcw className={`w-4 h-4 ${history.length > 0 ? 'text-[#0047AB] dark:text-blue-400' : ''}`} />
               Deshacer
               {history.length > 0 && <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-slate-500">{history.length}</span>}
           </button>
        </div>
      </div>

      {renderTabs()}

      <div className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 transition-colors">
                <h3 className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider">Presupuesto</h3>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{project.budget.toLocaleString()}€</p>
              </div>
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 transition-colors">
                <h3 className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider">Margen Actual</h3>
                <p className={`text-3xl font-bold mt-2 ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {profit.toLocaleString()}€
                </p>
              </div>
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 transition-colors">
                <h3 className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider">Incidencias Abiertas</h3>
                <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
                  {project.incidents.filter(i => i.status === 'Open').length}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 transition-colors">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Detalles del Proyecto
                </h3>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between py-3 border-b border-slate-50 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Ubicación</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{project.location}</span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-slate-50 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Fecha Inicio</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{project.startDate}</span>
                  </div>

                  {project.endDate && (
                      <div className="flex justify-between py-3 border-b border-slate-50 dark:border-slate-700 bg-blue-50/50 dark:bg-blue-900/10 px-3 -mx-3 rounded-lg border-l-4 border-l-[#0047AB] dark:border-l-blue-500">
                          <div className="flex flex-col">
                              <span className="text-[#0047AB] dark:text-blue-400 font-bold text-sm flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5" />
                                  Fecha Fin Estimada
                              </span>
                              {project.budgets?.some(b => b.status === 'Accepted') && (
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide mt-0.5">Basado en Presupuesto Aceptado</span>
                              )}
                          </div>
                          <span className="font-bold text-lg text-slate-900 dark:text-white">{project.endDate}</span>
                      </div>
                  )}

                  <div className="mt-6">
                    <span className="text-slate-500 dark:text-slate-400 block mb-2 font-medium">Descripción</span>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">{project.description}</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-[#0047AB]/5 to-blue-50 dark:from-slate-800 dark:to-slate-800/50 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,71,171,0.1)] border border-blue-100/50 dark:border-slate-700 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-[#0047AB] dark:text-blue-400 flex items-center">
                    <BrainCircuit className="w-6 h-6 mr-2" /> Asistente IA
                  </h3>
                  <button 
                    onClick={handleRunAnalysis}
                    disabled={isAnalyzing}
                    className="text-xs bg-[#0047AB] text-white px-4 py-2 rounded-lg hover:bg-[#003380] disabled:opacity-50 transition-colors font-semibold shadow-md shadow-blue-900/10"
                  >
                    {isAnalyzing ? 'Analizando...' : 'Analizar Proyecto'}
                  </button>
                </div>
                {aiAnalysis ? (
                  <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm p-5 rounded-xl text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line border border-white dark:border-slate-600 shadow-sm">
                    {aiAnalysis}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-400 bg-white/50 dark:bg-slate-900/50 p-4 rounded-xl border border-white/50 dark:border-slate-700/50">
                    Utiliza la IA para analizar el estado financiero, stock crítico e incidencias y obtener recomendaciones estratégicas para mejorar la rentabilidad de la obra.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* FINANCIALS TAB */}
        {activeTab === 'financials' && (
          <div className="space-y-8">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 transition-colors">
                  <h3 className="text-lg font-bold mb-6 text-slate-800 dark:text-white">Registro de Movimientos</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 uppercase text-xs tracking-wider">
                        <tr>
                          <th className="px-6 py-4 font-semibold rounded-l-lg">Fecha</th>
                          <th className="px-6 py-4 font-semibold">Concepto</th>
                          <th className="px-6 py-4 font-semibold">Categoría</th>
                          <th className="px-6 py-4 font-semibold text-right rounded-r-lg">Cantidad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                        {project.transactions.map(t => (
                          <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                            <td className="px-6 py-4 text-slate-600 dark:text-slate-300 font-medium">{t.date}</td>
                            <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{t.description}</td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
                                <span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-md">{t.category}</span>
                            </td>
                            <td className={`px-6 py-4 text-right font-bold ${t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                              {t.type === 'income' ? '+' : '-'}{t.amount}€
                            </td>
                          </tr>
                        ))}
                        {project.transactions.length === 0 && (
                          <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">Sin movimientos registrados</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-8">
                  {/* Add Transaction Form */}
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 transition-colors">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 uppercase tracking-wider flex items-center gap-2">
                        <Plus className="w-4 h-4 text-[#0047AB] dark:text-blue-400" /> Nuevo Movimiento
                    </h3>
                    <form onSubmit={handleAddTransaction} className="space-y-4">
                      <select name="type" className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-[#0047AB] outline-none text-slate-700 dark:text-slate-200 font-medium transition-colors">
                        <option value="expense">Gasto</option>
                        <option value="income">Ingreso</option>
                      </select>
                      <input name="amount" type="number" step="0.01" placeholder="Importe (€)" required className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                      <input name="description" placeholder="Descripción" required className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                      <input name="category" placeholder="Categoría (ej. Material, Mano de obra)" required className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                      <button type="submit" className="w-full py-3 bg-[#0047AB] text-white rounded-xl hover:bg-[#003380] text-sm font-bold transition-all shadow-md flex justify-center items-center">
                        <Plus className="w-4 h-4 mr-1" /> Añadir Movimiento
                      </button>
                    </form>
                  </div>

                  {/* Chart */}
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col items-center transition-colors">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 w-full text-left uppercase tracking-wider">Balance Visual</h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={financialData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={5} dataKey="value" stroke="none">
                            {financialData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)'}} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex gap-6 text-xs mt-2 font-medium">
                       <div className="flex items-center text-slate-600 dark:text-slate-300"><div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>Ingresos</div>
                       <div className="flex items-center text-slate-600 dark:text-slate-300"><div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>Gastos</div>
                    </div>
                  </div>
                </div>
             </div>
          </div>
        )}

        {/* BUDGETS TAB */}
        {activeTab === 'budgets' && (
           <BudgetManager project={project} onUpdate={updateProjectWithHistory} priceDatabase={priceDatabase} />
        )}

        {/* DOCUMENTS TAB */}
        {activeTab === 'documents' && (
            <DocumentManager project={project} onUpdate={updateProjectWithHistory} />
        )}

        {/* STOCK TAB */}
        {activeTab === 'stock' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Add Material */}
                <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 md:col-span-1 h-fit sticky top-28 transition-colors">
                   <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 uppercase tracking-wider flex items-center gap-2">
                     <Package className="w-4 h-4 text-[#0047AB] dark:text-blue-400" /> Añadir Material
                   </h3>
                   <form onSubmit={handleAddMaterial} className="space-y-4">
                      <input name="name" placeholder="Nombre material" required className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                      <div className="flex gap-3">
                        <input name="quantity" type="number" placeholder="Cant." required className="w-1/2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                        <input name="unit" placeholder="Unidad" required className="w-1/2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                      </div>
                      <div className="flex gap-3">
                         <input name="pricePerUnit" type="number" step="0.01" placeholder="Precio/u" required className="w-1/2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                         <input name="minStock" type="number" placeholder="Min Stock" required className="w-1/2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                      </div>
                      <button type="submit" className="w-full py-3 bg-[#0047AB] text-white rounded-xl hover:bg-[#003380] text-sm font-bold transition-all shadow-md flex justify-center items-center">
                        <Plus className="w-4 h-4 mr-1" /> Registrar Stock
                      </button>
                   </form>
                </div>

                {/* Stock List */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 md:col-span-2 overflow-hidden transition-colors">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30 flex justify-between items-center">
                     <h3 className="font-bold text-slate-800 dark:text-white">Inventario de Obra</h3>
                     <span className="text-xs font-semibold bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200 px-3 py-1 rounded-full">{project.materials.length} referencias</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {project.materials.map(m => {
                      const isLowStock = m.quantity <= m.minStock;
                      return (
                        <div key={m.id} className="p-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <div className="flex items-center gap-5">
                             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${isLowStock ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-900/30 text-[#0047AB] dark:text-blue-400'}`}>
                                <Package className="w-6 h-6" />
                             </div>
                             <div>
                               <p className="font-bold text-slate-900 dark:text-white">{m.name}</p>
                               <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Valor est: <span className="text-slate-700 dark:text-slate-200">{(m.quantity * m.pricePerUnit).toLocaleString()}€</span></p>
                             </div>
                          </div>
                          <div className="flex items-center gap-8">
                            <div className="text-right">
                              <p className={`text-lg font-bold ${isLowStock ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
                                {m.quantity} <span className="text-xs font-normal text-slate-400 uppercase">{m.unit}</span>
                              </p>
                              {isLowStock && <p className="text-[10px] text-red-500 dark:text-red-400 font-bold bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full mt-1">Stock Bajo</p>}
                            </div>
                            <button onClick={() => handleDeleteMaterial(m.id)} className="text-slate-300 hover:text-red-500 transition-colors p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg">
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {project.materials.length === 0 && (
                      <div className="p-10 text-center text-slate-400 dark:text-slate-500 text-sm">No hay materiales asignados a esta obra.</div>
                    )}
                  </div>
                </div>
            </div>
          </div>
        )}

        {/* INCIDENTS TAB */}
        {activeTab === 'incidents' && (
          <div className="space-y-8">
             <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 mb-8 transition-colors">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" /> Nueva Incidencia
                </h3>
                <form onSubmit={handleAddIncident} className="flex flex-col md:flex-row gap-5 items-end">
                   <div className="w-full md:w-1/3">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-2 uppercase">Título</label>
                      <input name="title" required className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500 text-slate-900 dark:text-white transition-colors" />
                   </div>
                   <div className="w-full md:w-1/3">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-2 uppercase">Prioridad</label>
                      <select name="priority" className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500 text-slate-700 dark:text-slate-200 font-medium transition-colors">
                         <option value={Priority.LOW}>Baja</option>
                         <option value={Priority.MEDIUM}>Media</option>
                         <option value={Priority.HIGH}>Alta</option>
                         <option value={Priority.CRITICAL}>Crítica</option>
                      </select>
                   </div>
                   <div className="w-full md:w-1/3">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-2 uppercase">Descripción</label>
                      <input name="description" required className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500 text-slate-900 dark:text-white transition-colors" />
                   </div>
                   <button type="submit" className="w-full md:w-auto px-8 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-bold shadow-lg shadow-red-200 dark:shadow-red-900/30">
                      Reportar
                   </button>
                </form>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {project.incidents.map(inc => (
                 <div key={inc.id} className={`bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group`}>
                     <div className={`absolute top-0 left-0 w-1 h-full ${
                        inc.status === 'Resolved' ? 'bg-green-500' : 
                        inc.priority === Priority.CRITICAL ? 'bg-red-600' : 
                        inc.priority === Priority.HIGH ? 'bg-orange-500' : 'bg-[#0047AB]'
                     }`}></div>
                    
                    <div className="pl-3">
                      <div className="flex justify-between items-start mb-3">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                           inc.priority === Priority.CRITICAL ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        }`}>{inc.priority}</span>
                        <span className="text-xs text-slate-400 font-mono">{inc.date}</span>
                      </div>
                      <h4 className={`font-bold text-lg text-slate-900 dark:text-white ${inc.status === 'Resolved' && 'line-through text-slate-400'}`}>{inc.title}</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 mb-6 leading-relaxed">{inc.description}</p>
                    </div>
                    <button 
                      onClick={() => toggleIncidentStatus(inc.id)}
                      className={`text-sm flex items-center justify-center w-full py-2.5 rounded-xl font-medium transition-colors pl-3 ${
                        inc.status === 'Resolved' 
                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600' 
                        : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 border border-green-100 dark:border-green-800'
                      }`}
                    >
                      {inc.status === 'Resolved' ? 'Reabrir Incidencia' : 'Marcar Resuelta'}
                    </button>
                 </div>
               ))}
             </div>
          </div>
        )}

         {/* SETTINGS TAB */}
         {activeTab === 'settings' && (
           <div className="max-w-xl mx-auto space-y-8">
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 transition-colors">
                 <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" /> Zona de Peligro
                 </h3>
                 <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">Una vez eliminado el proyecto, no se podrá recuperar la información asociada, incluyendo finanzas e historial. Por favor, asegúrese antes de proceder.</p>
                 <button 
                   onClick={() => onDelete(project.id)}
                   className="w-full flex items-center justify-center px-6 py-4 border border-red-100 dark:border-red-900/50 text-sm font-bold rounded-xl text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 hover:border-red-200 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                 >
                   <Trash2 className="w-5 h-5 mr-2" />
                   Eliminar Proyecto Definitivamente
                 </button>
              </div>
           </div>
         )}
      </div>
    </div>
  );
};

export default ProjectDetail;