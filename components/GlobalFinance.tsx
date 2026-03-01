import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project, Transaction } from '../types';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Calendar, Filter, Download, PieChart as PieIcon, BarChart3, Search, X, User, LineChart as LineChartIcon } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, 
  AreaChart, Area, PieChart, Pie, Legend, LineChart, Line 
} from 'recharts';

interface GlobalFinanceProps {
  projects: Project[];
  onBack: () => void;
}

const GlobalFinance: React.FC<GlobalFinanceProps> = ({ projects, onBack }) => {
  // --- State for Filters ---
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '2026-01-01', // Default start date as requested
    end: new Date().toISOString().split('T')[0] // Today
  });
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'income' | 'expense'>('ALL');
  const [period, setPeriod] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL'>('ALL');

  // Scroll ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Reset scroll on filter change
  useEffect(() => {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [filterType, dateRange, selectedProject]);

  // Handle Period Selection
  const handlePeriodChange = (newPeriod: '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL') => {
      setPeriod(newPeriod);
      const today = new Date();
      let start = new Date('2026-01-01'); // Base start date
      const end = today.toISOString().split('T')[0];

      switch (newPeriod) {
          case '1D':
              start = new Date(today);
              start.setDate(today.getDate() - 1);
              break;
          case '1W':
              start = new Date(today);
              start.setDate(today.getDate() - 7);
              break;
          case '1M':
              start = new Date(today);
              start.setMonth(today.getMonth() - 1);
              break;
          case '3M':
              start = new Date(today);
              start.setMonth(today.getMonth() - 3);
              break;
          case '1Y':
              start = new Date(today);
              start.setFullYear(today.getFullYear() - 1);
              break;
          case 'ALL':
              start = new Date('2026-01-01');
              break;
      }
      
      // Ensure start date is not before 2026-01-01 if that's the hard constraint, 
      // but user might want to see last 1 day even if it's in 2027. 
      // The request said "starting from 01-01-2026 onwards", implying data before that is irrelevant.
      if (start < new Date('2026-01-01')) {
          start = new Date('2026-01-01');
      }

      setDateRange({
          start: start.toISOString().split('T')[0],
          end: end
      });
  };

  // Helper to format dates as dd-mm-yyyy
  const formatDate = (dateStr: string) => {
      if (!dateStr) return '';
      const [year, month, day] = dateStr.split('-');
      return `${day}-${month}-${year}`;
  };

  // --- Data Processing ---

  // 1. Flatten all transactions with project context
  const allTransactions = useMemo(() => {
    return projects.flatMap(p => p.transactions.map(t => {
      // Find related document if any
      const relatedDoc = t.relatedDocumentId ? p.documents.find(d => d.id === t.relatedDocumentId) : undefined;
      return { 
        ...t, 
        projectId: p.id, // Force projectId to match parent project to avoid filtering errors
        projectName: p.name,
        projectStatus: p.status,
        relatedDocument: relatedDoc
      };
    }));
  }, [projects]);

  // 2. Apply Filters
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter(t => {
      // Robust string comparison for dates (YYYY-MM-DD) to avoid timezone issues
      const tDateStr = t.date.split('T')[0]; 
      const startStr = dateRange.start || '2000-01-01';
      const endStr = dateRange.end || '2100-01-01';

      const matchDate = tDateStr >= startStr && tDateStr <= endStr;
      const matchProject = selectedProject === 'ALL' || t.projectId === selectedProject;
      const matchType = filterType === 'ALL' || t.type === filterType;

      return matchDate && matchProject && matchType;
    });
  }, [allTransactions, dateRange, selectedProject, filterType]);

  // 3. Calculate KPI Totals based on Filtered Data
  const totalIncome = useMemo(() => {
      // Calculate income from Invoices (Draft/Sent/Paid) to ensure accuracy with billing
      let income = 0;
      projects.forEach(p => {
          if (selectedProject !== 'ALL' && p.id !== selectedProject) return;
          
          if (p.invoices) {
              p.invoices.forEach(inv => {
                  // Include Draft, Sent, Paid
                  if (inv.status === 'Draft' || inv.status === 'Sent' || inv.status === 'Paid') {
                      // Check date
                      const invDate = inv.date;
                      const startStr = dateRange.start || '2000-01-01';
                      const endStr = dateRange.end || '2100-01-01';
                      if (invDate >= startStr && invDate <= endStr) {
                          income += inv.total; // Use Gross Total
                      }
                  }
              });
          }
      });
      return income;
  }, [projects, selectedProject, dateRange]);

  const totalExpense = useMemo(() => filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0), [filteredTransactions]);
  const netProfit = useMemo(() => totalIncome - totalExpense, [totalIncome, totalExpense]);
  
  // Margen Neto: ((Ingresos - Gastos) / Ingresos) * 100
  const profitMargin = useMemo(() => {
      return totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
  }, [totalIncome, totalExpense]);

  // Previsión de IVA:
  // Income VAT: Sum of taxAmount from actual invoices
  // Expense VAT: Calculated based on expense category rates
  
  const vatIncome = useMemo(() => {
      let totalInvoiceVat = 0;

      projects.forEach(p => {
          if (selectedProject !== 'ALL' && p.id !== selectedProject) return;

          if (p.invoices && p.invoices.length > 0) {
              p.invoices.forEach(inv => {
                  // Include Draft, Sent, Paid
                  if (inv.status === 'Draft' || inv.status === 'Sent' || inv.status === 'Paid') {
                      const invDate = inv.date;
                      const startStr = dateRange.start || '2000-01-01';
                      const endStr = dateRange.end || '2100-01-01';
                      
                      if (invDate >= startStr && invDate <= endStr) {
                          totalInvoiceVat += inv.taxAmount;
                      }
                  }
              });
          }
      });
      
      return totalInvoiceVat; 
  }, [projects, selectedProject, dateRange]);

  const vatExpense = useMemo(() => {
    return filteredTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => {
            let rate = 0.21; // Default 21%
            
            if (t.category === 'Dietas' || t.category === 'Transporte') rate = 0.10;
            if (t.category === 'Seguros' || t.category === 'Personal') rate = 0;
            
            // Calculate VAT amount from the GROSS amount
            // Base = Amount / (1 + rate)
            // VAT = Amount - Base
            const base = t.amount / (1 + rate);
            const vat = t.amount - base;
            
            return sum + vat;
        }, 0);
  }, [filteredTransactions]);
  const vatNet = useMemo(() => vatIncome - vatExpense, [vatIncome, vatExpense]);

  const [showVatDetails, setShowVatDetails] = useState(false);

  // Detección de Pérdidas: Filtra los proyectos donde los gastos sean mayores que los ingresos
  const lossMakingProjects = useMemo(() => {
      return projects.filter(p => {
          const pIncome = p.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
          const pExpenses = p.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
          // Alert if Expenses > Income (Loss)
          return pExpenses > pIncome;
      });
  }, [projects]);

  // --- NEW KPI: Fixed vs Variable Expenses ---
  // Categorization logic
  const fixedCategories = ['Herramientas', 'Maquinaria', 'Alquiler', 'Seguros', 'Suscripciones', 'Personal']; // Added common fixed
  const variableCategories = ['Material', 'Dietas', 'Combustible', 'Logística', 'Mano de Obra', 'Transporte']; // Added common variable

  const expensesList = filteredTransactions.filter(t => t.type === 'expense');
  const fixedExpenses = expensesList.filter(t => fixedCategories.includes(t.category) || !variableCategories.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  // Actually, let's be strict. If it's in variable, it's variable. If in fixed, fixed. 
  // If neither? Default to Variable for project based? Or Fixed? 
  // Let's use the user's specific request: "cuánto se va en herramientas/material frente a dietas/combustible"
  // Group A (Material/Tools/Infra): Material, Herramientas, Maquinaria
  // Group B (Operational/Logistics): Dietas, Combustible, Logística, Transporte
  // Let's call them "Materiales y Equipos" vs "Operativos y Logística"
  
  const materialToolsExpenses = expensesList.filter(t => ['Material', 'Herramientas', 'Maquinaria'].includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const operationalExpenses = expensesList.filter(t => ['Dietas', 'Combustible', 'Logística', 'Transporte', 'Mano de Obra'].includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const otherExpenses = totalExpense - materialToolsExpenses - operationalExpenses;

  const expenseStructureData = [
      { name: 'Materiales y Equipos', value: materialToolsExpenses, color: '#0047AB' },
      { name: 'Operativos (Dietas/Combustible)', value: operationalExpenses, color: '#f59e0b' },
      { name: 'Otros', value: otherExpenses, color: '#94a3b8' }
  ].filter(d => d.value > 0);

  // 4. Prepare Chart Data: Evolution over time (Smoothed)
  const evolutionData = useMemo(() => {
    const grouped: Record<string, { date: string, income: number, expense: number }> = {};
    
    // Sort by date first
    const sorted = [...filteredTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sorted.forEach(t => {
      const key = t.date; // YYYY-MM-DD
      if (!grouped[key]) grouped[key] = { date: key, income: 0, expense: 0 };
      if (t.type === 'income') grouped[key].income += t.amount;
      else grouped[key].expense += t.amount;
    });

    let rawData = Object.values(grouped).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Apply Moving Average Smoothing (Window Size = 3)
    // This reduces oscillation by averaging current point with neighbors
    if (rawData.length > 2) {
        const smoothedData = rawData.map((item, index, arr) => {
            const start = Math.max(0, index - 1);
            const end = Math.min(arr.length - 1, index + 1);
            const window = arr.slice(start, end + 1);
            
            const avgIncome = window.reduce((sum, i) => sum + i.income, 0) / window.length;
            const avgExpense = window.reduce((sum, i) => sum + i.expense, 0) / window.length;

            return { ...item, income: avgIncome, expense: avgExpense };
        });
        return smoothedData;
    }

    return rawData;
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

  // 6. Per Project Breakdown (LIFETIME DATA - Ignoring Date Filter for "Rentabilidad por Obra")
  const projectFinancials = useMemo(() => {
      return projects.map(p => {
          // Use ALL transactions for the project to show true profitability
          // This fixes the "no data reflected" issue when filters are too strict
          const pTrans = p.transactions; 
          
          const inc = pTrans.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
          const exp = pTrans.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
          const profit = inc - exp;
          const margin = inc > 0 ? (profit / inc) * 100 : 0;
          
          let status: 'profit' | 'loss' | 'warning' = 'profit';
          if (profit < 0) status = 'loss';
          else if (margin < 15) status = 'warning'; 

          return {
              id: p.id,
              name: p.name,
              projectStatus: p.status,
              income: inc,
              expense: exp,
              profit: profit,
              margin: margin,
              status: status,
              hasActivity: pTrans.length > 0 || p.budget > 0 // Show if it has transactions OR a budget
          };
      }).filter(p => selectedProject === 'ALL' || p.id === selectedProject)
        .filter(p => p.hasActivity) // Show all active projects
        .sort((a, b) => a.profit - b.profit); 
  }, [projects, selectedProject]); // Removed filteredTransactions dependency

  // Colors for Charts
  const COLORS = ['#0047AB', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const handleExportCSV = () => {
    const headers = ['Fecha', 'Proyecto', 'Tipo', 'Categoría', 'Descripción', 'Importe', 'Usuario'];
    const rows = filteredTransactions.map(t => [
        formatDate(t.date),
        t.projectName,
        t.type,
        t.category,
        `"${t.description}"`, // Quote description to handle commas
        t.amount.toFixed(2),
        t.userName || 'N/A'
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

  // State for viewing document
  const [viewingDoc, setViewingDoc] = useState<{ url: string, type: 'image' | 'pdf' } | null>(null);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col font-sans transition-colors duration-300">
      {/* Document Viewer Modal */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setViewingDoc(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white">Vista Previa del Documento</h3>
              <button onClick={() => setViewingDoc(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
              {viewingDoc.type === 'image' ? (
                <img src={viewingDoc.url} alt="Document" className="max-w-full max-h-full object-contain rounded-lg shadow-sm" />
              ) : (
                <iframe src={viewingDoc.url} className="w-full h-[60vh] rounded-lg border border-slate-200 dark:border-slate-700" title="PDF Viewer" />
              )}
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2 bg-white dark:bg-slate-800">
                <a 
                  href={viewingDoc.url} 
                  download={`documento.${viewingDoc.type === 'pdf' ? 'pdf' : 'png'}`}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0047AB] hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                    <Download className="w-4 h-4" /> Descargar
                </a>
                <button 
                  onClick={() => setViewingDoc(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-bold text-sm transition-colors"
                >
                    Cerrar
                </button>
            </div>
          </div>
        </div>
      )}

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
        <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
            <Download className="w-4 h-4" /> <span className="hidden sm:inline">Exportar CSV</span>
        </button>
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
                    className="bg-transparent border-none text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-0 cursor-pointer w-full sm:w-40"
                 >
                     <option value="ALL">Todas las obras</option>
                     {projects.map(p => <option key={p.id} value={p.id}>{p.name.substring(0, 20)}...</option>)}
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

      <div className="flex-1 overflow-y-auto p-8 max-w-[1600px] mx-auto w-full space-y-8" ref={scrollContainerRef}>
        
        {/* KPI Cards Row 1: General Financials */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-32 transition-colors relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                 <TrendingUp className="w-16 h-16 text-green-500" />
             </div>
             <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider z-10">Ingresos Totales</p>
             <div>
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white z-10">{totalIncome.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                <p className="text-xs text-green-600 dark:text-green-400 font-bold mt-1 bg-green-50 dark:bg-green-900/20 inline-block px-2 py-0.5 rounded-md">
                    {filteredTransactions.filter(t => t.type === 'income').length} movimientos
                </p>
             </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-32 transition-colors relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                 <TrendingDown className="w-16 h-16 text-red-500" />
             </div>
             <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider z-10">Gastos Proyectos</p>
             <div>
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white z-10">{totalExpense.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                <p className="text-xs text-red-500 dark:text-red-400 font-bold mt-1 bg-red-50 dark:bg-red-900/20 inline-block px-2 py-0.5 rounded-md">
                    {filteredTransactions.filter(t => t.type === 'expense').length} movimientos
                </p>
             </div>
          </div>

          <div className={`bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col justify-between h-32 transition-all relative overflow-hidden ${netProfit < 0 ? 'animate-pulse ring-2 ring-red-500/50' : ''}`}>
             <div className="absolute top-0 right-0 p-4 opacity-10">
                 <DollarSign className="w-16 h-16 text-blue-500" />
             </div>
             <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider z-10">Margen Operativo Neto</p>
             <div>
                <p className={`text-3xl font-extrabold z-10 ${netProfit >= 0 ? 'text-[#0047AB] dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                    {netProfit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </p>
                <p className={`text-xs font-bold mt-1 inline-block px-2 py-0.5 rounded-md ${profitMargin >= 0 ? 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400' : 'text-red-500 bg-red-50 dark:bg-red-900/20 dark:text-red-400'}`}>
                    {profitMargin.toFixed(1)}% de rentabilidad
                </p>
             </div>
          </div>

          <div 
              className={`p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border flex flex-col justify-between h-32 transition-colors relative overflow-visible cursor-pointer hover:shadow-md ${vatNet > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700'}`}
              onClick={() => setShowVatDetails(!showVatDetails)}
          >
             <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                 <PieIcon className="w-16 h-16 text-purple-500" />
             </div>
             <p className={`text-xs font-bold uppercase tracking-wider z-10 flex items-center gap-1 ${vatNet > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                 Previsión IVA (Estimado)
                 <span className="bg-slate-200 dark:bg-slate-700 rounded-full w-4 h-4 flex items-center justify-center text-[10px] ml-1">?</span>
             </p>
             <div>
                 <p className={`text-2xl font-extrabold z-10 ${vatNet > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'}`}>
                     {Math.abs(vatNet).toLocaleString()}€
                 </p>
                 <p className={`text-xs font-medium mt-1 ${vatNet > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-slate-400 dark:text-slate-500'}`}>
                    {vatNet > 0 ? 'A Pagar (Reservar dinero)' : 'A Devolver (A favor)'}
                 </p>
             </div>

             {/* VAT Breakdown Dropdown */}
             {showVatDetails && (
                <div 
                    className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-4 z-50 animate-in fade-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Desglose IVA</h4>
                        <button onClick={() => setShowVatDetails(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                            <div>
                                <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">IVA Repercutido</p>
                                <p className="text-[10px] text-green-600 dark:text-green-500">Basado en facturas emitidas</p>
                            </div>
                            <p className="font-bold text-green-700 dark:text-green-400">+{vatIncome.toLocaleString()}€</p>
                        </div>
                        
                        <div className="flex justify-between items-center p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                            <div>
                                <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase">IVA Soportado</p>
                                <p className="text-[10px] text-red-600 dark:text-red-500">Estimado s/categoría (21%, 10%, 0%)</p>
                            </div>
                            <p className="font-bold text-red-700 dark:text-red-400">-{vatExpense.toLocaleString()}€</p>
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">A Pagar / Devolver</p>
                            <p className={`font-bold ${vatNet > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {Math.abs(vatNet).toLocaleString()}€ {vatNet > 0 ? '(A Pagar)' : '(A Devolver)'}
                            </p>
                        </div>
                    </div>
                    <div className="mt-3 text-[10px] text-slate-400 italic bg-slate-50 dark:bg-slate-900/50 p-2 rounded">
                        * Cálculo estimado. Repercutido basado en facturas reales. Soportado estimado según categoría de gasto.
                    </div>
                </div>
             )}
          </div>
        </div>

        {/* KPI Cards Row 2: Alerts & Structure */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Loss Making Projects Alert */}
            <div className={`p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border transition-colors relative overflow-hidden ${lossMakingProjects.length > 0 ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700'}`}>
                <div className="flex items-start justify-between">
                    <div>
                        <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${lossMakingProjects.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                            Proyectos en Pérdida (Gastos &gt; Presupuesto)
                        </p>
                        <h3 className={`text-3xl font-extrabold ${lossMakingProjects.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {lossMakingProjects.length}
                        </h3>
                        {lossMakingProjects.length > 0 && (
                            <div className="mt-3 space-y-1">
                                {lossMakingProjects.slice(0, 3).map(p => (
                                    <div key={p.id} className="text-xs font-medium text-red-700 dark:text-red-300 flex items-center gap-2">
                                        <X className="w-3 h-3" /> {p.name}
                                    </div>
                                ))}
                                {lossMakingProjects.length > 3 && <div className="text-xs text-red-500 italic">+ {lossMakingProjects.length - 3} más...</div>}
                            </div>
                        )}
                        {lossMakingProjects.length === 0 && <p className="text-sm text-slate-500 mt-2">¡Excelente! Todos los proyectos están dentro del presupuesto.</p>}
                    </div>
                    <div className={`p-3 rounded-full ${lossMakingProjects.length > 0 ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                        <TrendingDown className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Expense Structure Ratio */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Estructura de Gastos</p>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white mt-1">Material vs Operativo</h3>
                    </div>
                    <PieIcon className="w-6 h-6 text-slate-400" />
                </div>
                <div className="flex items-center gap-4">
                    <div className="h-24 w-24 min-w-[6rem] relative">
                         <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={200}>
                             <PieChart>
                                 <Pie 
                                    data={expenseStructureData} 
                                    cx="50%" 
                                    cy="50%" 
                                    innerRadius={25} 
                                    outerRadius={40} 
                                    paddingAngle={2} 
                                    dataKey="value"
                                 >
                                     {expenseStructureData.map((entry, index) => (
                                         <Cell key={`cell-${index}`} fill={entry.color} />
                                     ))}
                                 </Pie>
                             </PieChart>
                         </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2">
                        {expenseStructureData.map((d) => (
                            <div key={d.name} className="flex justify-between items-center text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></div>
                                    <span className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-[120px]">{d.name}</span>
                                </div>
                                <span className="font-bold text-slate-800 dark:text-white">{((d.value / totalExpense) * 100).toFixed(0)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Evolution Chart */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 transition-colors">
                 <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
                     <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                         <LineChartIcon className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Evolución de Flujo de Caja
                     </h3>
                     <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg overflow-x-auto max-w-full">
                        {(['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => handlePeriodChange(p)}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all whitespace-nowrap ${
                                    period === p 
                                    ? 'bg-white dark:bg-slate-600 text-[#0047AB] dark:text-blue-400 shadow-sm' 
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                }`}
                            >
                                {p === '1D' ? '1 Día' : p === '1W' ? '1 Sem' : p === '1M' ? '1 Mes' : p === '3M' ? '3 Meses' : p === '1Y' ? '1 Año' : 'Todo'}
                            </button>
                        ))}
                     </div>
                 </div>
                 <div className="h-[300px] w-full relative">
                     <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={200}>
                         <LineChart data={evolutionData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                             <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                             <XAxis 
                                dataKey="date" 
                                tick={{fontSize: 10, fill: '#94a3b8'}} 
                                axisLine={false} 
                                tickLine={false} 
                                tickFormatter={(val) => val.split('-').reverse().join('-')} 
                                minTickGap={30}
                             />
                             <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={(val) => `${val/1000}k`} />
                             <Tooltip 
                                contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} 
                                labelStyle={{color: '#64748b', fontWeight: 'bold'}}
                             />
                             <Legend verticalAlign="top" height={36}/>
                             <Line type="basis" dataKey="income" name="Ingresos" stroke="#10b981" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                             <Line type="basis" dataKey="expense" name="Gastos" stroke="#ef4444" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                         </LineChart>
                     </ResponsiveContainer>
                 </div>
            </div>

            {/* Category Pie Chart */}
            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 transition-colors">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                     <PieIcon className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Distribución de Gastos
                </h3>
                <div className="h-[300px] w-full relative">
                     <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={200}>
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

        {/* Breakdown by Project Table (Replaces Transaction List) */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors">
           <div className="p-8 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
             <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                 <BarChart3 className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Rentabilidad por Obra
             </h3>
             <span className="text-xs text-slate-400 font-medium hidden sm:block">Ordenado por menor beneficio</span>
           </div>
           <div className="overflow-x-auto">
               <table className="w-full min-w-[800px] text-left text-sm">
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
                               <td className="px-6 py-4 font-bold text-slate-800 dark:text-white truncate max-w-[200px]">
                                   <div className="flex items-center gap-2">
                                       {p.status === 'loss' ? (
                                           <TrendingDown className="w-4 h-4 text-red-500" />
                                       ) : p.status === 'warning' ? (
                                           <TrendingUp className="w-4 h-4 text-amber-500" />
                                       ) : (
                                           <TrendingUp className="w-4 h-4 text-green-500" />
                                       )}
                                       {p.name}
                                   </div>
                               </td>
                               <td className="px-6 py-4 text-center">
                                   <span className={`text-[10px] px-2 py-1 rounded-full uppercase font-bold ${
                                       p.projectStatus === 'En Curso' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                       p.projectStatus === 'Completado' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                       'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                   }`}>
                                       {p.projectStatus}
                                   </span>
                               </td>
                               <td className="px-6 py-4 text-right text-green-600 dark:text-green-400 font-mono font-medium">{p.income.toLocaleString()}€</td>
                               <td className="px-6 py-4 text-right text-red-500 dark:text-red-400 font-mono font-medium">{p.expense.toLocaleString()}€</td>
                               <td className={`px-6 py-4 text-right font-mono font-bold ${p.profit >= 0 ? 'text-[#0047AB] dark:text-blue-400' : 'text-red-500'}`}>
                                   {p.profit.toLocaleString()}€
                               </td>
                               <td className="px-6 py-4 text-right">
                                   <div className="flex items-center justify-end gap-2">
                                       <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                           <div 
                                              className={`h-full ${p.status === 'profit' ? 'bg-green-500' : p.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`} 
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

        {/* Detailed Transactions List (Filtered) with Thumbnails */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors">
           <div className="p-8 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
             <h3 className="text-lg font-bold text-slate-900 dark:text-white">Listado de Movimientos Filtrados</h3>
             <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold px-3 py-1 rounded-full">
                 {filteredTransactions.length} registros
             </span>
           </div>
           <div className="divide-y divide-slate-100 dark:divide-slate-700">
             {filteredTransactions.slice(0, 50).map(t => (
               <div key={t.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                  <div className="flex items-start gap-4 mb-2 sm:mb-0 w-full sm:w-auto">
                    {/* Thumbnail / Icon */}
                    <div 
                        className={`relative w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border ${t.relatedDocument ? 'cursor-pointer hover:opacity-80 border-slate-200 dark:border-slate-600' : 'border-transparent'} ${t.type === 'income' ? 'bg-green-50 dark:bg-green-900/20 text-green-600' : 'bg-red-50 dark:bg-red-900/20 text-red-500'}`}
                        onClick={() => t.relatedDocument && setViewingDoc({ url: t.relatedDocument.data, type: t.relatedDocument.type })}
                    >
                      {t.relatedDocument && t.relatedDocument.type === 'image' ? (
                          <img src={t.relatedDocument.data} alt="Ticket" className="w-full h-full object-cover" />
                      ) : (
                          t.type === 'income' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />
                      )}
                      
                      {/* Overlay icon for documents */}
                      {t.relatedDocument && (
                          <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Search className="w-4 h-4 text-white drop-shadow-md" />
                          </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white text-base truncate pr-4">{t.description}</p>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                          <span>{formatDate(t.date)}</span>
                          <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
                          <span className="text-[#0047AB] dark:text-blue-400 font-bold truncate max-w-[150px]">{t.projectName}</span>
                          {t.userName && (
                              <span className="flex items-center gap-1 text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full ml-2 whitespace-nowrap">
                                  <User className="w-2.5 h-2.5" /> {t.userName}
                              </span>
                          )}
                      </div>
                    </div>
                  </div>
                  <div className={`font-bold text-lg text-right whitespace-nowrap pl-4 ${t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString()}€
                    <span className="block text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1">{t.category}</span>
                  </div>
               </div>
             ))}
             {filteredTransactions.length === 0 && (
               <div className="p-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                   No se encontraron movimientos en este periodo.
                   {selectedProject !== 'ALL' && (
                       <p className="text-xs mt-2 text-slate-400">
                           Prueba a ampliar el rango de fechas para ver el historial completo de esta obra.
                       </p>
                   )}
               </div>
             )}
             {filteredTransactions.length > 50 && (
                 <div className="p-4 text-center text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700">
                     Mostrando los primeros 50 movimientos. Exporta a CSV para ver todo.
                 </div>
             )}
           </div>
        </div>

      </div>
    </div>
  );
};

export default GlobalFinance;