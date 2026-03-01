import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Building2, Users, Truck, Wallet, TrendingDown, TrendingUp, AlertTriangle, Briefcase, Calculator, Plus, Trash2, Save, Calendar, CheckCircle2, Target, Edit, X, PieChart as PieIcon } from 'lucide-react';
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
    const [editingAssetId, setEditingAssetId] = useState<string | null>(null);

    // Tax Modal State
    const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
    const [isCalculatingTax, setIsCalculatingTax] = useState(false);
    const [newTax, setNewTax] = useState({
        name: '',
        amount: 0,
        model: '303', // 303, 111, 202
        dueDate: new Date().toISOString().split('T')[0]
    });

    const [isManagementExpenseModalOpen, setIsManagementExpenseModalOpen] = useState(false);
    const [newManagementExpense, setNewManagementExpense] = useState({
        name: 'Cuota Mensual Gestoría',
        amount: 150,
        frequency: 'Monthly'
    });

    const [showStructuralDetails, setShowStructuralDetails] = useState(false);
    const [showVatDetails, setShowVatDetails] = useState(false);

    // --- DATA FETCHING ---
    useEffect(() => {
        fetchLedgerData();
    }, []);

    const fetchLedgerData = async () => {
        setLoading(true);
        
        // Helper for silent fetching
        const safeFetch = async (table: string) => {
            try {
                const { data, error } = await supabase.from(table).select('*');
                if (error) {
                    // console.warn(`Silent error fetching ${table}:`, error.message);
                    return [];
                }
                return data || [];
            } catch (e) {
                return [];
            }
        };

        try {
            // Parallel fetch for performance
            const [ledgerData, staffData, assetsData, taxesData] = await Promise.all([
                safeFetch('internal_ledger'),
                safeFetch('company_staff'),
                safeFetch('company_assets'),
                safeFetch('company_taxes')
            ]);

            const newState: InternalFinancialState = {
                cashBalance: 0, 
                fixedExpenses: [],
                employees: [],
                assets: [],
                taxes: []
            };

            if (ledgerData) {
                ledgerData.forEach((row: any) => {
                    if (row.record_type === 'EXPENSE') {
                        newState.fixedExpenses.push({
                            id: row.id,
                            name: row.name,
                            amount: row.amount,
                            frequency: row.details?.frequency || 'Monthly',
                            category: row.details?.category || 'Other',
                            nextDueDate: row.details?.nextDueDate
                        });
                    }
                });
            }

            if (staffData) {
                newState.employees = staffData.map((row: any) => ({
                    id: row.id,
                    name: row.name,
                    role: row.role,
                    grossSalary: row.gross_salary_monthly,
                    socialSecurityCost: row.social_security_cost_monthly,
                    contractHours: row.contract_hours_yearly,
                    holidays: row.holidays_days
                }));
            }

            if (assetsData) {
                newState.assets = assetsData.map((row: any) => ({
                    id: row.id,
                    name: row.name,
                    type: row.type,
                    purchaseDate: row.purchase_date,
                    cost: row.cost,
                    usefulLifeYears: row.useful_life_years,
                    residualValue: row.residual_value
                }));
            }

            if (taxesData) {
                newState.taxes = taxesData.map((row: any) => ({
                    id: row.id,
                    name: row.name,
                    model: row.model,
                    amount: row.amount,
                    dueDate: row.due_date,
                    status: row.status
                }));
            }

            setState(newState);
        } catch (error) {
            console.error("Critical error in finance dashboard:", error);
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

        if (editingAssetId) {
            const { error } = await supabase.from('company_assets').update({
                name: newAsset.name,
                type: newAsset.type,
                purchase_date: newAsset.purchaseDate,
                cost: newAsset.cost,
                useful_life_years: newAsset.usefulLifeYears
            }).eq('id', editingAssetId);

            if (!error) {
                fetchLedgerData();
                setIsAssetModalOpen(false);
                setEditingAssetId(null);
                setNewAsset({ name: '', type: 'Equipment', purchaseDate: new Date().toISOString().split('T')[0], cost: 0, usefulLifeYears: 5 });
            } else {
                alert("Error al actualizar activo: " + error?.message);
            }
        } else {
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
        }
    };

    const handleEditAsset = (asset: Asset) => {
        setNewAsset({
            name: asset.name,
            type: asset.type,
            purchaseDate: asset.purchaseDate,
            cost: asset.cost,
            usefulLifeYears: asset.usefulLifeYears
        });
        setEditingAssetId(asset.id);
        setIsAssetModalOpen(true);
    };

    // --- TAX CALCULATION HELPER ---
    const calculateEstimatedTax = async () => {
        if (!newTax.model || !newTax.dueDate) {
            alert("Por favor, selecciona un modelo y una fecha límite primero.");
            return;
        }

        setIsCalculatingTax(true);
        console.log("--- INICIO CÁLCULO IMPUESTOS ---");
        
        // Simulate calculation delay for better UX
        await new Promise(resolve => setTimeout(resolve, 1000));

        // DIAGNOSTIC CHECK
        const diagnosticInfo = {
            projectsCount: projects?.length || 0,
            fixedExpensesCount: state.fixedExpenses.length,
            employeesCount: state.employees.length,
            assetsCount: state.assets.length
        };
        console.log("Diagnóstico de Datos:", diagnosticInfo);

        const dueDate = new Date(newTax.dueDate);
        const dueMonth = dueDate.getMonth(); // 0-11
        const dueYear = dueDate.getFullYear();
        
        // ROBUST QUARTER LOGIC
        let startMonth, endMonth, taxYear;
        let quarterName = "";
        
        if (dueMonth >= 0 && dueMonth <= 2) { 
            startMonth = 9; endMonth = 11; taxYear = dueYear - 1; 
            quarterName = "4T (Oct-Dic)";
        } else if (dueMonth >= 3 && dueMonth <= 5) { 
            startMonth = 0; endMonth = 2; taxYear = dueYear; 
            quarterName = "1T (Ene-Mar)";
        } else if (dueMonth >= 6 && dueMonth <= 8) { 
            startMonth = 3; endMonth = 5; taxYear = dueYear; 
            quarterName = "2T (Abr-Jun)";
        } else { 
            startMonth = 6; endMonth = 8; taxYear = dueYear; 
            quarterName = "3T (Jul-Sep)";
        }

        console.log(`Periodo Fiscal: ${quarterName} ${taxYear}`);

        // Filter Transactions for the Period
        const safeProjects = projects || [];
        const allTransactions = safeProjects.flatMap(p => p.transactions || []);
        
        // DEBUG: Check first transaction date format
        if (allTransactions.length > 0) {
            console.log("Formato fecha primera transacción:", allTransactions[0].date, "Parsed:", new Date(allTransactions[0].date));
        }
        
        const periodTransactions = allTransactions.filter(t => {
            if (!t.date) return false;
            
            // Try parsing date
            let tDate = new Date(t.date);
            
            // Fallback for DD/MM/YYYY format if ISO fails
            if (isNaN(tDate.getTime()) && t.date.includes('/')) {
                const parts = t.date.split('/');
                if (parts.length === 3) {
                    // Assume DD/MM/YYYY
                    tDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
            }

            if (isNaN(tDate.getTime())) {
                // console.warn("Fecha inválida en transacción:", t);
                return false; 
            }
            
            return tDate.getFullYear() === taxYear && tDate.getMonth() >= startMonth && tDate.getMonth() <= endMonth;
        });

        console.log(`Transacciones en el periodo (${quarterName}): ${periodTransactions.length}`);

        let estimatedAmount = 0;
        let msg = "";

        if (newTax.model === '303') {
            // VAT (IVA) Calculation
            
            // Check Data Availability for 303
            if (periodTransactions.length === 0 && state.fixedExpenses.length === 0) {
                 alert(`AVISO: No hay datos para calcular el IVA del ${quarterName} ${taxYear}.\n\n- Transacciones en Proyectos: 0\n- Gastos Fijos (Ledger): ${state.fixedExpenses.length}\n\nAsegúrate de tener proyectos con movimientos en esas fechas o gastos fijos registrados.`);
            }

            // IVA Repercutido (Ingresos)
            const incomeTransactions = periodTransactions.filter(t => t.type === 'income' || t.type === 'Income');
            const outputVAT = incomeTransactions.reduce((sum, t) => {
                const amt = Number(t.amount) || 0;
                return sum + (amt - (amt / 1.21));
            }, 0);

            // IVA Soportado (Gastos Variables de Proyectos)
            const expenseTransactions = periodTransactions.filter(t => t.type === 'expense' || t.type === 'Expense');
            const inputVAT = expenseTransactions.reduce((sum, t) => {
                const amt = Number(t.amount) || 0;
                return sum + (amt - (amt / 1.21));
            }, 0);
            
            // IVA Soportado (Gastos Fijos / Estructura)
            const fixedExpensesVAT = state.fixedExpenses.reduce((sum, exp) => {
                 let monthlyAmount = 0;
                 const amt = Number(exp.amount) || 0;
                 if (exp.frequency === 'Monthly') monthlyAmount = amt;
                 else if (exp.frequency === 'Quarterly') monthlyAmount = amt / 3;
                 else if (exp.frequency === 'Yearly') monthlyAmount = amt / 12;
                 
                 const quarterlyTotal = monthlyAmount * 3;
                 return sum + (quarterlyTotal - (quarterlyTotal / 1.21));
            }, 0);

            estimatedAmount = outputVAT - (inputVAT + fixedExpensesVAT);
            
            msg = `Cálculo IVA (${quarterName} ${taxYear}):\n\n` +
                  `+ IVA Repercutido (Ventas): ${formatCurrency(outputVAT)}\n` +
                  `   (${incomeTransactions.length} ingresos en periodo)\n` +
                  `- IVA Soportado (Gastos Proy.): ${formatCurrency(inputVAT)}\n` +
                  `   (${expenseTransactions.length} gastos en periodo)\n` +
                  `- IVA Soportado (Estructura): ${formatCurrency(fixedExpensesVAT)}\n` +
                  `   (Estimación basada en ${state.fixedExpenses.length} gastos fijos)\n` +
                  `--------------------------------\n` +
                  `RESULTADO: ${formatCurrency(estimatedAmount)}`;

        } else if (newTax.model === '111') {
            // IRPF Withholdings
            
            // Check Data Availability for 111
            if (state.employees.length === 0) {
                alert("ERROR: No hay empleados registrados en la base de datos.\n\nEl Modelo 111 se calcula sobre las nóminas. Ve a la pestaña 'RRHH y Costes' y añade empleados, o ejecuta el script SQL de 'Seeds'.");
            }

            const monthlyIRPF = state.employees.reduce((sum, emp) => sum + (emp.grossSalary * 0.15), 0); // 15% estimate
            estimatedAmount = monthlyIRPF * 3;
            
            msg = `Cálculo IRPF 111 (${quarterName} ${taxYear}):\n\n` +
                  `Empleados Activos: ${state.employees.length}\n` +
                  `Nóminas Mensuales (Total): ${formatCurrency(monthlyIRPF / 0.15)} (aprox)\n` +
                  `Retención Estimada (15%): ${formatCurrency(monthlyIRPF)}\n` +
                  `x 3 Meses: ${formatCurrency(estimatedAmount)}`;

        } else if (newTax.model === '202') {
             // Corporate Tax
             const totalIncome = periodTransactions
                .filter(t => t.type === 'income' || t.type === 'Income')
                .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
                
             const totalExpenses = periodTransactions
                .filter(t => t.type === 'expense' || t.type === 'Expense')
                .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
                
             const fixedExpensesTotal = state.fixedExpenses.reduce((sum, exp) => {
                 let monthlyAmount = 0;
                 const amt = Number(exp.amount) || 0;
                 if (exp.frequency === 'Monthly') monthlyAmount = amt;
                 else if (exp.frequency === 'Quarterly') monthlyAmount = amt / 3;
                 else if (exp.frequency === 'Yearly') monthlyAmount = amt / 12;
                 return sum + (monthlyAmount * 3);
            }, 0);
            
            const netProfit = totalIncome - (totalExpenses + fixedExpensesTotal);
            estimatedAmount = netProfit > 0 ? netProfit * 0.18 : 0;
            
            msg = `Cálculo IS 202 (${quarterName} ${taxYear}):\n\n` +
                  `Ingresos Periodo: ${formatCurrency(totalIncome)}\n` +
                  `Gastos Periodo: ${formatCurrency(totalExpenses + fixedExpensesTotal)}\n` +
                  `Beneficio Neto: ${formatCurrency(netProfit)}\n` +
                  `Pago a cuenta (18%): ${formatCurrency(estimatedAmount)}`;
        }

        console.log("Resultado Final:", estimatedAmount);

        const amountToPay = Math.max(0, estimatedAmount);
        setNewTax(prev => ({ ...prev, amount: parseFloat(amountToPay.toFixed(2)) }));
        setIsCalculatingTax(false);
        
        if (estimatedAmount < 0) {
            alert(`${msg}\n\nRESULTADO NEGATIVO (${formatCurrency(estimatedAmount)}).\nSale "A Compensar" o "A Devolver".\nEl importe a pagar se ha establecido en 0€.`);
        } else {
            alert(msg);
        }
    };

    const handleAddTax = async () => {
        if (!newTax.name || !newTax.amount) {
            alert("Por favor, rellena todos los campos.");
            return;
        }

        const { data, error } = await supabase.from('company_taxes').insert([{
            name: newTax.name,
            model: newTax.model,
            amount: newTax.amount,
            due_date: newTax.dueDate,
            status: 'Pending'
        }]).select();
        
        if (!error && data) {
            fetchLedgerData();
            setIsTaxModalOpen(false);
            setNewTax({ name: '', amount: 0, model: '303', dueDate: new Date().toISOString().split('T')[0] });
        } else {
            alert("Error al guardar impuesto: " + error?.message);
        }
    };

    const handleAddManagementExpense = () => {
        setIsManagementExpenseModalOpen(true);
    };

    const handleSaveManagementExpense = async () => {
        if (newManagementExpense.name && newManagementExpense.amount > 0) {
             const newExp = {
                record_type: 'EXPENSE',
                name: newManagementExpense.name,
                amount: newManagementExpense.amount,
                details: {
                    frequency: newManagementExpense.frequency,
                    category: 'Professional Services',
                    nextDueDate: new Date().toISOString().split('T')[0]
                }
            };

            const { error } = await supabase.from('internal_ledger').insert([newExp]);
            if (!error) {
                fetchLedgerData();
                setIsManagementExpenseModalOpen(false);
                setNewManagementExpense({ name: 'Cuota Mensual Gestoría', amount: 150, frequency: 'Monthly' });
            } else {
                alert("Error al guardar gasto: " + error.message);
            }
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

    // 0. Current Quarter VAT Forecast
    const currentQuarterVat = useMemo(() => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-11
        const quarterIndex = Math.floor(currentMonth / 3);
        const startMonth = quarterIndex * 3;
        const endMonth = startMonth + 2;
        
        const startDate = new Date(currentYear, startMonth, 1);
        const endDate = new Date(currentYear, endMonth + 1, 0); // Last day of quarter

        // 1. VAT Income (Output VAT) from Invoices
        let vatIncome = 0;
        let invoiceCount = 0;
        projects.forEach(p => {
            if (p.invoices) {
                p.invoices.forEach(inv => {
                    const invDate = new Date(inv.date);
                    if (invDate >= startDate && invDate <= endDate && (inv.status === 'Paid' || inv.status === 'Sent')) {
                        vatIncome += (inv.taxAmount || 0);
                        invoiceCount++;
                    }
                });
            }
        });

        // 2. VAT Expense (Input VAT) from Project Expenses
        let vatExpenseProjects = 0;
        let expenseCount = 0;
        projects.forEach(p => {
            if (p.transactions) {
                p.transactions.forEach(t => {
                    if (t.type === 'expense') {
                        const tDate = new Date(t.date);
                        if (tDate >= startDate && tDate <= endDate) {
                            // Estimate VAT if not explicit (assuming 21% included in gross amount for simplicity, or calculate from base if available)
                            // Ideally transaction should have taxAmount. If not, we estimate: Amount - (Amount / 1.21)
                            const tax = t.amount - (t.amount / 1.21);
                            vatExpenseProjects += tax;
                            expenseCount++;
                        }
                    }
                });
            }
        });

        // 3. VAT Expense (Input VAT) from Fixed Expenses (Prorated)
        // We assume fixed expenses have VAT.
        const vatExpenseFixed = state.fixedExpenses.reduce((sum, exp) => {
             let monthlyAmount = 0;
             if (exp.frequency === 'Monthly') monthlyAmount = exp.amount;
             else if (exp.frequency === 'Quarterly') monthlyAmount = exp.amount / 3;
             else if (exp.frequency === 'Yearly') monthlyAmount = exp.amount / 12;
             
             const quarterlyTotal = monthlyAmount * 3;
             // Estimate VAT (21%)
             return sum + (quarterlyTotal - (quarterlyTotal / 1.21));
        }, 0);

        const totalVatExpense = vatExpenseProjects + vatExpenseFixed;
        const netVat = vatIncome - totalVatExpense;

        return {
            income: vatIncome,
            expense: totalVatExpense,
            expenseProjects: vatExpenseProjects,
            expenseFixed: vatExpenseFixed,
            net: netVat,
            quarterName: `Q${quarterIndex + 1} ${currentYear}`,
            invoiceCount,
            expenseCount
        };
    }, [projects, state.fixedExpenses]);

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
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-8 pb-24 space-y-8">
                
                {/* KPI CARDS (Management Cards) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
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
                    <div 
                        className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:shadow-md cursor-pointer relative"
                        onClick={() => setShowStructuralDetails(!showStructuralDetails)}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                                <TrendingDown className="w-6 h-6 text-orange-500" />
                            </div>
                            <span className="bg-slate-100 dark:bg-slate-700 rounded-full w-5 h-5 flex items-center justify-center text-[10px] text-slate-500 font-bold">?</span>
                        </div>
                        <div className="text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
                            {formatCurrency(monthlyBurnRate)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            Gasto Estructural Mensual (Burn Rate)
                        </div>

                        {/* Structural Breakdown Dropdown */}
                        {showStructuralDetails && (
                            <div 
                                className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-4 z-50 animate-in fade-in zoom-in-95 duration-200 w-[300px] md:w-full"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Desglose Mensual</h4>
                                    <button onClick={() => setShowStructuralDetails(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <Wallet className="w-3 h-3 text-slate-500" />
                                            <div>
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Gastos Fijos</p>
                                                <p className="text-[10px] text-slate-500">{state.fixedExpenses.length} conceptos</p>
                                            </div>
                                        </div>
                                        <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{formatCurrency(monthlyFixedExpenses)}</p>
                                    </div>
                                    
                                    <div className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <Users className="w-3 h-3 text-blue-500" />
                                            <div>
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Nóminas + SS</p>
                                                <p className="text-[10px] text-slate-500">{state.employees.length} empleados</p>
                                            </div>
                                        </div>
                                        <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{formatCurrency(monthlyPayrollCost)}</p>
                                    </div>

                                    <div className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <Truck className="w-3 h-3 text-emerald-500" />
                                            <div>
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Amortización</p>
                                                <p className="text-[10px] text-slate-500">{state.assets.length} activos</p>
                                            </div>
                                        </div>
                                        <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{formatCurrency(monthlyAmortization)}</p>
                                    </div>

                                    <div className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <Calculator className="w-3 h-3 text-orange-500" />
                                            <div>
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Impuestos (Prov.)</p>
                                                <p className="text-[10px] text-slate-500">Estimación mensual</p>
                                            </div>
                                        </div>
                                        <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{formatCurrency(monthlyTaxProvision)}</p>
                                    </div>

                                    <div className="pt-2 border-t border-slate-200 dark:border-slate-600 flex justify-between items-center mt-2">
                                        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">Total Mensual</p>
                                        <p className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                                            {formatCurrency(monthlyBurnRate)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Real Hourly Cost */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:shadow-md">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                                <Calculator className="w-6 h-6 text-blue-500" />
                            </div>
                        </div>
                        <div className="text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
                            {formatCurrency(hourlyCostAnalysis.avgCost * 8)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            Coste Jornada Laboral (Promedio Técnico)
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

                    {/* VAT Forecast Card */}
                    <div 
                        className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:shadow-md cursor-pointer relative"
                        onClick={() => setShowVatDetails(!showVatDetails)}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-xl ${currentQuarterVat.net > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20'}`}>
                                <PieIcon className={`w-6 h-6 ${currentQuarterVat.net > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
                            </div>
                            <span className="bg-slate-100 dark:bg-slate-700 rounded-full w-5 h-5 flex items-center justify-center text-[10px] text-slate-500 font-bold">?</span>
                        </div>
                        <div className={`text-3xl font-extrabold mb-1 ${currentQuarterVat.net > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {formatCurrency(Math.abs(currentQuarterVat.net))}
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                Previsión IVA ({currentQuarterVat.quarterName})
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${currentQuarterVat.net > 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                                {currentQuarterVat.net > 0 ? 'A PAGAR' : 'A DEVOLVER'}
                            </span>
                        </div>

                        {/* VAT Breakdown Dropdown */}
                        {showVatDetails && (
                            <div 
                                className="absolute top-full right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-4 z-50 animate-in fade-in zoom-in-95 duration-200 w-[300px] md:w-full"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Desglose IVA {currentQuarterVat.quarterName}</h4>
                                    <button onClick={() => setShowVatDetails(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <TrendingUp className="w-3 h-3 text-slate-500" />
                                            <div>
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">IVA Repercutido</p>
                                                <p className="text-[10px] text-slate-500">{currentQuarterVat.invoiceCount} facturas</p>
                                            </div>
                                        </div>
                                        <p className="font-mono font-bold text-slate-700 dark:text-slate-300">+{formatCurrency(currentQuarterVat.income)}</p>
                                    </div>
                                    
                                    <div className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <TrendingDown className="w-3 h-3 text-slate-500" />
                                            <div>
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">IVA Soportado (Proy.)</p>
                                                <p className="text-[10px] text-slate-500">{currentQuarterVat.expenseCount} gastos</p>
                                            </div>
                                        </div>
                                        <p className="font-mono font-bold text-slate-700 dark:text-slate-300">-{formatCurrency(currentQuarterVat.expenseProjects)}</p>
                                    </div>

                                    <div className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <Building2 className="w-3 h-3 text-slate-500" />
                                            <div>
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">IVA Soportado (Est.)</p>
                                                <p className="text-[10px] text-slate-500">Gastos Fijos</p>
                                            </div>
                                        </div>
                                        <p className="font-mono font-bold text-slate-700 dark:text-slate-300">-{formatCurrency(currentQuarterVat.expenseFixed)}</p>
                                    </div>

                                    <div className="pt-2 border-t border-slate-200 dark:border-slate-600 flex justify-between items-center mt-2">
                                        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">Resultado Neto</p>
                                        <div className="text-right">
                                            <p className={`font-bold text-sm ${currentQuarterVat.net > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                {formatCurrency(Math.abs(currentQuarterVat.net))}
                                            </p>
                                            <p className={`text-[10px] font-bold ${currentQuarterVat.net > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                                {currentQuarterVat.net > 0 ? 'A PAGAR' : 'A DEVOLVER'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
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
                                    <div className="h-72 w-full relative">
                                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={200}>
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
                                    <div className="h-64 w-full relative">
                                        {(monthlyFixedExpenses + monthlyPayrollCost + monthlyAmortization) > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={200}>
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
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                                                No hay datos de costes para mostrar.
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Análisis de Coste Jornada Laboral</h3>
                                    <div className="space-y-4">
                                        {hourlyCostAnalysis.details.map((detail, idx) => (
                                            <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-100 dark:border-slate-700">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-bold text-slate-800 dark:text-white">{detail.name}</span>
                                                    <span className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">{formatCurrency(detail.totalCost * 8)} /día</span>
                                                </div>
                                                <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2 overflow-hidden flex">
                                                    <div className="bg-blue-500 h-full" style={{ width: `${(detail.directCost / detail.totalCost) * 100}%` }} title="Coste Directo (Salario)"></div>
                                                    <div className="bg-orange-400 h-full" style={{ width: `${(detail.overheadCost / detail.totalCost) * 100}%` }} title="Coste Indirecto (Estructura)"></div>
                                                </div>
                                                <div className="flex justify-between text-[10px] mt-1 text-slate-500 dark:text-slate-400 font-medium uppercase">
                                                    <span>Directo: {formatCurrency(detail.directCost * 8)}</span>
                                                    <span>Indirecto: {formatCurrency(detail.overheadCost * 8)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                                        <p className="text-xs text-blue-800 dark:text-blue-300">
                                            <strong>Nota CFO:</strong> Para ser rentable, tu precio de venta por jornada debería ser al menos un <strong>30-40% superior</strong> al coste real ({formatCurrency(hourlyCostAnalysis.avgCost * 8 * 1.4)}).
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
                            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                                <table className="w-full min-w-[600px] text-left text-sm">
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
                                        {/* Manual Fixed Expenses */}
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

                                        {/* Automatic Asset Amortizations */}
                                        {state.assets.map(asset => {
                                            const monthlyVal = (asset.cost - asset.residualValue) / (asset.usefulLifeYears * 12);
                                            if (monthlyVal <= 0) return null;
                                            return (
                                                <tr key={`asset-${asset.id}`} className="bg-emerald-50/30 dark:bg-emerald-900/10 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20">
                                                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white flex items-center gap-2">
                                                        <Truck className="w-4 h-4 text-emerald-500" />
                                                        <span className="truncate">Amortización: {asset.name}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-xs font-bold text-emerald-700 dark:text-emerald-400">Amortización</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">Mensual (Auto)</td>
                                                    <td className="px-6 py-4 text-right font-mono text-slate-700 dark:text-slate-300">{formatCurrency(monthlyVal)}</td>
                                                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(monthlyVal)}</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button onClick={() => setActiveTab('assets')} className="text-emerald-500 hover:text-emerald-700 text-xs font-bold hover:underline">
                                                            Ver Activo
                                                        </button>
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

                    {/* ASSETS TAB */}
                    {activeTab === 'assets' && (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Inventario de Activos</h3>
                                <button onClick={() => {
                                    setNewAsset({ name: '', type: 'Equipment', purchaseDate: new Date().toISOString().split('T')[0], cost: 0, usefulLifeYears: 5 });
                                    setEditingAssetId(null);
                                    setIsAssetModalOpen(true);
                                }} className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-3 py-1.5 rounded-lg transition-colors">
                                    <Plus className="w-4 h-4" /> Registrar Activo
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {state.assets.length === 0 ? (
                                    <div className="col-span-full text-center py-12 text-slate-400 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                                        No hay activos registrados.
                                    </div>
                                ) : (
                                    state.assets.map(asset => (
                                        <div key={asset.id} className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-6 border border-slate-200 dark:border-slate-700 relative group">
                                            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => handleEditAsset(asset)}
                                                    className="text-slate-400 hover:text-indigo-500"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteAsset(asset.id)}
                                                    className="text-slate-400 hover:text-red-500"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="bg-emerald-100 dark:bg-emerald-900/40 p-2 rounded-lg text-emerald-600 dark:text-emerald-400">
                                                    {asset.type === 'Vehicle' ? <Truck className="w-5 h-5" /> : <Briefcase className="w-5 h-5" />}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900 dark:text-white">{asset.name}</div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                                        {asset.type === 'Vehicle' ? 'Vehículo' : asset.type === 'Tool' ? 'Herramienta' : 'Equipo'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 dark:text-slate-400">Valor Compra:</span>
                                                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{formatCurrency(asset.cost)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 dark:text-slate-400">Fecha Compra:</span>
                                                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{formatDate(asset.purchaseDate)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 dark:text-slate-400">Vida Útil:</span>
                                                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{asset.usefulLifeYears} años</span>
                                                </div>
                                                <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-600 flex justify-between font-bold">
                                                    <span className="text-slate-700 dark:text-slate-200">Amortización Mensual:</span>
                                                    <span className="text-emerald-600 dark:text-emerald-400">
                                                        {formatCurrency((asset.cost - asset.residualValue) / (asset.usefulLifeYears * 12))}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
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
                                                            await supabase.from('company_taxes').delete().eq('id', tax.id);
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
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-800 z-10">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Añadir Empleado</h3>
                            <button onClick={() => setIsEmployeeModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <X className="w-5 h-5" />
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
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-800 z-10">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Añadir Impuesto</h3>
                            <button onClick={() => setIsTaxModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <X className="w-5 h-5" />
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
                                    <div className="flex gap-2">
                                        <input 
                                            type="number" 
                                            className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                            value={newTax.amount}
                                            onChange={e => setNewTax({...newTax, amount: Number(e.target.value)})}
                                        />
                                        <button 
                                            onClick={calculateEstimatedTax}
                                            disabled={isCalculatingTax}
                                            className={`p-2 rounded-lg transition-all relative ${isCalculatingTax ? 'bg-indigo-50 cursor-not-allowed' : 'bg-indigo-100 dark:bg-indigo-900/40 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'}`}
                                            title="Calcular automáticamente según transacciones"
                                        >
                                            {isCalculatingTax && (
                                                <span className="absolute inset-0 rounded-lg bg-indigo-400 opacity-75 animate-ping"></span>
                                            )}
                                            <Calculator className={`w-5 h-5 relative z-10 ${isCalculatingTax ? 'text-indigo-500' : ''}`} />
                                        </button>
                                    </div>
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
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-800 z-10">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingAssetId ? 'Editar Activo' : 'Registrar Activo'}</h3>
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
                            <button onClick={handleAddAsset} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/30">{editingAssetId ? 'Guardar Cambios' : 'Registrar Activo'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Management Expense Modal */}
            {isManagementExpenseModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-800 z-10">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Añadir Gasto de Gestoría</h3>
                            <button onClick={() => setIsManagementExpenseModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <Trash2 className="w-5 h-5 rotate-45" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Concepto</label>
                                <input 
                                    type="text" 
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                    value={newManagementExpense.name}
                                    onChange={e => setNewManagementExpense({...newManagementExpense, name: e.target.value})}
                                    placeholder="Ej: Cuota Mensual Gestoría"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Importe (€)</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        value={newManagementExpense.amount}
                                        onChange={e => setNewManagementExpense({...newManagementExpense, amount: Number(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Frecuencia</label>
                                    <select 
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        value={newManagementExpense.frequency}
                                        onChange={e => setNewManagementExpense({...newManagementExpense, frequency: e.target.value})}
                                    >
                                        <option value="Monthly">Mensual</option>
                                        <option value="Quarterly">Trimestral</option>
                                        <option value="Yearly">Anual</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 dark:bg-slate-700/50 flex justify-end gap-3">
                            <button onClick={() => setIsManagementExpenseModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors">Cancelar</button>
                            <button onClick={handleSaveManagementExpense} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/30">Guardar Gasto</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InternalFinance;
