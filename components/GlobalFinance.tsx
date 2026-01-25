import React, { useState, useMemo } from 'react';
import { Project, Transaction, Material } from '../types';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Calendar, Filter, Download, PieChart as PieIcon, BarChart3, Search, X, Camera, ExternalLink, Briefcase, Package } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, 
  AreaChart, Area, PieChart, Pie, Legend 
} from 'recharts';
import ScannerModal from './ScannerModal';

interface GlobalFinanceProps {
  projects: Project[];
  onBack: () => void;
  onUpdateProject: (project: Project) => void;
}

const GlobalFinance: React.FC<GlobalFinanceProps> = ({ projects, onBack, onUpdateProject }) => {
  // --- State for Filters ---
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '2025-01-01',
    end: '2030-12-31'
  });
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'income' | 'expense'>('ALL');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // --- Data Processing ---

  // 1. Flatten ONLY Real Transactions for Cash Flow
  const allTransactions = useMemo(() => {
    return projects.flatMap(p => p.transactions.map(t => ({ 
      ...t, 
      amount: Number(t.amount) || 0, // Ensure number
      projectName: p.name, 
      projectStatus: p.status,
    })));
  }, [projects]);

  // 2. Apply Filters
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter(t => {
      const tDate = new Date(t.date || new Date());
      const startDate = dateRange.start ? new Date(dateRange.start) : new Date('2000-01-01');
      const endDate = dateRange.end ? new Date(dateRange.end) : new Date('2100-01-01');
      
      endDate.setHours(23, 59, 59, 999);

      const matchDate = tDate >= startDate && tDate <= endDate;
      const matchProject = selectedProject === 'ALL' || t.projectId === selectedProject;
      const matchType = filterType === 'ALL' || t.type === filterType;

      return matchDate && matchProject && matchType;
    });
  }, [allTransactions, dateRange, selectedProject, filterType]);

  // 3. Calculate KPI Totals based on Filtered Data
  const totalIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
  const totalExpense = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
  const netProfit = totalIncome - totalExpense;
  const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

  // 4. Prepare Chart Data: Evolution over time
  const evolutionData = useMemo(() => {
    const grouped: Record<string, { date: string, income: number, expense: number }> = {};
    
    // Sort by date first
    const sorted = [...filteredTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sorted.forEach(t => {
      const dateStr = t.date || new Date().toISOString().split('T')[0];
      const key = dateStr.substring(0, 7); // YYYY-MM
      
      if (!grouped[key]) grouped[key] = { date: key, income: 0, expense: 0 };
      
      const val = Number(t.amount) || 0;
      if (t.type === 'income') grouped[key].income += val;
      else grouped[key].expense += val;
    });

    return Object.values(grouped);
  }, [filteredTransactions]);

  // 5. Prepare Chart Data: Expense Categories
  const categoryData = useMemo(() => {
    const expenses = filteredTransactions.filter(t => t.type === 'expense');
    const grouped: Record<string, number> = {};
    expenses.forEach(t => {
        const cat = t.category || 'Otros';
        const val = Number(t.amount) || 0;
        grouped[cat] = (grouped[cat] || 0) + val;
    });
    
    return Object.keys(grouped).map(key => ({ name: key, value: grouped[key] })).sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  // Colors for Charts
  const COLORS = ['#0047AB', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const handleExportCSV = () => {
    const headers = ['Fecha', 'Proyecto', 'Tipo', 'Categoría', 'Descripción', 'Importe'];
    const rows = filteredTransactions.map(t => [
        t.date,
        t.projectName,
        t.type,
        t.category,
        `"${t.description}"`,
        (Number(t.amount) || 0).toFixed(2)
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n" 
        + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `finanzas_export_${dateRange.start}_${dateRange.end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleScanSave = (projectId: string, transaction: Transaction, newMaterials: Material[]) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
        const updatedProject = {
            ...project,
            transactions: [transaction, ...project.transactions],
            materials: [...project.materials, ...newMaterials]
        };
        onUpdateProject(updatedProject);
        setIsScannerOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col font-sans transition-colors duration-300">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 shadow-sm px-8 py-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-700 transition-colors sticky top-0 z-30">
        <div className="flex items-center">
            <button onClick={onBack} className="mr-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
            <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">Finanzas Globales</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Flujo de Caja Real</p>
            </div>
        </div>
        <div className="flex items-center gap-3">
            <button 
                onClick={() => setIsScannerOpen(true)}
                className="flex items-center gap-2 bg-[#0047AB] text-white px-5 py-2.5 rounded-xl font-bold hover:bg-[#003380] transition-colors shadow-lg shadow-blue-900/10"
            >
                <Camera className="w-5 h-5" /> <span className="hidden sm:inline">Escanear Gasto</span>
            </button>
            <button 
                onClick={handleExportCSV}
                className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
                <Download className="w-4 h-4" /> <span className="hidden sm:inline">CSV</span>
            </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-8 py-4 flex flex-col lg:flex-row gap-4 items-end lg:items-center justify-between sticky top-[88px] z-20 shadow-sm">
         <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
             <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                 <div className="px-3 py-1.5 text-xs font-bold uppercase text-slate-400 flex items-center gap-2 border-r border-slate-200 dark:border-slate-700">
                     <Calendar className="w-3.5 h-3.5" /> Rango
                 </div>
                 <input 
                    type="date" 
                    value={dateRange.start} 
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="bg-transparent border-none text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-0 cursor-pointer"
                 />
                 <span className="text-slate-400">-</span>
                 <input 
                    type="date" 
                    value={dateRange.end} 
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="bg-transparent border-none text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-0 cursor-pointer"
                 />
             </div>

             <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 flex-1 sm:flex-none">
                 <div className="px-3 py-1.5 text-xs font-bold uppercase text-slate-400 flex items-center gap-2 border-r border-slate-200 dark:border-slate-700">
                     <Filter className="w-3.5 h-3.5" /> Obra
                 </div>
                 <select 
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="bg-transparent border-none text-sm font-bold text-black dark:text-white focus:ring-0 cursor-pointer w-full sm:w-40"
                 >
                     <option value="ALL" className="text-black bg-white dark:bg-slate-800 dark:text-white">Todas</option>
                     {projects.map(p => <option key={p.id} value={p.id} className="text-black bg-white dark:bg-slate-800 dark:text-white">{p.name.substring(0, 20)}...</option>)}
                 </select>
             </div>

             <div className="flex p-1 bg-slate-100 dark:bg-slate-700 rounded-xl">
                 <button 
                    onClick={() => setFilterType('ALL')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'ALL' ? 'bg-white dark:bg-slate-600 text-[#0047AB] dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                 >
                     Todo
                 </button>
                 <button 
                    onClick={() => setFilterType('income')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'income' ? 'bg-white dark:bg-slate-600 text-green-600 dark:text-green-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                 >
                     Ingresos
                 </button>
                 <button 
                    onClick={() => setFilterType('expense')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'expense' ? 'bg-white dark:bg-slate-600 text-red-500 dark:text-red-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                 >
                     Gastos
                 </button>
             </div>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 max-w-[1600px] mx-auto w-full space-y-8">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-32 transition-colors relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                 <TrendingUp className="w-16 h-16 text-green-500" />
             </div>
             <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider z-10">Ingresos (Tickets)</p>
             <div>
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white z-10">{totalIncome.toLocaleString()}€</p>
                <p className="text-xs text-green-600 dark:text-green-400 font-bold mt-1 bg-green-50 dark:bg-green-900/20 inline-block px-2 py-0.5 rounded-md">
                    {filteredTransactions.filter(t => t.type === 'income').length} registros
                </p>
             </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-32 transition-colors relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                 <TrendingDown className="w-16 h-16 text-red-500" />
             </div>
             <div className="z-10 relative">
                 <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider z-10 flex items-center gap-1">
                     Gastos (Tickets)
                 </p>
             </div>
             <div>
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white z-10">{totalExpense.toLocaleString()}€</p>
                <p className="text-xs text-red-500 dark:text-red-400 font-bold mt-1 bg-red-50 dark:bg-red-900/20 inline-block px-2 py-0.5 rounded-md">
                    {filteredTransactions.filter(t => t.type === 'expense').length} registros
                </p>
             </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-32 transition-colors relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                 <DollarSign className="w-16 h-16 text-blue-500" />
             </div>
             <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider z-10">Beneficio Neto</p>
             <p className={`text-3xl font-extrabold z-10 ${netProfit >= 0 ? 'text-[#0047AB] dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>
                 {netProfit.toLocaleString()}€
             </p>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-32 transition-colors relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                 <PieIcon className="w-16 h-16 text-purple-500" />
             </div>
             <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider z-10">Rentabilidad Global</p>
             <div>
                 <p className={`text-3xl font-extrabold z-10 ${profitMargin >= 20 ? 'text-green-600 dark:text-green-400' : profitMargin >= 10 ? 'text-blue-600' : 'text-orange-500'}`}>
                     {isNaN(profitMargin) ? '0.0' : profitMargin.toFixed(1)}%
                 </p>
                 <p className="text-xs text-slate-400 dark:text-slate-500 font-medium mt-1">Margen sobre ingresos</p>
             </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Evolution Chart */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 transition-colors">
                 <div className="flex items-center justify-between mb-8">
                     <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                         <TrendingUp className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Evolución de Flujo de Caja
                     </h3>
                     <div className="text-xs text-slate-400 flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-green-500"></span> Ingresos
                         <span className="w-2 h-2 rounded-full bg-red-500"></span> Gastos
                     </div>
                 </div>
                 <div className="h-[300px] w-full">
                     <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                         <AreaChart data={evolutionData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                             <defs>
                                 <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                     <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                     <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                 </linearGradient>
                                 <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                     <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                                     <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                 </linearGradient>
                             </defs>
                             <XAxis dataKey="date" tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                             <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={(val) => `${val/1000}k`} />
                             <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                             <Tooltip 
                                contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} 
                                labelStyle={{color: '#64748b', fontWeight: 'bold'}}
                             />
                             <Area type="monotone" dataKey="income" name="Ingresos" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
                             <Area type="monotone" dataKey="expense" name="Gastos" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorExpense)" />
                         </AreaChart>
                     </ResponsiveContainer>
                 </div>
            </div>

            {/* Category Pie Chart */}
            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 transition-colors">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                     <PieIcon className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Distribución de Gastos
                </h3>
                <div className="h-[300px] w-full">
                     <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                         <PieChart>
                             <Pie 
                                data={categoryData} 
                                cx="50%" 
                                cy="50%" 
                                innerRadius={60} 
                                outerRadius={80} 
                                paddingAngle={5} 
                                dataKey="value"
                             >
                                 {categoryData.map((entry, index) => (
                                     <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                 ))}
                             </Pie>
                             <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)'}} />
                             <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{fontSize: '11px', paddingTop: '20px'}} />
                         </PieChart>
                     </ResponsiveContainer>
                </div>
            </div>
        </div>

        {/* Detailed Transactions List */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors">
           <div className="p-8 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
             <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                 <ExternalLink className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Listado de Movimientos (Tickets)
             </h3>
             <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold px-3 py-1 rounded-full">
                 {filteredTransactions.length} items
             </span>
           </div>
           
           <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredTransactions.length > 0 ? (
                    filteredTransactions.slice(0, 50).map(t => (
                        <div key={t.id} className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors gap-4">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                                    t.type === 'income' 
                                    ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' 
                                    : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                    {t.type === 'income' ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                                </div>
                                <div>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
                                        <h4 className="font-bold text-slate-900 dark:text-white text-base">{t.description}</h4>
                                        <span className={`text-[10px] uppercase font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400 px-2 py-0.5 rounded-md w-fit`}>
                                            {t.category}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                        <span className="font-mono">{t.date}</span>
                                        <span>•</span>
                                        <span className="flex items-center gap-1 text-[#0047AB] dark:text-blue-400 font-medium">
                                            <Briefcase className="w-3 h-3" /> {t.projectName}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className={`text-xl font-extrabold font-mono ${
                                t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                                {t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-12 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center">
                        <Filter className="w-12 h-12 mb-3 opacity-20" />
                        <p className="font-medium">No se encontraron movimientos.</p>
                        <p className="text-xs mt-1">Recuerda: El Stock ahora solo se muestra como 'Valor Inventario' y no en este listado.</p>
                    </div>
                )}
           </div>
           
           {filteredTransactions.length > 50 && (
                <div className="p-4 text-center text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                    Mostrando los primeros 50 registros. Utiliza "Exportar CSV" para ver el historial completo.
                </div>
           )}
        </div>

        {/* Scanner Modal */}
        {isScannerOpen && (
            <ScannerModal 
              projects={projects}
              onClose={() => setIsScannerOpen(false)}
              onSave={handleScanSave}
            />
        )}

      </div>
    </div>
  );
};

export default GlobalFinance;