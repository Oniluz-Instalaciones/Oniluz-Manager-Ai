import React, { useState } from 'react';
import { Budget, BudgetItem, Project, PriceItem } from '../types';
import { generateSmartBudget } from '../services/geminiService';
import { Plus, Trash2, Wand2, FileText, Save, ChevronLeft, ArrowRight, Loader2, Database, Paperclip, Check, X, Percent, Euro, MessageSquareQuote, Calculator, MapPin, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

// TARIFA DE MONTAJES VÁLIDA (01/01/2025)
// Definición estricta de precios por rango kilométrico
const VALIDA_TARIFFS = {
    // GRUPO 1: VECTIO / NEXUS / SUPES (2 dias montaje)
    GROUP_1: {
        name: "Vectio/Nexus/Supes",
        ranges: [
            { maxKm: 50, price: 680 },
            { maxKm: 150, price: 750 },
            { maxKm: 200, price: 904 },
            { maxKm: 250, price: 1044 },
            { maxKm: 300, price: 1111 },
            { maxKm: 350, price: 1183 },
            { maxKm: 400, price: 1280 }
        ],
        supplement: 72 // Precio por puerta/parada
    },
    // GRUPO 2: NEXUS 2:1 (3 dias montaje)
    GROUP_2: {
        name: "Nexus 2:1",
        ranges: [
            { maxKm: 50, price: 781 },
            { maxKm: 150, price: 875 },
            { maxKm: 200, price: 1176 },
            { maxKm: 250, price: 1358 },
            { maxKm: 300, price: 1444 },
            { maxKm: 350, price: 1538 },
            { maxKm: 400, price: 1664 }
        ],
        supplement: 72 // Precio base por puerta
    }
};

interface BudgetManagerProps {
    project: Project;
    onUpdate: (updatedProject: Project) => void;
    priceDatabase: PriceItem[];
}

const BudgetManager: React.FC<BudgetManagerProps> = ({ project, onUpdate, priceDatabase }) => {
    const [view, setView] = useState<'list' | 'edit'>('list');
    const [currentBudget, setCurrentBudget] = useState<Budget | null>(null);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [budgetToDelete, setBudgetToDelete] = useState<string | null>(null);
    const [includeDocs, setIncludeDocs] = useState(false);

    // --- Accept Budget States ---
    const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
    const [budgetToAccept, setBudgetToAccept] = useState<Budget | null>(null);
    const [advanceType, setAdvanceType] = useState<'percent' | 'fixed'>('percent');
    const [advanceValue, setAdvanceValue] = useState<number>(50); // Default 50%

    // Helper to format dates as dd-mm-yyyy
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        return `${day}-${month}-${year}`;
    };

    // --- Actions ---

    const handleCreateNew = () => {
        const newBudget: Budget = {
            id: crypto.randomUUID(),
            projectId: project.id,
            name: `Presupuesto #${(project.budgets?.length || 0) + 1}`,
            date: new Date().toISOString().split('T')[0],
            status: 'Draft',
            items: [],
            total: 0,
            aiPrompt: ''
        };
        setCurrentBudget(newBudget);
        setView('edit');
        setAiPrompt('');
    };

    const handleEdit = (budget: Budget) => {
        setCurrentBudget({ ...budget });
        setView('edit');
        setAiPrompt(''); 
    };

    const openAcceptModal = (budget: Budget) => {
        setBudgetToAccept(budget);
        setAdvanceType('percent');
        setAdvanceValue(50);
        setIsAcceptModalOpen(true);
    };

    const handleConfirmAcceptance = async () => {
        if (!budgetToAccept) return;
        setIsSaving(true);

        try {
            // 1. Calculate Advance Amount
            const totalWithVat = budgetToAccept.total * 1.21;
            let finalAdvanceAmount = 0;

            if (advanceType === 'percent') {
                finalAdvanceAmount = totalWithVat * (advanceValue / 100);
            } else {
                finalAdvanceAmount = advanceValue;
            }

            // 2. Update Budget Status in DB
            const { error: budgetError } = await supabase
                .from('budgets')
                .update({ status: 'Accepted' })
                .eq('id', budgetToAccept.id);

            if (budgetError) throw budgetError;

            // 3. Create Income Transaction for the Advance
            if (finalAdvanceAmount > 0) {
                const transactionId = crypto.randomUUID();
                const description = `Anticipo: ${budgetToAccept.name} (${advanceType === 'percent' ? advanceValue + '%' : 'Fijo'})`;
                
                const { error: transError } = await supabase
                    .from('transactions')
                    .insert({
                        id: transactionId, 
                        project_id: project.id,
                        type: 'income',
                        category: 'Anticipo',
                        amount: finalAdvanceAmount,
                        date: new Date().toISOString().split('T')[0],
                        description: description
                    });
                
                if (transError) throw transError;
            }

            // 4. Update Local State
            const updatedBudgets = (project.budgets || []).map(b => 
                b.id === budgetToAccept.id ? { ...b, status: 'Accepted' as const } : b
            );

            // Recalculate total project budget (Sum of accepted budgets)
            const newTotalProjectBudget = updatedBudgets
                .filter(b => b.status === 'Accepted')
                .reduce((sum, b) => sum + b.total, 0);

            // Update Project Budget in DB
            const { error: projectError } = await supabase
                .from('projects')
                .update({ budget: newTotalProjectBudget })
                .eq('id', project.id);
                
            if (projectError) console.error("Error updating project total budget:", projectError);
            
            let updatedTransactions = project.transactions;
            if (finalAdvanceAmount > 0) {
                 const newTransaction = {
                    id: crypto.randomUUID(),
                    projectId: project.id,
                    type: 'income' as const,
                    category: 'Anticipo',
                    amount: finalAdvanceAmount,
                    date: new Date().toISOString().split('T')[0],
                    description: `Anticipo: ${budgetToAccept.name}`
                 };
                 updatedTransactions = [newTransaction, ...project.transactions];
            }

            onUpdate({ 
                ...project, 
                budgets: updatedBudgets,
                transactions: updatedTransactions,
                budget: newTotalProjectBudget
            });

            setIsAcceptModalOpen(false);
            setBudgetToAccept(null);

        } catch (error: any) {
            console.error("Error processing acceptance:", error);
            alert("Error al procesar: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    // --- LÓGICA TARIFICACIÓN VÁLIDA ---
    const handleApplyValidaTariff = () => {
        if (!currentBudget || !project.elevatorData) return;

        const { solutionType, distanceFromBase, floors: rawFloors } = project.elevatorData;
        const floors = Number(rawFloors) || 0;
        const dist = Number(distanceFromBase) || 0; // Distancia calculada en creación

        // 1. Determinar Grupo de Tarifa
        let activeTariff = VALIDA_TARIFFS.GROUP_1; // Por defecto Grupo 1 (Nexus, Vectio, Supes)
        
        if (solutionType === 'Nexus 2:1') {
            activeTariff = VALIDA_TARIFFS.GROUP_2;
        }

        // 2. Buscar Precio exacto por Rango de KM
        let finalInstallationPrice = 0;
        let foundRange = false;

        for (const range of activeTariff.ranges) {
            if (dist <= range.maxKm) {
                finalInstallationPrice = range.price;
                foundRange = true;
                break;
            }
        }
        
        // Si supera el máximo (400km), cogemos el último precio (o se podría añadir lógica extra)
        if (!foundRange) {
            finalInstallationPrice = activeTariff.ranges[activeTariff.ranges.length - 1].price;
        }

        const newItems: BudgetItem[] = [];

        // 3. Partida Principal: Instalación Completa (Incluye mano de obra y desplazamiento)
        newItems.push({
            id: crypto.randomUUID(),
            name: `Montaje ${solutionType} (${dist} km)`,
            unit: 'pa', // Partida Alzada
            quantity: 1,
            pricePerUnit: finalInstallationPrice,
            category: 'Instalación'
        });

        // 4. Partida Suplemento: Puertas (Basado en nº de plantas/paradas)
        if (floors > 0) {
            newItems.push({
                id: crypto.randomUUID(),
                name: 'Montaje Puertas / Paradas',
                unit: 'ud',
                quantity: floors,
                pricePerUnit: activeTariff.supplement,
                category: 'Instalación'
            });
        }

        // Agregamos al presupuesto actual (sin borrar lo existente, por si el usuario quiere combinar)
        updateBudgetTotals({ ...currentBudget, items: [...currentBudget.items, ...newItems] });
        alert(`Tarifa aplicada para ${dist}km: ${finalInstallationPrice}€ base + ${floors * activeTariff.supplement}€ en puertas.`);
    };

    const handleGenerateAI = async () => {
        if (!aiPrompt.trim()) return;
        setIsGenerating(true);
        try {
            // ✅ FIX: usa la URL de Supabase directamente (prepareImagePart la descargará)
    const docImages = includeDocs 
    ? (project.documents || [])
        .filter(d => d.category === 'technical' && d.data)
        .slice(0, 5)
        .map(d => d.data)
    : [];
            const contextPrompt = `Contexto del Proyecto: Nombre "${project.name}", Tipo "${project.type}", Ubicación "${project.location}". Solicitud del usuario: ${aiPrompt}`;

            const items = await generateSmartBudget(contextPrompt, priceDatabase, docImages);
            
            if (items.length === 0) {
                alert("La IA no generó partidas. Intenta ser más específico.");
                return;
            }

            const enrichedItems: BudgetItem[] = items.map((item: any) => ({
                id: crypto.randomUUID(),
                name: item.name,
                unit: item.unit,
                quantity: Number(item.quantity) || 1,
                pricePerUnit: Number(item.pricePerUnit) || 0,
                category: item.category
            }));
            
            if (currentBudget) {
                updateBudgetTotals({ 
                    ...currentBudget, 
                    items: [...currentBudget.items, ...enrichedItems],
                    aiPrompt: aiPrompt 
                });
            }
        } catch (error: any) {
            console.error("Error generating AI budget:", error);
            alert("Error al generar presupuesto con IA.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAddItem = (priceItem?: PriceItem) => {
        if (!currentBudget) return;
        const newItem: BudgetItem = {
            id: crypto.randomUUID(),
            name: priceItem ? priceItem.name : 'Nuevo Concepto',
            unit: priceItem ? priceItem.unit : 'ud',
            quantity: 1,
            pricePerUnit: priceItem ? priceItem.price : 0,
            category: priceItem ? priceItem.category : 'Material'
        };
        updateBudgetTotals({ ...currentBudget, items: [...currentBudget.items, newItem] });
    };

    const handleUpdateItem = (id: string, field: keyof BudgetItem, value: any) => {
        if (!currentBudget) return;
        
        let extraUpdates = {};
        if (field === 'name') {
            const match = priceDatabase.find(p => p.name.toLowerCase() === (value as string).toLowerCase());
            if (match) {
                extraUpdates = {
                    unit: match.unit,
                    pricePerUnit: match.price,
                    category: match.category
                };
            }
        }

        const updatedItems = currentBudget.items.map(item => 
            item.id === id ? { ...item, [field]: value, ...extraUpdates } : item
        );
        updateBudgetTotals({ ...currentBudget, items: updatedItems });
    };

    const handleDeleteItem = (id: string) => {
        if (!currentBudget) return;
        const updatedItems = currentBudget.items.filter(item => item.id !== id);
        updateBudgetTotals({ ...currentBudget, items: updatedItems });
    };

    const updateBudgetTotals = (budget: Budget) => {
        const total = budget.items.reduce((sum, item) => sum + (item.quantity * item.pricePerUnit), 0);
        setCurrentBudget({ ...budget, total });
    };

    const handleSaveBudget = async () => {
        if (!currentBudget) return;
        setIsSaving(true);

        try {

            if (budgetError) throw budgetError;

            const itemsToInsert = currentBudget.items.map(item => ({
                id: item.id,
                budget_id: currentBudget.id,
                name: item.name,
                unit: item.unit,
                quantity: item.quantity,
                price_per_unit: item.pricePerUnit,
                category: item.category,
                discount: item.discount ?? 0
            }));

            await supabase.from('budget_items').delete().eq('budget_id', currentBudget.id);

            if (itemsToInsert.length > 0) {
                const { error: insertError } = await supabase.from('budget_items').insert(itemsToInsert);
                if (insertError) throw insertError;
            }

            const budgets = project.budgets || [];
            const existingIndex = budgets.findIndex(b => b.id === currentBudget.id);
    
            let updatedBudgets;
            if (existingIndex >= 0) {
                updatedBudgets = budgets.map((b, i) => i === existingIndex ? currentBudget : b);
            } else {
                updatedBudgets = [currentBudget, ...budgets];
            }

            let newStatus = project.status;
            let newProgress = project.progress;

            if (project.status === 'Planning') {
                newStatus = 'In Progress';
                newProgress = Math.max(project.progress || 0, 50);
            }

            onUpdate({ 
                ...project, 
                budgets: updatedBudgets,
                status: newStatus,
                progress: newProgress
            });
            setView('list');

        } catch (error: any) {
            console.error("Error saving budget:", error);
            alert("Error guardando en la nube: " + error.message);
        } finally {
            setIsSaving(false);
        }

    const handleDeleteBudget = (id: string) => {
        setBudgetToDelete(id);
    }

    const confirmDeleteBudget = async (id: string) => {
        try {
            const { error } = await supabase.from('budgets').delete().eq('id', id);
            if (error) throw error;
            const updatedBudgets = (project.budgets || []).filter(b => b.id !== id);
            onUpdate({ ...project, budgets: updatedBudgets });
        } catch (error) {
            console.error("Error deleting budget:", error);
            alert("No se pudo eliminar de la base de datos.");
        } finally {
            setBudgetToDelete(null);
        }
    }

    if (view === 'list') {
        const budgets = project.budgets || [];
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Presupuestos del Proyecto</h3>
                    <button onClick={handleCreateNew} className="bg-[#0047AB] text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-[#003380] transition-colors shadow-lg shadow-blue-900/10 font-medium">
                        <Plus className="w-5 h-5" /> Crear Presupuesto
                    </button>
                </div>

                <div className="grid gap-5">
                    {budgets.map(budget => (
                        <div key={budget.id} className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center group hover:shadow-md transition-all">
                            <div onClick={() => handleEdit(budget)} className="cursor-pointer flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 dark:text-white group-hover:text-[#0047AB] transition-colors">{budget.name}</h4>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide font-bold inline-block mt-1 ${
                                            budget.status === 'Accepted' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                            budget.status === 'Sent' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                            'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                        }`}>{budget.status}</span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 ml-12">Creado el {formatDate(budget.date)} • {budget.items.length} partidas</p>
                            </div>
                            <div className="flex items-center gap-6 mt-4 md:mt-0 pl-12 md:pl-0">
                                <div className="text-right">
                                    <span className="block text-xs text-slate-400 dark:text-slate-500 font-medium uppercase">Total (sin IVA)</span>
                                    <span className="text-xl font-bold text-slate-900 dark:text-white">{budget.total.toLocaleString()}€</span>
                                </div>
                                <div className="flex gap-2">
                                    {budget.status !== 'Accepted' && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); openAcceptModal(budget); }}
                                            className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-bold bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors flex items-center gap-1"
                                            title="Marcar como Aceptado"
                                        >
                                            <Check className="w-4 h-4" /> <span className="hidden sm:inline">Aceptar</span>
                                        </button>
                                    )}
                                    <button onClick={() => handleEdit(budget)} className="text-[#0047AB] dark:text-blue-400 hover:text-[#003380] dark:hover:text-blue-300 text-sm font-bold bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">Editar</button>
                                    <button onClick={() => handleDeleteBudget(budget.id)} className="text-slate-300 hover:text-red-500 dark:hover:text-red-400 p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {budgets.length === 0 && (
                        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500">
                            <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            No hay presupuestos creados.
                        </div>
                    )}
                </div>

                {isAcceptModalOpen && budgetToAccept && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
                        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-700">
                            <div className="bg-[#0047AB] p-5 flex justify-between items-center">
                                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                    <Check className="w-5 h-5" /> Aceptar Presupuesto
                                </h3>
                                <button onClick={() => setIsAcceptModalOpen(false)} className="text-white/80 hover:text-white transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6 space-y-6">
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1 font-medium">Presupuesto</p>
                                    <p className="text-xl font-bold text-slate-900 dark:text-white">{budgetToAccept.name}</p>
                                    <div className="flex justify-between items-end mt-2 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total (con IVA)</span>
                                        <span className="text-lg font-bold text-slate-900 dark:text-white">{(budgetToAccept.total * 1.21).toLocaleString()}€</span>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 font-bold uppercase">Configurar Anticipo</p>
                                    
                                    <div className="flex p-1 bg-slate-100 dark:bg-slate-700 rounded-xl mb-4">
                                        <button 
                                            onClick={() => { setAdvanceType('percent'); setAdvanceValue(50); }}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
                                                advanceType === 'percent' 
                                                ? 'bg-white dark:bg-slate-600 text-[#0047AB] dark:text-blue-400 shadow-sm' 
                                                : 'text-slate-500 dark:text-slate-400'
                                            }`}
                                        >
                                            <Percent className="w-3 h-3" /> Porcentaje
                                        </button>
                                        <button 
                                            onClick={() => { setAdvanceType('fixed'); setAdvanceValue(0); }}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
                                                advanceType === 'fixed' 
                                                ? 'bg-white dark:bg-slate-600 text-[#0047AB] dark:text-blue-400 shadow-sm' 
                                                : 'text-slate-500 dark:text-slate-400'
                                            }`}
                                        >
                                            <Euro className="w-3 h-3" /> Importe Fijo
                                        </button>
                                    </div>

                                    <div className="flex gap-4 items-center">
                                        <div className="relative flex-1">
                                            <input 
                                                type="number" 
                                                value={advanceValue}
                                                onChange={(e) => setAdvanceValue(Number(e.target.value))}
                                                className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-lg font-bold text-slate-900 dark:text-white pr-10"
                                                onFocus={(e) => e.target.select()}
                                            />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                                                {advanceType === 'percent' ? '%' : '€'}
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs text-slate-400 font-medium uppercase">A cobrar ahora</span>
                                            <span className="text-xl font-bold text-green-600 dark:text-green-400">
                                                {advanceType === 'percent' 
                                                    ? ((budgetToAccept.total * 1.21) * (advanceValue / 100)).toLocaleString(undefined, { maximumFractionDigits: 2 }) 
                                                    : advanceValue.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                                }€
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2 italic">Se generará automáticamente un ingreso en las finanzas del proyecto.</p>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button 
                                        onClick={() => setIsAcceptModalOpen(false)}
                                        className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 font-bold transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        onClick={handleConfirmAcceptance}
                                        disabled={isSaving}
                                        className="flex-1 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-bold shadow-lg shadow-green-200 dark:shadow-green-900/30 flex items-center justify-center gap-2 transition-colors"
                                    >
                                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        Confirmar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* DELETE BUDGET CONFIRMATION MODAL */}
                {budgetToDelete && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
                            <div className="p-6 text-center">
                                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertTriangle className="w-8 h-8" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                                    ¿Eliminar presupuesto?
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                                    Esta acción no se puede deshacer. Se eliminará el presupuesto permanentemente.
                                </p>
                                <div className="flex gap-3">
                                    <button 
                                        onClick={() => setBudgetToDelete(null)}
                                        className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        onClick={() => confirmDeleteBudget(budgetToDelete)}
                                        className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors"
                                    >
                                        Eliminar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 sticky top-20 z-20 transition-colors">
                <div className="flex items-center gap-5 w-full md:w-auto">
                    <button onClick={() => setView('list')} className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500 dark:text-slate-400 transition-colors">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                         <input 
                            value={currentBudget?.name} 
                            onChange={(e) => setCurrentBudget(currentBudget ? { ...currentBudget, name: e.target.value } : null)}
                            className="text-xl font-bold text-slate-900 dark:text-white border-none focus:ring-0 p-0 bg-transparent placeholder-slate-300 dark:placeholder-slate-600 w-full transition-colors"
                            placeholder="Nombre del Presupuesto"
                        />
                        <div className="flex items-center gap-3 mt-1">
                             <span className="text-xs font-bold text-slate-400 uppercase">Estado:</span>
                             <select 
                                value={currentBudget?.status}
                                onChange={(e) => setCurrentBudget(currentBudget ? { ...currentBudget, status: e.target.value as any } : null)}
                                className="text-xs bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 rounded p-1.5 outline-none font-medium text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                             >
                                <option value="Draft">Borrador</option>
                                <option value="Sent">Enviado</option>
                                <option value="Accepted">Aceptado</option>
                                <option value="Rejected">Rechazado</option>
                             </select>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-6 w-full md:w-auto justify-end">
                    <div className="text-right hidden sm:block">
                        <div className="text-xs text-slate-400 font-bold uppercase">Total Presupuesto</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">{currentBudget?.total.toLocaleString()}€</div>
                    </div>
                    <button 
                        onClick={handleSaveBudget} 
                        disabled={isSaving}
                        className="bg-green-600 text-white px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-green-700 shadow-lg shadow-green-200 dark:shadow-green-900/30 font-bold transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/50 p-6 rounded-2xl border border-blue-100 dark:border-slate-700 shadow-sm relative overflow-hidden transition-colors">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-200/20 dark:bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
                        <h3 className="text-sm font-bold text-[#0047AB] dark:text-blue-400 mb-4 flex items-center relative z-10">
                            <Wand2 className="w-4 h-4 mr-2" /> Herramientas de Cálculo
                        </h3>
                        <div className="flex flex-col gap-4 relative z-10">
                            <textarea 
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="Describe la instalación..."
                                className="w-full p-4 text-sm bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#0047AB] outline-none resize-none h-24 shadow-sm text-slate-700 dark:text-slate-200 transition-colors"
                            />
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none bg-white/50 dark:bg-slate-900/50 px-3 py-2 rounded-lg border border-transparent hover:border-blue-100 dark:hover:border-slate-600 transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={includeDocs}
                                        onChange={(e) => setIncludeDocs(e.target.checked)}
                                        className="rounded text-[#0047AB] focus:ring-[#0047AB]"
                                    />
                                    <Paperclip className="w-4 h-4 text-slate-400" />
                                    <span>Incluir documentos de la obra</span>
                                </label>
                                
                                <div className="flex gap-2 w-full sm:w-auto">
                                    {project.type === 'Elevator' && project.elevatorData && (
                                        <button
                                            onClick={handleApplyValidaTariff}
                                            className="bg-rose-600 text-white px-4 py-2.5 rounded-xl hover:bg-rose-700 transition-all flex items-center gap-2 font-semibold shadow-md shadow-rose-900/10 text-sm whitespace-nowrap"
                                            title={`Aplicar tarifa para ${project.elevatorData.solutionType} a ${project.elevatorData.distanceFromBase}km`}
                                        >
                                            <Calculator className="w-4 h-4" /> Calcular Válida
                                        </button>
                                    )}
                                    
                                    <button 
                                        onClick={handleGenerateAI}
                                        disabled={isGenerating || (!aiPrompt && !includeDocs)}
                                        className="bg-[#0047AB] text-white px-6 py-2.5 rounded-xl hover:bg-[#003380] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-semibold shadow-md shadow-blue-900/10 w-full sm:w-auto justify-center"
                                    >
                                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                        {isGenerating ? 'Calculando...' : 'Generar con IA'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 uppercase text-xs tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 font-bold w-1/2">Concepto</th>
                                    <th className="px-4 py-4 font-bold w-20 text-center">Ud</th>
                                    <th className="px-4 py-4 font-bold w-24 text-right">Cant.</th>
                                    <th className="px-4 py-4 font-bold w-24 text-right">Precio</th>
                                    <th className="px-4 py-4 font-bold w-32 text-right">Total</th>
                                    <th className="px-4 py-4 w-12"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                                {currentBudget?.items.map(item => (
                                    <tr key={item.id} className="group hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                        <td className="px-6 py-3 relative">
                                            <input 
                                                list={`price-options-${item.id}`}
                                                value={item.name} 
                                                onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                                                className="w-full bg-transparent border-none focus:ring-0 p-0 text-slate-900 dark:text-white font-medium placeholder-slate-300 dark:placeholder-slate-600 transition-colors"
                                                placeholder="Nombre concepto"
                                            />
                                            <datalist id={`price-options-${item.id}`}>
                                                {priceDatabase.map(p => (
                                                    <option key={p.id} value={p.name}>{p.price}€/{p.unit}</option>
                                                ))}
                                            </datalist>
                                            <input 
                                                value={item.category} 
                                                onChange={(e) => handleUpdateItem(item.id, 'category', e.target.value)}
                                                className="w-full bg-transparent border-none focus:ring-0 p-0 text-xs text-slate-400 dark:text-slate-500 mt-1"
                                                placeholder="Categoría"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <input 
                                                value={item.unit} 
                                                onChange={(e) => handleUpdateItem(item.id, 'unit', e.target.value)}
                                                className="w-full text-center bg-transparent border-none focus:ring-0 p-0 text-slate-500 dark:text-slate-400"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input 
                                                type="number" 
                                                value={item.quantity} 
                                                onChange={(e) => handleUpdateItem(item.id, 'quantity', Number(e.target.value))}
                                                className="w-full text-right bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-[#0047AB] focus:ring-0 p-1 font-mono text-slate-700 dark:text-slate-300"
                                                onFocus={(e) => e.target.select()}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input 
                                                type="number"
                                                step="0.01" 
                                                value={item.pricePerUnit} 
                                                onChange={(e) => handleUpdateItem(item.id, 'pricePerUnit', Number(e.target.value))}
                                                className="w-full text-right bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-[#0047AB] focus:ring-0 p-1 font-mono text-slate-700 dark:text-slate-300"
                                                onFocus={(e) => e.target.select()}
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                                            {((item.quantity || 0) * (item.pricePerUnit || 0)).toFixed(2)}€
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button onClick={() => handleDeleteItem(item.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/30">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="p-5 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30 flex gap-6 transition-colors">
                            <button onClick={() => handleAddItem()} className="text-[#0047AB] dark:text-blue-400 text-sm font-bold flex items-center hover:underline">
                                <Plus className="w-4 h-4 mr-2" /> Añadir línea vacía
                            </button>
                            <span className="text-slate-300 dark:text-slate-600">|</span>
                             <div className="relative group">
                                <button className="text-slate-600 dark:text-slate-400 text-sm font-medium flex items-center hover:text-slate-900 dark:hover:text-white transition-colors">
                                    <Database className="w-4 h-4 mr-2" /> Cargar de Base de Precios
                                </button>
                                <div className="absolute left-0 bottom-full mb-2 w-72 bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-100 dark:border-slate-600 hidden group-hover:block max-h-64 overflow-y-auto z-10 p-2">
                                     {priceDatabase.map(p => (
                                         <div 
                                            key={p.id} 
                                            onClick={() => handleAddItem(p)}
                                            className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-sm rounded-lg transition-colors"
                                         >
                                             <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{p.name}</div>
                                             <div className="text-slate-500 dark:text-slate-400 text-xs flex justify-between mt-1">
                                                <span>{p.category}</span>
                                                <span className="font-mono">{p.price}€ / {p.unit}</span>
                                             </div>
                                         </div>
                                     ))}
                                </div>
                             </div>
                        </div>
                    </div>
                    
                    <div className="flex justify-end pt-6 border-t border-slate-200 dark:border-slate-700">
                        <div className="w-72 space-y-3">
                             <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400 font-medium">
                                 <span>Base Imponible</span>
                                 <span>{currentBudget?.total.toLocaleString()}€</span>
                             </div>
                             <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400 font-medium">
                                 <span>IVA (21%)</span>
                                 <span>{((currentBudget?.total || 0) * 0.21).toLocaleString(undefined, { maximumFractionDigits: 2 })}€</span>
                             </div>
                             <div className="flex justify-between font-extrabold text-2xl text-slate-900 dark:text-white pt-4 border-t border-slate-200 dark:border-slate-700">
                                 <span>TOTAL</span>
                                 <span>{((currentBudget?.total || 0) * 1.21).toLocaleString(undefined, { maximumFractionDigits: 2 })}€</span>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BudgetManager;