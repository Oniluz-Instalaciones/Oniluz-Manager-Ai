import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Building2, Users, Truck, Wallet, TrendingDown, TrendingUp, AlertTriangle, Briefcase, Calculator, Plus, Trash2, Save, Calendar, CheckCircle2, Target } from 'lucide-react';
import { Project } from '../types';
import { FixedExpense, Employee, Asset, Tax, InternalFinancialState } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, ComposedChart, Line } from 'recharts';
import { supabase } from '../lib/supabase';

interface InternalFinanceProps {
    projects: Project[]; // Passed to calculate total revenue/cash flow if needed
    onBack: () => void;
}

// Default state if DB is empty
const DEFAULT_STATE: InternalFinancialState = {
    cashBalance: 0,
    fixedExpenses: [],
    employees: [],
    assets: [],
    taxes: []
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const InternalFinance: React.FC<InternalFinanceProps> = ({ projects, onBack }) => {
    const [state, setState] = useState<InternalFinancialState>(DEFAULT_STATE);
    const [activeTab, setActiveTab] = useState<'overview' | 'opex' | 'hr' | 'assets' | 'taxes'>('overview');
    const [loading, setLoading] = useState(true);
    
    // Employee Modal State
    const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
    const [newEmployee, setNewEmployee] = useState({
        name: '',
        role: 'Technician',
        grossSalary: 0,
        socialSecurity: 0
    });

    // Asset Modal State
    const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
    const [newAsset, setNewAsset] = useState({
        name: '',
        type: 'Equipment',
        purchaseDate: new Date().toISOString().split('T')[0],
        cost: 0,
        usefulLifeYears: 5
    });

    // Tax Modal State
    const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
    const [newTax, setNewTax] = useState({
        name: '',
        amount: 0,
        model: '303', // 303, 111, 202
        dueDate: new Date().toISOString().split('T')[0]
    });

    // --- DATA FETCHING ---
    useEffect(() => {
        fetchLedgerData();
    }, []);

    const fetchLedgerData = async () => {
        setLoading(true);
        try {
            const { data: ledgerData, error: ledgerError } = await supabase
                .from('internal_ledger')
                .select('*');

            const { data: staffData, error: staffError } = await supabase
                .from('company_staff')
                .select('*');

            const { data: assetsData, error: assetsError } = await supabase
                .from('company_assets')
                .select('*');

            if (ledgerError) console.error('Error fetching ledger:', ledgerError);
            if (staffError) console.error('Error fetching staff:', staffError);
            if (assetsError) console.error('Error fetching assets:', assetsError);

            const newState: InternalFinancialState = {
                cashBalance: 45000, // TODO: Fetch from a 'CASH' record or calculate
                fixedExpenses: [],
                employees: [],
                assets: [],
                taxes: []
            };

            if (ledgerData) {
                ledgerData.forEach((row: any) => {
                    if (row.record_type === 'EXPENSE') {
                        // Check if it is a Tax
                        if (row.details && row.details.category === 'Tax') {
                             newState.taxes.push({
                                id: row.id,
                                name: row.name,
                                model: row.details.model || '303',
                                amount: row.amount,
                                dueDate: row.details.nextDueDate || row.created_at, // Fallback
                                status: row.details.status || 'Pending'
                            });
                        } else {
                            // It is a regular Fixed Expense
                            newState.fixedExpenses.push({
                                id: row.id,
                                name: row.name,
                                amount: row.amount,
                                frequency: row.details.frequency,
                                category: row.details.category,
                                nextDueDate: row.details.nextDueDate
                            });
                        }
                    }
                });
            }

            if (staffData) {
                staffData.forEach((emp: any) => {
                    newState.employees.push({
                        id: emp.id,
                        name: emp.name,
                        role: emp.role,
                        grossSalary: emp.gross_salary_monthly,
                        socialSecurityCost: emp.social_security_cost_monthly,
                        contractHours: emp.contract_hours_yearly || 1760,
                        holidays: emp.holidays_days || 30
                    });
                });
            }

            if (assetsData) {
                assetsData.forEach((asset: any) => {
                    newState.assets.push({
                        id: asset.id,
                        name: asset.name,
                        type: asset.type,
                        purchaseDate: asset.purchase_date,
                        cost: asset.cost,
                        usefulLifeYears: asset.useful_life_years,
                        residualValue: asset.residual_value || 0
                    });
                });
            }

            setState(newState);
        } catch (err) {
            console.error("Failed to load internal finance data", err);
        } finally {
            setLoading(false);
        }
    };

    // --- HANDLERS (DB Writes) ---
    const handleAddExpense = async () => {
        const name = prompt("Nombre del Gasto:");
        const amount = Number(prompt("Importe:"));
        if (name && amount) {
            const newExp = {
                record_type: 'EXPENSE',
                name,
                amount,
                details: {
                    frequency: 'Monthly',
                    category: 'Other',
                    nextDueDate: new Date().toISOString().split('T')[0]
                }
            };

            const { data, error } = await supabase.from('internal_ledger').insert([newExp]).select();
            
            if (!error && data) {
                fetchLedgerData(); // Refresh
            } else {
                alert("Error al guardar el gasto");
            }
        }
    };

    const handleAddEmployee = async () => {
        if (!newEmployee.name || !newEmployee.grossSalary || !newEmployee.socialSecurity) {
            alert("Por favor, rellena todos los campos.");
            return;
        }

        const { data, error } = await supabase.from('company_staff').insert([{
            name: newEmployee.name,
            role: newEmployee.role,
            gross_salary_monthly: newEmployee.grossSalary,
            social_security_cost_monthly: newEmployee.socialSecurity
        }]).select();

        if (!error && data) {
            fetchLedgerData();
            setIsEmployeeModalOpen(false);
            setNewEmployee({ name: '', role: 'Technician', grossSalary: 0, socialSecurity: 0 });
        } else {
            alert("Error al guardar empleado: " + error?.message);
        }
    };

    const handleDeleteEmployee = async (id: string) => {
        if (!confirm("¿Estás seguro de eliminar este empleado?")) return;
        
        const { error } = await supabase.from('company_staff').delete().eq('id', id);
        if (!error) {
            fetchLedgerData();
        } else {
            alert("Error al eliminar empleado");
        }
    };

    const handleAddAsset = async () => {
        if (!newAsset.name || !newAsset.cost || !newAsset.usefulLifeYears) {
            alert("Por favor, rellena todos los campos.");
            return;
        }

        const { data, error } = await supabase.from('company_assets').insert([{
            name: newAsset.name,
            type: newAsset.type,
            purchase_date: newAsset.purchaseDate,
            cost: newAsset.cost,
            useful_life_years: newAsset.usefulLifeYears,
            residual_value: 0 // Default for now
        }]).select();

        if (!error && data) {
            fetchLedgerData();
            setIsAssetModalOpen(false);
            setNewAsset({ name: '', type: 'Equipment', purchaseDate: new Date().toISOString().split('T')[0], cost: 0, usefulLifeYears: 5 });
        } else {
            alert("Error al guardar activo: " + error?.message);
        }
    };

    const handleAddTax = async () => {
        if (!newTax.name || !newTax.amount) {
            alert("Por favor, rellena todos los campos.");
            return;
        }

        const newExp = {
            record_type: 'EXPENSE',
            name: newTax.name,
            amount: newTax.amount,
            details: {
                frequency: 'Quarterly',
                category: 'Tax',
                model: newTax.model,
                nextDueDate: newTax.dueDate,
                status: 'Pending'
            }
        };

        const { data, error } = await supabase.from('internal_ledger').insert([newExp]).select();
        
        if (!error && data) {
            fetchLedgerData();
            setIsTaxModalOpen(false);
            setNewTax({ name: '', amount: 0, model: '303', dueDate: new Date().toISOString().split('T')[0] });
        } else {
            alert("Error al guardar impuesto: " + error?.message);
        }
    };

    const handleAddManagementExpense = async () => {
        const name = prompt("Concepto (ej. Cuota Gestoría):", "Cuota Mensual Gestoría");
        const amount = Number(prompt("Importe Mensual:", "150"));
        
        if (name && amount) {
             const newExp = {
                record_type: 'EXPENSE',
                name,
                amount,
                details: {
                    frequency: 'Monthly',
                    category: 'Professional Services',
                    nextDueDate: new Date().toISOString().split('T')[0]
                }
            };

            const { data, error } = await supabase.from('internal_ledger').insert([newExp]).select();
            if (!error) fetchLedgerData();
        }
    };

    const seedDemoData = async () => {
        // Check if tables are empty (or at least one of them to avoid duplicates)
        if (state.employees.length > 0 || state.assets.length > 0 || state.fixedExpenses.length > 0) {
            if (!confirm("Ya existen datos. ¿Quieres añadir los datos de ejemplo de todas formas?")) return;
        }

        setLoading(true);
        try {
            // 1. Insert Employee
            await supabase.from('company_staff').insert([{
                name: 'Técnico Especialista [DEMO]',
                role: 'Technician',
                gross_salary_monthly: 1650,
                social_security_cost_monthly: 550,
                contract_hours_yearly: 1760,
                holidays_days: 30
            }]);

            // 2. Insert Asset
            await supabase.from('company_assets').insert([{
                name: 'Furgoneta Ford Transit [DEMO]',
                type: 'Vehicle',
                purchase_date: new Date().toISOString().split('T')[0],
                cost: 18000,
                useful_life_years: 10,
                residual_value: 0
            }]);

            // 3. Insert Tax
            await supabase.from('internal_ledger').insert([{
                record_type: 'EXPENSE',
                name: 'IVA 1T (Estimado) [DEMO]',
                amount: 3000,
                details: {
                    frequency: 'Quarterly',
                    category: 'Tax',
                    model: '303',
                    nextDueDate: new Date(new Date().getFullYear(), 3, 20).toISOString().split('T')[0], // April 20th
                    status: 'Pending'
                }
            }]);

            // 4. Insert Management Expense (Optional but good for demo)
            await supabase.from('internal_ledger').insert([{
                record_type: 'EXPENSE',
                name: 'Gestoría Mensual [DEMO]',
                amount: 150,
                details: {
                    frequency: 'Monthly',
                    category: 'Professional Services',
                    nextDueDate: new Date().toISOString().split('T')[0]
                }
            }]);

            await fetchLedgerData();
            alert("Datos de ejemplo cargados correctamente.");

        } catch (error) {
            console.error("Error seeding demo data:", error);
            alert("Error al cargar datos de ejemplo.");
        } finally {
            setLoading(false);
        }
    };

    const handleClearDemoData = async () => {
        if (!confirm("¿Estás seguro de eliminar TODOS los datos de ejemplo (marcados con [DEMO])?")) return;

        setLoading(true);
        try {
            // Delete from all tables where name contains [DEMO]
            // Note: Supabase 'ilike' is case-insensitive like
            await supabase.from('company_staff').delete().ilike('name', '%[DEMO]%');
            await supabase.from('company_assets').delete().ilike('name', '%[DEMO]%');
            // Taxes are now in internal_ledger, so the next line covers them too
            await supabase.from('internal_ledger').delete().ilike('name', '%[DEMO]%');

            await fetchLedgerData();
            alert("Datos de ejemplo eliminados.");
        } catch (error) {
            console.error("Error clearing demo data:", error);
            alert("Error al eliminar datos de ejemplo.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAsset = async (id: string) => {
        if (!confirm("¿Estás seguro de eliminar este activo?")) return;
        
        const { error } = await supabase.from('company_assets').delete().eq('id', id);
        if (!error) {
            fetchLedgerData();
        } else {
            alert("Error al eliminar activo");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("¿Estás seguro de eliminar este registro?")) return;
        
        const { error } = await supabase.from('internal_ledger').delete().eq('id', id);
        if (!error) {
            fetchLedgerData(); // Refresh
        } else {
            alert("Error al eliminar");
        }
    };


    // --- CALCULATIONS (The CFO Brain) ---

    // 1. Monthly Fixed Expenses (Normalized)
    const monthlyFixedExpenses = useMemo(() => {
        return state.fixedExpenses.reduce((sum, exp) => {
            if (exp.frequency === 'Monthly') return sum + exp.amount;
            if (exp.frequency === 'Quarterly') return sum + (exp.amount / 3);
            if (exp.frequency === 'Yearly') return sum + (exp.amount / 12);
            return sum;
        }, 0);
    }, [state.fixedExpenses]);

    // 2. Monthly Payroll Cost (Total Company Cost)
    const monthlyPayrollCost = useMemo(() => {
        const totalAnnual = state.employees.reduce((sum, emp) => sum + emp.grossSalary + emp.socialSecurityCost, 0);
        return totalAnnual / 12;
    }, [state.employees]);

    // 3. Monthly Asset Amortization (Linear)
    const monthlyAmortization = useMemo(() => {
        return state.assets.reduce((sum, asset) => {
            const depreciableAmount = asset.cost - asset.residualValue;
            const monthlyDepreciation = depreciableAmount / (asset.usefulLifeYears * 12);
            return sum + monthlyDepreciation;
        }, 0);
    }, [state.assets]);

    // 4. Monthly Tax Provision (Average)
    const monthlyTaxProvision = useMemo(() => {
        return state.taxes.reduce((sum, tax) => {
            // Assume taxes are quarterly by default for now, or use due date logic
            // Most models (303, 111, 202) are quarterly.
            return sum + (tax.amount / 3);
        }, 0);
    }, [state.taxes]);

    // 5. Total Monthly Burn Rate (Fixed + Payroll + Amortization + Taxes)
    const monthlyBurnRate = monthlyFixedExpenses + monthlyPayrollCost + monthlyAmortization + monthlyTaxProvision;

    // 6. Runway (Months of Survival)
    const runwayMonths = state.cashBalance / (monthlyBurnRate || 1);

    // 7. Real Hourly Cost Calculation
    const hourlyCostAnalysis = useMemo(() => {
        const technicians = state.employees.filter(e => e.role === 'Technician');
        if (technicians.length === 0) return { avgCost: 0, details: [] };

        // Indirect Costs to Allocate (Rent, Utilities, Admin Salaries, Taxes, etc.)
        const adminSalaries = state.employees.filter(e => e.role !== 'Technician').reduce((sum, e) => sum + e.grossSalary + e.socialSecurityCost, 0);
        const annualOverhead = (monthlyFixedExpenses * 12) + adminSalaries + (monthlyAmortization * 12) + (monthlyTaxProvision * 12);
        
        // Total Billable Hours Capacity
        const totalBillableHours = technicians.reduce((sum, t) => {
            const effectiveHours = t.contractHours - (t.holidays * 8); // Simple estimation
            return sum + effectiveHours;
        }, 0);

        const overheadPerHour = annualOverhead / (totalBillableHours || 1);

        const details = technicians.map(tech => {
            const annualCost = tech.grossSalary + tech.socialSecurityCost;
            const effectiveHours = tech.contractHours - (tech.holidays * 8);
            const directCostPerHour = annualCost / effectiveHours;
            const totalHourlyCost = directCostPerHour + overheadPerHour;
            
            return {
                name: tech.name,
                directCost: directCostPerHour,
                overheadCost: overheadPerHour,
                totalCost: totalHourlyCost
            };
        });

        const avgCost = details.reduce((sum, d) => sum + d.totalCost, 0) / details.length;

        return { avgCost, details };
    }, [state.employees, monthlyFixedExpenses, monthlyAmortization, monthlyTaxProvision]);

    // 7. Upcoming Payments Calendar (Next 30 Days)
    const upcomingPayments = useMemo(() => {
        const today = new Date();
        const next30Days = new Date();
        next30Days.setDate(today.getDate() + 45); // Look ahead 45 days

        const payments = state.fixedExpenses.map(exp => {
            // If no due date, assume 1st of next month for demo purposes
            let dueDate = exp.nextDueDate ? new Date(exp.nextDueDate) : new Date(today.getFullYear(), today.getMonth() + 1, 1);
            
            // If date is in past, move to next month (simple simulation for recurring)
            if (dueDate < today) {
                dueDate = new Date(today.getFullYear(), today.getMonth() + 1, dueDate.getDate());
            }

            return {
                ...exp,
                dateObj: dueDate,
                daysUntil: Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24))
            };
        }).filter(p => p.dateObj <= next30Days).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

        return payments;
    }, [state.fixedExpenses]);

    // 8. Average Revenue (Last 6 Months)
    const averageRevenue = useMemo(() => {
        if (!projects || projects.length === 0) return 0;
        
        // Flatten transactions
        const allIncome = projects.flatMap(p => p.transactions).filter(t => t.type === 'income');
        if (allIncome.length === 0) return 0;

        // Group by month (YYYY-MM)
        const revenueByMonth: Record<string, number> = {};
        allIncome.forEach(t => {
            const monthKey = t.date.substring(0, 7); // YYYY-MM
            revenueByMonth[monthKey] = (revenueByMonth[monthKey] || 0) + t.amount;
        });

        const months = Object.keys(revenueByMonth).length;
        const totalRev = Object.values(revenueByMonth).reduce((a, b) => a + b, 0);
        
        return months > 0 ? totalRev / months : 0;
    }, [projects]);

    // Data for Break Even Chart
    const breakEvenData = [
        {
            name: 'Estructura Mensual',
            GastosFijos: monthlyFixedExpenses,
            Nominas: monthlyPayrollCost,
            Amortizacion: monthlyAmortization,
            Impuestos: monthlyTaxProvision,
            Total: monthlyBurnRate
        },
        {
            name: 'Facturación Media',
            Ingresos: averageRevenue,
            Total: averageRevenue
        }
    ];

    // --- RENDER HELPERS ---
    const formatCurrency = (val: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val);
    const formatDate = (dateStr: string | Date) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans transition-colors duration-300">
            {/* Header */}
            <div className="bg-white dark:bg-slate-800 shadow-sm px-8 py-5 border-b border-slate-100 dark:border-slate-700 sticky top-0 z-40">
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                                <Briefcase className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                                Finanzas Internas (CFO)
                            </h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Control de Estructura y Backoffice</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-xl border border-indigo-100 dark:border-indigo-800">
                        <Wallet className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <div>
                            <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Caja Actual</div>
                            <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{formatCurrency(state.cashBalance)}</div>
                        </div>
                    </div>
                    {/* Demo Buttons */}
                    <div className="flex gap-2">
                        <button onClick={seedDemoData} className="text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="Cargar datos de ejemplo">
                            <span className="hidden md:inline">Cargar Demo</span>
                            <span className="md:hidden">Demo</span>
                        </button>
                        <button onClick={handleClearDemoData} className="text-xs font-bold text-slate-400 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Limpiar datos de ejemplo">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-8 pb-24 space-y-8">
                
                {/* KPI CARDS (Management Cards) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Runway */}
                    <div className={`p-6 rounded-2xl border shadow-sm transition-all hover:shadow-md ${runwayMonths < 3 ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-xl">
                                <AlertTriangle className={`w-6 h-6 ${runwayMonths < 3 ? 'text-red-500' : 'text-slate-600 dark:text-slate-300'}`} />
                            </div>
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${runwayMonths < 3 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {runwayMonths < 3 ? 'CRÍTICO' : 'SALUDABLE'}
                            </span>
                        </div>
                        <div className="text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
                            {runwayMonths.toFixed(1)} Meses
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            Fondo de Maniobra (Supervivencia)
                        </div>
                    </div>

                    {/* Monthly Burn Rate */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:shadow-md">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                                <TrendingDown className="w-6 h-6 text-orange-500" />
                            </div>
                        </div>
                        <div className="text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
                            {formatCurrency(monthlyBurnRate)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            Gasto Estructural Mensual (Burn Rate)
                        </div>
                    </div>

                    {/* Real Hourly Cost */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:shadow-md">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                                <Calculator className="w-6 h-6 text-blue-500" />
                            </div>
                        </div>
                        <div className="text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
                            {formatCurrency(hourlyCostAnalysis.avgCost)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            Coste Hora Real (Promedio Técnico)
                        </div>
                    </div>

                    {/* Asset Value */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:shadow-md">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                                <Truck className="w-6 h-6 text-emerald-500" />
                            </div>
                        </div>
                        <div className="text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
                            {formatCurrency(state.assets.reduce((sum, a) => sum + (a.cost - a.residualValue), 0))}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            Valor Activos Depreciables
                        </div>
                    </div>
                </div>

                {/* TABS */}
                <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit border border-slate-200 dark:border-slate-700">
                    <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>Visión General</button>
                    <button onClick={() => setActiveTab('opex')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'opex' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>Gastos Fijos (OPEX)</button>
                    <button onClick={() => setActiveTab('hr')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'hr' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>RRHH y Costes</button>
                    <button onClick={() => setActiveTab('assets')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'assets' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>Activos</button>
                    <button onClick={() => setActiveTab('taxes')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'taxes' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>Gestoría e Impuestos</button>
                </div>

                {/* CONTENT AREA */}
                <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 p-8 min-h-[400px]">
                    
                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div className="space-y-12">
                            {/* Top Section: Break Even & Payment Calendar */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                
                                {/* Break Even Chart */}
                                <div className="lg:col-span-2 bg-slate-50 dark:bg-slate-700/20 rounded-2xl p-6 border border-slate-100 dark:border-slate-700">
                                    <div className="flex justify-between items-center mb-6">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                <Target className="w-5 h-5 text-indigo-500" />
                                                Punto de Equilibrio (Break-Even)
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">Comparativa: Coste Estructural vs Facturación Media</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs font-bold text-slate-400 uppercase">Objetivo Mensual</div>
                                            <div className="text-xl font-extrabold text-slate-800 dark:text-white">{formatCurrency(monthlyBurnRate)}</div>
                                        </div>
                                    </div>
                                    <div className="h-72 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={breakEvenData} layout="vertical" margin={{ top: 20, right: 30, left: 40, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} stroke="#e2e8f0" />
                                                <XAxis type="number" tickFormatter={(val) => `${val/1000}k€`} stroke="#94a3b8" fontSize={12} />
                                                <YAxis dataKey="name" type="category" width={120} stroke="#94a3b8" fontSize={12} fontWeight="bold" />
                                                <Tooltip 
                                                    formatter={(val: number) => formatCurrency(val)}
                                                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)'}}
                                                />
                                                <Legend />
                                                <Bar dataKey="GastosFijos" stackId="a" fill="#FF8042" name="Gastos Fijos" radius={[0, 4, 4, 0]} barSize={30} />
                                                <Bar dataKey="Nominas" stackId="a" fill="#0088FE" name="Nóminas" radius={[0, 4, 4, 0]} barSize={30} />
                                                <Bar dataKey="Amortizacion" stackId="a" fill="#FFBB28" name="Amortización" radius={[0, 4, 4, 0]} barSize={30} />
                                                <Bar dataKey="Ingresos" fill="#00C49F" name="Ingresos Reales" radius={[0, 4, 4, 0]} barSize={30} />
                                                
                                                {/* Reference Line for Break Even */}
                                                <ReferenceLine x={monthlyBurnRate} stroke="red" strokeDasharray="3 3" label={{ position: 'top', value: 'Objetivo', fill: 'red', fontSize: 10 }} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="mt-4 flex items-start gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                                        <div className={`p-1.5 rounded-full ${averageRevenue >= monthlyBurnRate ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                            {averageRevenue >= monthlyBurnRate ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-white">
                                                {averageRevenue >= monthlyBurnRate ? 'La empresa es rentable' : 'Déficit Estructural'}
                                            </p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                {averageRevenue >= monthlyBurnRate 
                                                    ? `Cubres gastos y generas ${formatCurrency(averageRevenue - monthlyBurnRate)} de beneficio operativo promedio.`
                                                    : `Necesitas facturar ${formatCurrency(monthlyBurnRate - averageRevenue)} más al mes para cubrir gastos fijos.`
                                                }
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Payment Calendar */}
                                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex flex-col h-full shadow-sm">
                                    <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <Calendar className="w-5 h-5 text-indigo-500" />
                                            Próximos Pagos
                                        </h3>
                                        <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 px-2 py-1 rounded-md">30 Días</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[350px]">
                                        {upcomingPayments.length === 0 ? (
                                            <div className="text-center py-8 text-slate-400 text-sm">No hay pagos próximos registrados.</div>
                                        ) : (
                                            upcomingPayments.map((payment, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl transition-colors group border border-transparent hover:border-slate-100 dark:hover:border-slate-700">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex flex-col items-center justify-center w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase">{payment.dateObj.toLocaleString('es-ES', { month: 'short' })}</span>
                                                            <span className="text-sm font-extrabold text-slate-700 dark:text-slate-300">{payment.dateObj.getDate()}</span>
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-slate-800 dark:text-white text-sm group-hover:text-indigo-600 transition-colors">{payment.name}</div>
                                                            <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                                                {payment.daysUntil === 0 ? <span className="text-red-500 font-bold">¡Vence hoy!</span> : `En ${payment.daysUntil} días`}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="font-mono font-bold text-slate-700 dark:text-slate-300 text-sm">
                                                        {formatCurrency(payment.amount)}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <div className="p-3 bg-slate-50 dark:bg-slate-700/30 border-t border-slate-100 dark:border-slate-700 rounded-b-2xl">
                                        <div className="flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-400">
                                            <span>Total a pagar (30d):</span>
                                            <span className="text-indigo-600 dark:text-indigo-400 text-sm">
                                                {formatCurrency(upcomingPayments.reduce((sum, p) => sum + p.amount, 0))}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Cost Distribution & Hourly Cost (Existing) */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-8 border-t border-slate-100 dark:border-slate-700">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Distribución de Costes Estructurales</h3>
                                    <div className="h-64 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: 'Gastos Fijos', value: monthlyFixedExpenses },
                                                        { name: 'Nóminas', value: monthlyPayrollCost },
                                                        { name: 'Amortización', value: monthlyAmortization }
                                                    ]}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={80}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {COLORS.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip formatter={(val: number) => formatCurrency(val)} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)'}} />
                                                <Legend verticalAlign="bottom" height={36}/>
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Análisis de Coste Hora</h3>
                                    <div className="space-y-4">
                                        {hourlyCostAnalysis.details.map((detail, idx) => (
                                            <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-100 dark:border-slate-700">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-bold text-slate-800 dark:text-white">{detail.name}</span>
                                                    <span className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">{formatCurrency(detail.totalCost)} /h</span>
                                                </div>
                                                <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2 overflow-hidden flex">
                                                    <div className="bg-blue-500 h-full" style={{ width: `${(detail.directCost / detail.totalCost) * 100}%` }} title="Coste Directo (Salario)"></div>
                                                    <div className="bg-orange-400 h-full" style={{ width: `${(detail.overheadCost / detail.totalCost) * 100}%` }} title="Coste Indirecto (Estructura)"></div>
                                                </div>
                                                <div className="flex justify-between text-[10px] mt-1 text-slate-500 dark:text-slate-400 font-medium uppercase">
                                                    <span>Directo: {formatCurrency(detail.directCost)}</span>
                                                    <span>Indirecto: {formatCurrency(detail.overheadCost)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                                        <p className="text-xs text-blue-800 dark:text-blue-300">
                                            <strong>Nota CFO:</strong> Para ser rentable, tu precio de venta por hora debería ser al menos un <strong>30-40% superior</strong> al coste real ({formatCurrency(hourlyCostAnalysis.avgCost * 1.4)}).
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* OPEX TAB */}
                    {activeTab === 'opex' && (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Listado de Gastos Fijos</h3>
                                <button onClick={handleAddExpense} className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-3 py-1.5 rounded-lg transition-colors">
                                    <Plus className="w-4 h-4" /> Añadir Gasto
                                </button>
                            </div>
                            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 uppercase text-xs font-bold">
                                        <tr>
                                            <th className="px-6 py-4">Concepto</th>
                                            <th className="px-6 py-4">Categoría</th>
                                            <th className="px-6 py-4">Frecuencia</th>
                                            <th className="px-6 py-4 text-right">Importe</th>
                                            <th className="px-6 py-4 text-right">Mensualizado</th>
                                            <th className="px-6 py-4"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {state.fixedExpenses.map(exp => {
                                            const monthlyVal = exp.frequency === 'Monthly' ? exp.amount : exp.frequency === 'Quarterly' ? exp.amount / 3 : exp.amount / 12;
                                            return (
                                                <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{exp.name}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">{exp.category}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{exp.frequency === 'Monthly' ? 'Mensual' : exp.frequency === 'Quarterly' ? 'Trimestral' : 'Anual'}</td>
                                                    <td className="px-6 py-4 text-right font-mono text-slate-700 dark:text-slate-300">{formatCurrency(exp.amount)}</td>
                                                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(monthlyVal)}</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button onClick={() => handleDelete(exp.id)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* HR TAB */}
                    {activeTab === 'hr' && (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Estructura de Personal</h3>
                                <button onClick={() => setIsEmployeeModalOpen(true)} className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-3 py-1.5 rounded-lg transition-colors">
                                    <Plus className="w-4 h-4" /> Añadir Técnico/Empleado
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {state.employees.map(emp => (
                                    <div key={emp.id} className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-6 border border-slate-200 dark:border-slate-700 relative group">
                                        <button 
                                            onClick={() => handleDeleteEmployee(emp.id)}
                                            className="absolute top-4 right-4 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="bg-indigo-100 dark:bg-indigo-900/40 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                                                <Users className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-900 dark:text-white">{emp.name}</div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400">{emp.role === 'Technician' ? 'Técnico' : emp.role === 'Admin' ? 'Administración' : 'Gerencia'}</div>
                                            </div>
                                        </div>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-slate-500 dark:text-slate-400">Salario Bruto:</span>
                                                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{formatCurrency(emp.grossSalary)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-500 dark:text-slate-400">Seguridad Social:</span>
                                                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{formatCurrency(emp.socialSecurityCost)}</span>
                                            </div>
                                            <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-600 flex justify-between font-bold">
                                                <span className="text-slate-700 dark:text-slate-200">Coste Total:</span>
                                                <span className="text-indigo-600 dark:text-indigo-400">{formatCurrency(emp.grossSalary + emp.socialSecurityCost)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TAXES TAB */}
                    {activeTab === 'taxes' && (
                        <div className="space-y-8">
                            
                            {/* Fiscal Calendar */}
                            <div className="bg-slate-50 dark:bg-slate-700/30 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <Calendar className="w-5 h-5 text-indigo-500" />
                                    Calendario Fiscal
                                </h3>
                                <div className="grid grid-cols-4 md:grid-cols-12 gap-2">
                                    {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((month, i) => {
                                        const isSettlement = [0, 3, 6, 9].includes(i); // Jan, Apr, Jul, Oct
                                        return (
                                            <div key={i} className={`p-3 rounded-lg text-center border ${isSettlement ? 'bg-indigo-100 border-indigo-200 dark:bg-indigo-900/40 dark:border-indigo-800' : 'bg-white border-slate-100 dark:bg-slate-800 dark:border-slate-700'}`}>
                                                <div className={`text-xs font-bold ${isSettlement ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-400'}`}>{month}</div>
                                                {isSettlement && <div className="text-[10px] text-indigo-500 font-medium mt-1">Liquidación</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Tax Control */}
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Previsión de Impuestos</h3>
                                        <button onClick={() => setIsTaxModalOpen(true)} className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-3 py-1.5 rounded-lg transition-colors">
                                            <Plus className="w-3 h-3" /> Añadir Modelo
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {state.taxes.length === 0 ? (
                                            <div className="text-center py-8 text-slate-400 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                                                No hay impuestos registrados.
                                            </div>
                                        ) : (
                                            state.taxes.map(tax => (
                                                <div key={tax.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-600 font-bold text-xs">
                                                            {tax.name.split(' ')[0]}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-slate-900 dark:text-white text-sm">{tax.name}</div>
                                                            <div className="text-xs text-slate-500">Vence: {formatDate(tax.dueDate)}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(tax.amount)}</div>
                                                        <button onClick={async () => {
                                                            if (!confirm("¿Eliminar este impuesto?")) return;
                                                            await supabase.from('internal_ledger').delete().eq('id', tax.id);
                                                            fetchLedgerData();
                                                        }} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Management Expenses */}
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Gastos de Gestoría</h3>
                                        <button onClick={handleAddManagementExpense} className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-3 py-1.5 rounded-lg transition-colors">
                                            <Plus className="w-3 h-3" /> Añadir Gasto
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {state.fixedExpenses.filter(e => e.category === 'Professional Services').length === 0 ? (
                                            <div className="text-center py-8 text-slate-400 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                                                No hay gastos de gestoría registrados.
                                            </div>
                                        ) : (
                                            state.fixedExpenses.filter(e => e.category === 'Professional Services').map(exp => (
                                                <div key={exp.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
                                                            <Briefcase className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-slate-900 dark:text-white text-sm">{exp.name}</div>
                                                            <div className="text-xs text-slate-500">Mensual</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(exp.amount)}</div>
                                                        <button onClick={() => handleDelete(exp.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
            {/* Employee Modal */}
            {isEmployeeModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Añadir Empleado</h3>
                            <button onClick={() => setIsEmployeeModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <Trash2 className="w-5 h-5 rotate-45" /> {/* Using Trash2 as X icon for now, or import X */}
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre Completo</label>
                                <input 
                                    type="text" 
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                    value={newEmployee.name}
                                    onChange={e => setNewEmployee({...newEmployee, name: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Rol</label>
                                <select 
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                    value={newEmployee.role}
                                    onChange={e => setNewEmployee({...newEmployee, role: e.target.value})}
                                >
                                    <option value="Technician">Técnico</option>
                                    <option value="Admin">Administrativo</option>
                                    <option value="Manager">Gerencia</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Salario Bruto (Mes)</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        value={newEmployee.grossSalary}
                                        onChange={e => setNewEmployee({...newEmployee, grossSalary: Number(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Coste S.S. (Empresa)</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        value={newEmployee.socialSecurity}
                                        onChange={e => setNewEmployee({...newEmployee, socialSecurity: Number(e.target.value)})}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 dark:bg-slate-700/50 flex justify-end gap-3">
                            <button onClick={() => setIsEmployeeModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors">Cancelar</button>
                            <button onClick={handleAddEmployee} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/30">Guardar Empleado</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tax Modal */}
            {isTaxModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Añadir Impuesto</h3>
                            <button onClick={() => setIsTaxModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <Trash2 className="w-5 h-5 rotate-45" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Modelo / Impuesto</label>
                                <select 
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                    value={newTax.model}
                                    onChange={e => {
                                        const model = e.target.value;
                                        let name = '';
                                        if (model === '303') name = 'Modelo 303 (IVA)';
                                        if (model === '111') name = 'Modelo 111 (IRPF)';
                                        if (model === '202') name = 'Modelo 202 (Sociedades)';
                                        setNewTax({...newTax, model, name});
                                    }}
                                >
                                    <option value="303">Modelo 303 (IVA Trimestral)</option>
                                    <option value="111">Modelo 111 (IRPF Trabajadores)</option>
                                    <option value="202">Modelo 202 (Pago a Cuenta Sociedades)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre Descriptivo</label>
                                <input 
                                    type="text" 
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                    value={newTax.name}
                                    onChange={e => setNewTax({...newTax, name: e.target.value})}
                                    placeholder="Ej: IVA 1T 2024"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Importe Estimado (€)</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        value={newTax.amount}
                                        onChange={e => setNewTax({...newTax, amount: Number(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha Límite</label>
                                    <input 
                                        type="date" 
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        value={newTax.dueDate}
                                        onChange={e => setNewTax({...newTax, dueDate: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 dark:bg-slate-700/50 flex justify-end gap-3">
                            <button onClick={() => setIsTaxModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors">Cancelar</button>
                            <button onClick={handleAddTax} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/30">Guardar Previsión</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Asset Modal */}
            {isAssetModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Registrar Activo</h3>
                            <button onClick={() => setIsAssetModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <Trash2 className="w-5 h-5 rotate-45" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre del Activo</label>
                                <input 
                                    type="text" 
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                    value={newAsset.name}
                                    onChange={e => setNewAsset({...newAsset, name: e.target.value})}
                                    placeholder="Ej: Furgoneta Ford Transit"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo</label>
                                    <select 
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        value={newAsset.type}
                                        onChange={e => setNewAsset({...newAsset, type: e.target.value})}
                                    >
                                        <option value="Vehicle">Vehículo</option>
                                        <option value="Tool">Herramienta</option>
                                        <option value="Equipment">Equipo</option>
                                        <option value="Other">Otro</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha Compra</label>
                                    <input 
                                        type="date" 
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        value={newAsset.purchaseDate}
                                        onChange={e => setNewAsset({...newAsset, purchaseDate: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Precio Compra (€)</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        value={newAsset.cost}
                                        onChange={e => setNewAsset({...newAsset, cost: Number(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Vida Útil (Años)</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        value={newAsset.usefulLifeYears}
                                        onChange={e => setNewAsset({...newAsset, usefulLifeYears: Number(e.target.value)})}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 dark:bg-slate-700/50 flex justify-end gap-3">
                            <button onClick={() => setIsAssetModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors">Cancelar</button>
                            <button onClick={handleAddAsset} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/30">Registrar Activo</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InternalFinance;
