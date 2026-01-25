import React, { useState } from 'react';
import { Project, Transaction, Material, Incident, ProjectStatus, Priority, PriceItem } from '../types';
import { 
  ArrowLeft, Plus, Trash2, AlertTriangle, CheckCircle, 
  TrendingUp, TrendingDown, Package, FileText, Settings, BrainCircuit, X, Receipt, Paperclip, ChevronDown, Building2, Calendar, RotateCcw, Edit3,
  Hammer, Coffee, User, Wallet, BarChart3, HardHat, MinusCircle
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
  
  // State for transaction form type to toggle category input
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('expense');
  
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
  const profitMargin = totalIncome > 0 ? ((profit / totalIncome) * 100).toFixed(1) : '0';

  // Filter expenses by specific categories
  const materialExpenses = project.transactions.filter(t => t.type === 'expense' && t.category === 'Material');
  const consumableExpenses = project.transactions.filter(t => t.type === 'expense' && t.category === 'Consumibles');
  const personalExpenses = project.transactions.filter(t => t.type === 'expense' && t.category === 'Personal');
  // Catch-all for other expenses (legacy or different categories)
  const otherExpenses = project.transactions.filter(t => t.type === 'expense' && !['Material', 'Consumibles', 'Personal'].includes(t.category));

  const totalMaterial = materialExpenses.reduce((sum, t) => sum + t.amount, 0);
  const totalConsumable = consumableExpenses.reduce((sum, t) => sum + t.amount, 0);
  const totalPersonal = personalExpenses.reduce((sum, t) => sum + t.amount, 0);

  const financialData = [
    { name: 'Material', value: totalMaterial, color: '#3b82f6' }, // Blue
    { name: 'Consumibles', value: totalConsumable, color: '#f59e0b' }, // Amber
    { name: 'Personal', value: totalPersonal, color: '#ef4444' }, // Red
  ].filter(d => d.value > 0);

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

  const handleProgressChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const newProgress = Number(e.target.value);
      // We don't push to history on every drag event to avoid flooding undo stack, 
      // but ideally we should debounce. For now, we update state directly.
      onUpdate({ ...project, progress: newProgress });
      // Debounce DB update could be here, but simpler to update on mouseUp/change
      await supabase.from('projects').update({ progress: newProgress }).eq('id', project.id);
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
  };

  const handleConsumeMaterial = async (id: string) => {
    const material = project.materials.find(m => m.id === id);
    if (!material) return;

    const input = window.prompt(`Indica la cantidad de "${material.name}" a descontar del stock (Usado/Gastado):`, "1");
    if (input === null) return; // Cancelled

    const amount = Number(input);
    if (isNaN(amount) || amount <= 0) {
        alert("Cantidad inválida.");
        return;
    }

    if (amount > material.quantity) {
        alert("No hay suficiente stock para descontar esa cantidad.");
        return;
    }

    const newQuantity = material.quantity - amount;
    
    // Update DB
    await supabase.from('materials').update({ quantity: newQuantity }).eq('id', id);

    // Update State
    const updatedMaterials = project.materials.map(m => 
        m.id === id ? { ...m, quantity: newQuantity } : m
    );
    updateProjectWithHistory({ ...project, materials: updatedMaterials });
  };

  const handleDeleteTransaction = async (id: string) => {
      if(!window.confirm("¿Eliminar este movimiento?")) return;
      await supabase.from('transactions').delete().eq('id', id);
      updateProjectWithHistory({...project, transactions: project.transactions.filter(t => t.id !== id)});
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

  const renderExpenseSection = (title: string, transactions: Transaction[], total: number, icon: React.ReactNode, colorClass: string) => (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col h-full overflow-hidden transition-colors">
          <div className={`p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center ${colorClass} bg-opacity-5 dark:bg-opacity-10`}>
              <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-sm uppercase tracking-wide">
                  {icon} {title}
              </h4>
              <span className="font-bold text-lg text-slate-900 dark:text-white">{total.toLocaleString()}€</span>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[300px] p-0">
              {transactions.length > 0 ? (
                  <table className="w-full text-left text-xs">
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                          {transactions.map(t => (
                              <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 group">
                                  <td className="px-4 py-3">
                                      <p className="font-semibold text-slate-700 dark:text-slate-200">{t.description}</p>
                                      <p className="text-[10px] text-slate-400">{t.date}</p>
                                  </td>
                                  <td className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300 relative">
                                      {t.amount.toLocaleString()}€
                                      <button 
                                        onClick={() => handleDeleteTransaction(t.id)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-400 hover:text-red-500 rounded transition-all"
                                      >
                                          <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              ) : (
                  <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs italic">
                      No hay gastos registrados en esta categoría.
                  </div>
              )}
          </div>
      </div>
  );

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
        <div className="flex items-center w-full sm:w-auto">
          <button onClick={onBack} className="mr-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white leading-tight break-all">{project.name}</h1>
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
                  {/* Progress Slider */}
                  <div className="pb-5 mb-5 border-b border-slate-50 dark:border-slate-700">
                     <div className="flex justify-between items-center mb-2">
                         <span className="text-slate-900 dark:text-white font-bold flex items-center gap-2">
                             <HardHat className="w-4 h-4 text-[#0047AB] dark:text-blue-400" /> Avance de Obra
                         </span>
                         <span className="text-2xl font-bold text-[#0047AB] dark:text-blue-400">{project.progress}%</span>
                     </div>
                     <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={project.progress} 
                        onChange={handleProgressChange}
                        className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-[#0047AB] dark:accent-blue-400"
                     />
                     <div className="flex justify-between mt-1 text-[10px] text-slate-400 uppercase font-bold">
                         <span>Inicio</span>
                         <span>Completado</span>
                     </div>
                  </div>

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

        {/* FINANCIALS TAB (Refactored) */}
        {activeTab === 'financials' && (
          <div className="space-y-8">
             {/* Charts Row */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col items-center">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2 w-full text-left uppercase tracking-wider">Desglose de Gastos</h3>
                    {financialData.length > 0 ? (
                        <div className="h-[200px] w-full">
                          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <PieChart>
                              <Pie data={financialData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value" stroke="none">
                                {financialData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <RechartsTooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)'}} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-[200px] w-full flex items-center justify-center text-slate-400 text-xs">Sin gastos registrados</div>
                    )}
                    <div className="flex gap-3 text-[10px] mt-2 font-medium flex-wrap justify-center">
                       {financialData.map(d => (
                          <div key={d.name} className="flex items-center text-slate-600 dark:text-slate-300">
                             <div className="w-2.5 h-2.5 rounded-full mr-1.5" style={{backgroundColor: d.color}}></div>
                             {d.name}
                          </div>
                       ))}
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 uppercase tracking-wider flex items-center gap-2">
                        <Plus className="w-4 h-4 text-[#0047AB] dark:text-blue-400" /> Añadir Movimiento
                    </h3>
                    <form onSubmit={handleAddTransaction} className="space-y-4">
                      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-700 rounded-xl mb-4">
                          <button 
                             type="button" 
                             onClick={() => setTransactionType('expense')}
                             className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${transactionType === 'expense' ? 'bg-white dark:bg-slate-600 text-red-500 shadow-sm' : 'text-slate-500'}`}
                          >
                              Gasto
                          </button>
                          <button 
                             type="button" 
                             onClick={() => setTransactionType('income')}
                             className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${transactionType === 'income' ? 'bg-white dark:bg-slate-600 text-green-600 shadow-sm' : 'text-slate-500'}`}
                          >
                              Ingreso
                          </button>
                      </div>
                      
                      <input type="hidden" name="type" value={transactionType} />
                      
                      <div className="flex gap-3">
                          <input name="amount" type="number" step="0.01" placeholder="Importe (€)" required className="w-1/3 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                          <input name="description" placeholder="Descripción" required className="w-2/3 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                      </div>

                      {transactionType === 'expense' ? (
                          <select name="category" required className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white font-medium transition-colors">
                             <option value="Material">Material</option>
                             <option value="Consumibles">Consumibles</option>
                             <option value="Personal">Personal</option>
                          </select>
                      ) : (
                          <input name="category" placeholder="Categoría (ej. Anticipo, Certificación)" required className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                      )}

                      <button type="submit" className={`w-full py-3 rounded-xl text-sm font-bold transition-all shadow-md flex justify-center items-center text-white ${transactionType === 'expense' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}>
                        <Plus className="w-4 h-4 mr-1" /> {transactionType === 'expense' ? 'Registrar Gasto' : 'Registrar Ingreso'}
                      </button>
                    </form>
                </div>
             </div>

             {/* Detailed Lists Grid */}
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 {/* Material Expenses */}
                 {renderExpenseSection('Materiales', materialExpenses, totalMaterial, <Hammer className="w-4 h-4" />, 'bg-blue-50 text-blue-700')}
                 
                 {/* Consumable Expenses */}
                 {renderExpenseSection('Consumibles', consumableExpenses, totalConsumable, <Coffee className="w-4 h-4" />, 'bg-amber-50 text-amber-700')}
                 
                 {/* Personal Expenses */}
                 {renderExpenseSection('Personal', personalExpenses, totalPersonal, <User className="w-4 h-4" />, 'bg-red-50 text-red-700')}
             </div>

             {/* Income Section & Others */}
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* Income List */}
                 <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col h-full overflow-hidden transition-colors">
                      <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-green-50/50 dark:bg-green-900/10">
                          <h4 className="font-bold text-green-700 dark:text-green-400 flex items-center gap-2 text-sm uppercase tracking-wide">
                              <Wallet className="w-4 h-4" /> Ingresos
                          </h4>
                          <span className="font-bold text-lg text-slate-900 dark:text-white">{totalIncome.toLocaleString()}€</span>
                      </div>
                      <div className="flex-1 overflow-y-auto max-h-[250px] p-0">
                          {project.transactions.filter(t => t.type === 'income').length > 0 ? (
                              <table className="w-full text-left text-xs">
                                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                                      {project.transactions.filter(t => t.type === 'income').map(t => (
                                          <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 group">
                                              <td className="px-4 py-3">
                                                  <p className="font-semibold text-slate-700 dark:text-slate-200">{t.description}</p>
                                                  <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded">{t.category}</span>
                                              </td>
                                              <td className="px-4 py-3 text-right font-medium text-green-600 dark:text-green-400 relative">
                                                  +{t.amount.toLocaleString()}€
                                                  <button 
                                                    onClick={() => handleDeleteTransaction(t.id)}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-400 hover:text-red-500 rounded transition-all"
                                                  >
                                                      <Trash2 className="w-3.5 h-3.5" />
                                                  </button>
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          ) : (
                              <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs italic">
                                  Sin ingresos registrados.
                              </div>
                          )}
                      </div>
                 </div>

                 {/* Other Expenses (Legacy or unclassified) */}
                 {otherExpenses.length > 0 && (
                     <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col h-full overflow-hidden transition-colors">
                          <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
                              <h4 className="font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2 text-sm uppercase tracking-wide">
                                  Otros Gastos
                              </h4>
                              <span className="font-bold text-lg text-slate-900 dark:text-white">
                                  {otherExpenses.reduce((s, t) => s + t.amount, 0).toLocaleString()}€
                              </span>
                          </div>
                          <div className="flex-1 overflow-y-auto max-h-[250px] p-0">
                                  <table className="w-full text-left text-xs">
                                      <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                                          {otherExpenses.map(t => (
                                              <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 group">
                                                  <td className="px-4 py-3">
                                                      <p className="font-semibold text-slate-700 dark:text-slate-200">{t.description}</p>
                                                      <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded">{t.category}</span>
                                                  </td>
                                                  <td className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300 relative">
                                                      {t.amount.toLocaleString()}€
                                                      <button 
                                                        onClick={() => handleDeleteTransaction(t.id)}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-400 hover:text-red-500 rounded transition-all"
                                                      >
                                                          <Trash2 className="w-3.5 h-3.5" />
                                                      </button>
                                                  </td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                          </div>
                     </div>
                 )}
             </div>

             {/* Global Project Finance Summary Card */}
             <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 transition-colors">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Resumen Financiero Global
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Income */}
                    <div className="p-4 bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-100 dark:border-green-900/30">
                        <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase">Ingresos Totales</p>
                        <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{totalIncome.toLocaleString()}€</p>
                    </div>
                    {/* Expenses */}
                    <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                        <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase">Gastos Totales</p>
                        <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{totalExpense.toLocaleString()}€</p>
                    </div>
                    {/* Profit */}
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30">
                        <p className="text-xs font-bold text-[#0047AB] dark:text-blue-400 uppercase">Beneficio Neto</p>
                        <p className={`text-2xl font-extrabold mt-1 ${profit >= 0 ? 'text-[#0047AB] dark:text-blue-400' : 'text-orange-500'}`}>
                            {profit.toLocaleString()}€
                        </p>
                    </div>
                    {/* Margin */}
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-900/30">
                        <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase">Rentabilidad</p>
                        <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                            {profitMargin}%
                        </p>
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
                          <div className="flex items-center gap-4 sm:gap-8">
                            <div className="text-right">
                              <p className={`text-lg font-bold ${isLowStock ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
                                {m.quantity} <span className="text-xs font-normal text-slate-400 uppercase">{m.unit}</span>
                              </p>
                              {isLowStock && <p className="text-[10px] text-red-500 dark:text-red-400 font-bold bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full mt-1">Stock Bajo</p>}
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleConsumeMaterial(m.id)}
                                    className="text-amber-500 hover:text-amber-700 p-2 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                                    title="Descontar Stock (Usado)"
                                >
                                    <MinusCircle className="w-5 h-5" />
                                </button>
                                <button onClick={() => handleDeleteMaterial(m.id)} className="text-slate-300 hover:text-red-500 transition-colors p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg">
                                  <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
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
           <div className="max-w-3xl mx-auto space-y-8">
              
              {/* General Settings Form */}
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 transition-colors">
                 <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                    <Edit3 className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Editar Datos del Proyecto
                 </h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="col-span-full">
                         <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Nombre del Proyecto</label>
                         <input 
                             type="text" 
                             value={project.name}
                             onChange={(e) => updateProjectWithHistory({ ...project, name: e.target.value })}
                             className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white font-bold transition-all"
                         />
                     </div>
                     
                     <div className="col-span-full md:col-span-1">
                         <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Cliente</label>
                         <input 
                             type="text" 
                             value={project.client}
                             onChange={(e) => updateProjectWithHistory({ ...project, client: e.target.value })}
                             className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-all"
                         />
                     </div>

                     <div className="col-span-full md:col-span-1">
                         <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Ubicación</label>
                         <input 
                             type="text" 
                             value={project.location}
                             onChange={(e) => updateProjectWithHistory({ ...project, location: e.target.value })}
                             className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-all"
                         />
                     </div>

                     <div className="col-span-full md:col-span-1">
                         <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Fecha Inicio</label>
                         <input 
                             type="date" 
                             value={project.startDate}
                             onChange={(e) => updateProjectWithHistory({ ...project, startDate: e.target.value })}
                             className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-all"
                         />
                     </div>

                     <div className="col-span-full md:col-span-1">
                         <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Fecha Fin Estimada</label>
                         <input 
                             type="date" 
                             value={project.endDate || ''}
                             onChange={(e) => updateProjectWithHistory({ ...project, endDate: e.target.value })}
                             className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-all"
                         />
                     </div>

                     <div className="col-span-full">
                         <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Descripción</label>
                         <textarea 
                             rows={4}
                             value={project.description}
                             onChange={(e) => updateProjectWithHistory({ ...project, description: e.target.value })}
                             className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-all resize-none"
                         />
                     </div>
                 </div>
                 <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                    Los cambios se guardan automáticamente al modificar los campos.
                 </div>
              </div>

              {/* Danger Zone */}
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