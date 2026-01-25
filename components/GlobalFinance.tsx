import React, { useState, useMemo } from 'react';
import { Project, Transaction, Material } from '../types';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Calendar, Filter, Download, PieChart as PieIcon, BarChart3, Search, X, Camera, ExternalLink } from 'lucide-react';
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
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], // Jan 1st of current year
    end: new Date().toISOString().split('T')[0] // Today
  });
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'income' | 'expense'>('ALL');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // --- Data Processing ---

  // 1. Flatten all transactions with project context
  const allTransactions = useMemo(() => {
    return projects.flatMap(p => p.transactions.map(t => ({ 
      ...t, 
      projectName: p.name,
      projectStatus: p.status 
    })));
  }, [projects]);

  // 2. Apply Filters
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter(t => {
      const tDate = new Date(t.date);
      const startDate = dateRange.start ? new Date(dateRange.start) : new Date('2000-01-01');
      const endDate = dateRange.end ? new Date(dateRange.end) : new Date('2100-01-01');
      
      // Fix date comparison to include the end date day
      endDate.setHours(23, 59, 59, 999);

      const matchDate = tDate >= startDate && tDate <= endDate;
      const matchProject = selectedProject === 'ALL' || t.projectId === selectedProject;
      const matchType = filterType === 'ALL' || t.type === filterType;

      return matchDate && matchProject && matchType;
    });
  }, [allTransactions, dateRange, selectedProject, filterType]);

  // 3. Calculate KPI Totals based on Filtered Data
  const totalIncome = filteredTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const netProfit = totalIncome - totalExpense;
  const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

  // 4. Prepare Chart Data: Evolution over time
  const evolutionData = useMemo(() => {
    const grouped: Record<string, { date: string, income: number, expense: number }> = {};
    
    // Sort by date first
    const sorted = [...filteredTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sorted.forEach(t => {
      // Group by Month (YYYY-MM) or Day depending on range? Let's do Month for global view usually
      const key = t.date.substring(0, 7); // YYYY-MM
      if (!grouped[key]) grouped[key] = { date: key, income: 0, expense: 0 };
      if (t.type === 'income') grouped[key].income += t.amount;
      else grouped[key].expense += t.amount;
    });

    return Object.values(grouped);
  }, [filteredTransactions]);

  // 5. Prepare Chart Data: Expense Categories
  const categoryData = useMemo(() => {
    const expenses = filteredTransactions.filter(t => t.type === 'expense');
    const grouped: Record<string, number> = {};
    expenses.forEach(t => {
        const cat = t.category || 'Otros';
        grouped[cat] = (grouped[cat] || 0) + t.amount;
    });
    
    return Object.keys(grouped).map(key => ({ name: key, value: grouped[key] })).sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  // 6. Per Project Breakdown
  const projectFinancials = useMemo(() => {
      return projects.map(p => {
          // Calculate using filtered transactions to respect date range
          const pTrans = filteredTransactions.filter(t => t.projectId === p.id);
          const inc = pTrans.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
          const exp = pTrans.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
          
          return {
              id: p.id,
              name: p.name,
              status: p.status,
              income: inc,
              expense: exp,
              profit: inc - exp,
              margin: inc > 0 ? ((inc - exp) / inc) * 100 : 0,
              hasActivity: pTrans.length > 0
          };
      }).filter(p => selectedProject === 'ALL' || p.id === selectedProject) // Show only selected project if filtered
        .filter(p => p.hasActivity); // Only show projects with activity in this period
  }, [projects, filteredTransactions, selectedProject]);

  // Colors for Charts
  const COLORS = ['#0047AB', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const handleExportCSV = () => {
    const headers = ['Fecha', 'Proyecto', 'Tipo', 'Categoría', 'Descripción', 'Importe'];
    const rows = filteredTransactions.map(t => [
        t.date,
        t.projectName,
        t.type,
        t.category,
        `"${t.description}"`, // Quote description to handle commas
        t.amount.toFixed(2)
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
        // Opcional: Podríamos mostrar un mensaje de éxito, pero el modal ya hace alert o visual feedback
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
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Análisis económico y rentabilidad</p>
            </div>
        </div>
        <div className="flex items-center gap-3">
            <button 
                onClick={() => setIsScannerOpen(true)}
                className="flex items-center gap-2 bg-[#0047AB] text-white px-5 py-2.5 rounded-xl font-bold hover:bg-[#003380] transition-colors shadow-lg shadow-blue-900/10"
            >
                <Camera className="w-5 h-5" /> <span className="hidden sm:inline">Escanear / Añadir</span>
            </button>
            <button 
                onClick={handleExportCSV}
                className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
                <Download className="w-4 h-4" /> <span className="hidden sm:inline">Exportar CSV</span>
            </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-8 py-4 flex flex-col lg:flex-row gap-4 items-end lg:items-center justify-between sticky top-[88px] z-20 shadow-sm">
         <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
             <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                 <div className="px-3 py-1.5 text-xs font-bold uppercase text-slate-400 flex items-center gap-2 border-r border-slate-200 dark:border-slate-700">
                     <Calendar className="w-3.5 h-3.5" /> Periodo
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
                     <Filter className="w-3.5 h-3.5" /> Filtrar
                 </div>
                 <select 
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="bg-transparent border-none text-sm font-bold text-black dark:text-white focus:ring-0 cursor-pointer w-full sm:w-40"
                 >
                     <option value="ALL" className="text-black bg-white dark:bg-slate-800 dark:text-white">Todas las obras</option>
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
             <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider z-10">Ingresos Totales</p>
             <div>
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white z-10">{totalIncome.toLocaleString()}€</p>
                <p className="text-xs text-green-600 dark:text-green-400 font-bold mt-1 bg-green-50 dark:bg-green-900/20 inline-block px-2 py-0.5 rounded-md">
                    {filteredTransactions.filter(t => t.type === 'income').length} movimientos
                </p>
             </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-32 transition-colors relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                 <TrendingDown className="w-16 h-16 text-red-500" />
             </div>
             <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider z-10">Gastos Totales</p>
             <div>
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white z-10">{totalExpense.toLocaleString()}€</p>
                <p className="text-xs text-red-500 dark:text-red-400 font-bold mt-1 bg-red-50 dark:bg-red-900/20 inline-block px-2 py-0.5 rounded-md">
                    {filteredTransactions.filter(t => t.type === 'expense').length} movimientos
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
                     {profitMargin.toFixed(1)}%
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

        {/* Breakdown by Project Table */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors">
           <div className="p-8 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
             <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                 <BarChart3 className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Desglose: Finanzas por Obra
             </h3>
             <span className="text-xs text-slate-400 font-medium hidden sm:block">Basado en periodo seleccionado</span>
           </div>
           <div className="overflow-x-auto">
               <table className="w-full text-left text-sm">
                   <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 uppercase text-xs tracking-wider">
                       <tr>
                           <th className="px-6 py-4 font-bold">Proyecto</th>
                           <th className="px-6 py-4 font-bold text-center">Estado</th>
                           <th className="px-6 py-4 font-bold text-right">Ingresos</th>
                           <th className="px-6 py-4 font-bold text-right">Gastos</th>
                           <th className="px-6 py-4 font-bold text-right">Beneficio</th>
                           <th className="px-6 py-4 font-bold text-right">Margen</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                       {projectFinancials.map(p => (
                           <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                               <td className="px-6 py-4 font-bold text-slate-800 dark:text-white truncate max-w-[200px]">{p.name}</td>
                               <td className="px-6 py-4 text-center">
                                   <span className={`text-[10px] px-2 py-1 rounded-full uppercase font-bold ${
                                       p.status === 'En Curso' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                       p.status === 'Completado' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                       'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                   }`}>
                                       {p.status}
                                   </span>
                               </td>
                               <td className="px-6 py-4 text-right text-green-600 dark:text-green-400 font-mono font-medium">{p.income.toLocaleString()}€</td>
                               <td className="px-6 py-4 text-right text-red-500 dark:text-red-400 font-mono font-medium">{p.expense.toLocaleString()}€</td>
                               <td className={`px-6 py-4 text-right font-mono font-bold ${p.profit >= 0 ? 'text-[#0047AB] dark:text-blue-400' : 'text-orange-500'}`}>
                                   {p.profit.toLocaleString()}€
                               </td>
                               <td className="px-6 py-4 text-right">
                                   <div className="flex items-center justify-end gap-2">
                                       <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                           <div 
                                              className={`h-full ${p.margin >= 20 ? 'bg-green-500' : p.margin >= 10 ? 'bg-blue-500' : 'bg-orange-500'}`} 
                                              style={{width: `${Math.min(Math.max(p.margin, 0), 100)}%`}}
                                           ></div>
                                       </div>
                                       <span className="text-xs font-bold text-slate-600 dark:text-slate-400 w-8">{p.margin.toFixed(0)}%</span>
                                   </div>
                               </td>
                           </tr>
                       ))}
                       {projectFinancials.length === 0 && (
                           <tr>
                               <td colSpan={6} className="px-6 py-10 text-center text-slate-400 dark:text-slate-500 font-medium">
                                   No hay actividad en el periodo seleccionado para los filtros actuales.
                               </td>
                           </tr>
                       )}
                   </tbody>
               </table>
           </div>
        </div>

        {/* Detailed Transactions List (Refactored to Table for Better Visibility) */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors">
           <div className="p-8 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
             <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                 <ExternalLink className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Registro Detallado de Movimientos
             </h3>
             <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold px-3 py-1 rounded-full">
                 {filteredTransactions.length} registros
             </span>
           </div>
           
           <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 uppercase text-xs tracking-wider">
                        <tr>
                            <th className="px-6 py-4 font-bold w-32">Fecha</th>
                            <th className="px-6 py-4 font-bold">Obra (Proyecto)</th>
                            <th className="px-6 py-4 font-bold">Detalle / Concepto</th>
                            <th className="px-6 py-4 font-bold">Categoría</th>
                            <th className="px-6 py-4 font-bold text-center">Tipo</th>
                            <th className="px-6 py-4 font-bold text-right">Importe</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {filteredTransactions.slice(0, 50).map(t => (
                            <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
                                <td className="px-6 py-4 text-slate-600 dark:text-slate-300 whitespace-nowrap font-mono text-xs">
                                    {t.date}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="font-bold text-slate-800 dark:text-white text-xs truncate max-w-[200px]" title={t.projectName}>
                                        {t.projectName}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{t.description}</span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400 px-2 py-1 rounded-md">
                                        {t.category}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div className={`inline-flex p-1.5 rounded-lg ${t.type === 'income' ? 'bg-green-50 dark:bg-green-900/20 text-green-600' : 'bg-red-50 dark:bg-red-900/20 text-red-500'}`}>
                                        {t.type === 'income' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                    </div>
                                </td>
                                <td className={`px-6 py-4 text-right font-bold font-mono ${t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                    {t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString()}€
                                </td>
                            </tr>
                        ))}
                        {filteredTransactions.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                                    No se encontraron movimientos que coincidan con los filtros.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
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