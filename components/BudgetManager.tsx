import React, { useState } from 'react';
import { Budget, BudgetItem, Project, PriceItem } from '../types';
import { generateSmartBudget } from '../services/geminiService';
import { Plus, Trash2, Wand2, FileText, Save, ChevronLeft, ArrowRight, Loader2, Database, Paperclip, Check, X, Percent, Euro, MessageSquareQuote } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
    const [includeDocs, setIncludeDocs] = useState(false);

    // --- Accept Budget States ---
    const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
    const [budgetToAccept, setBudgetToAccept] = useState<Budget | null>(null);
    const [advanceType, setAdvanceType] = useState<'percent' | 'fixed'>('percent');
    const [advanceValue, setAdvanceValue] = useState<number>(50); // Default 50%

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
        // If the budget has a saved prompt, we can optionally pre-fill the AI box, 
        // but it's better to leave the generator clean and show the saved prompt in the header.
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
                        id: transactionId, // Optional if DB generates it, but good for local sync
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
            // Update Budget list
            const updatedBudgets = (project.budgets || []).map(b => 
                b.id === budgetToAccept.id ? { ...b, status: 'Accepted' as const } : b
            );
            
            // Create transaction object for local state update
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

            // Update End Date estimation logic (from previous code) if budget has labor
            // Logic moved to a helper or kept simple here:
            let newEndDate = project.endDate;
            const laborHours = budgetToAccept.items
                .filter(i => (i.unit.toLowerCase() === 'h' || i.name.toLowerCase().includes('hora') || i.category.toLowerCase().includes('mano')))
                .reduce((sum, item) => sum + item.quantity, 0);
            
            if (laborHours > 0) {
                const estimatedDays = Math.ceil(laborHours / 8);
                const startDate = new Date(project.startDate);
                const endDateObj = new Date(startDate);
                endDateObj.setDate(startDate.getDate() + estimatedDays + 2); // Buffer
                newEndDate = endDateObj.toISOString().split('T')[0];
            }

            // Final Update
            onUpdate({ 
                ...project, 
                budgets: updatedBudgets,
                transactions: updatedTransactions,
                endDate: newEndDate || project.endDate
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

    const handleGenerateAI = async () => {
        if (!aiPrompt.trim()) return;
        setIsGenerating(true);
        try {
            // Filter only images for analysis as Gemini Flash handles images best via base64
            const docImages = includeDocs ? (project.documents || []).filter(d => d.type === 'image').map(d => d.data) : [];

            // Combine project context with user prompt
            const contextPrompt = `Contexto del Proyecto: Nombre "${project.name}", Tipo "${project.type}", Ubicación "${project.location}".
            Solicitud del usuario: ${aiPrompt}`;

            // Pass the dynamic database and images to the AI service
            const items = await generateSmartBudget(contextPrompt, priceDatabase, docImages);
            
            if (items.length === 0) {
                alert("La IA no generó partidas. Intenta ser más específico en tu descripción.");
                return;
            }

            const enrichedItems: BudgetItem[] = items.map((item: any) => ({
                id: crypto.randomUUID(),
                name: item.name,
                unit: item.unit,
                quantity: item.quantity,
                pricePerUnit: item.pricePerUnit,
                category: item.category
            }));
            
            if (currentBudget) {
                const updatedItems = [...currentBudget.items, ...enrichedItems];
                // IMPORTANT: Save the AI Prompt into the budget object
                const updatedBudget = { 
                    ...currentBudget, 
                    items: updatedItems,
                    aiPrompt: aiPrompt 
                };
                updateBudgetTotals(updatedBudget);
            }
        } catch (error: any) {
            console.error("Critical Error generating AI budget:", error);
            alert("Error al generar presupuesto con IA. Consulta la consola para más detalles.");
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
        
        // Auto-complete logic if user types a name that exists in DB
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
            // 1. Upsert Budget (Header) - Now includes ai_prompt
            const { error: budgetError } = await supabase.from('budgets').upsert({
                id: currentBudget.id,
                project_id: project.id,
                name: currentBudget.name,
                date: currentBudget.date,
                status: currentBudget.status,
                total: currentBudget.total,
                ai_prompt: currentBudget.aiPrompt // Persist the prompt
            });

            if (budgetError) throw budgetError;

            // 2. Sync Items (Delete all + Insert new) - Cleanest strategy for full sync
            const { error: deleteError } = await supabase
                .from('budget_items')
                .delete()
                .eq('budget_id', currentBudget.id);
            
            if (deleteError) throw deleteError;

            if (currentBudget.items.length > 0) {
                const itemsToInsert = currentBudget.items.map(item => ({
                    budget_id: currentBudget.id,
                    name: item.name,
                    unit: item.unit,
                    quantity: item.quantity,
                    price_per_unit: item.pricePerUnit,
                    category: item.category
                }));

                const { error: insertError } = await supabase
                    .from('budget_items')
                    .insert(itemsToInsert);
                
                if (insertError) throw insertError;
            }

            // 3. Update Local State (Parent Project)
            const budgets = project.budgets || [];
            const existingIndex = budgets.findIndex(b => b.id === currentBudget.id);
            
            let updatedBudgets;
            if (existingIndex >= 0) {
                updatedBudgets = budgets.map((b, i) => i === existingIndex ? currentBudget : b);
            } else {
                updatedBudgets = [currentBudget, ...budgets];
            }

            onUpdate({ ...project, budgets: updatedBudgets });
            setView('list');

        } catch (error: any) {
            console.error("Error saving budget:", error);
            alert("Error guardando en la nube: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteBudget = async (id: string) => {
        if(!window.confirm("¿Eliminar este presupuesto permanentemente?")) return;
        
        try {
            const { error } = await supabase.from('budgets').delete().eq('id', id);
            if (error) throw error;

            const updatedBudgets = (project.budgets || []).filter(b => b.id !== id);
            onUpdate({ ...project, budgets: updatedBudgets });
        } catch (error) {
            console.error("Error deleting budget:", error);
            alert("No se pudo eliminar de la base de datos.");
        }
    }

    // --- Views ---

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
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 ml-12">Creado el {budget.date} • {budget.items.length} partidas</p>
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

                {/* Acceptance Modal */}
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
            </div>
        );
    }

    // --- Edit View ---

    return (
        <div className="space-y-6">
            {/* Toolbar */}
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
                {/* Main Content */}
                <div className="lg:col-span-4 space-y-6">
                    
                    {/* NEW SECTION: Saved AI Prompt Display */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-colors">
                        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <MessageSquareQuote className="w-4 h-4" /> Notas / Prompt Original
                        </h3>
                        <textarea
                            value={currentBudget?.aiPrompt || ''}
                            onChange={(e) => setCurrentBudget(currentBudget ? { ...currentBudget, aiPrompt: e.target.value } : null)}
                            placeholder="Aquí se guardará la instrucción dada a la IA o puedes escribir notas manuales sobre este presupuesto..."
                            className="w-full p-4 text-sm bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500 outline-none resize-none h-24 text-slate-700 dark:text-slate-300 transition-colors"
                        />
                    </div>

                    {/* AI Generator */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/50 p-6 rounded-2xl border border-blue-100 dark:border-slate-700 shadow-sm relative overflow-hidden transition-colors">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-200/20 dark:bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
                        <h3 className="text-sm font-bold text-[#0047AB] dark:text-blue-400 mb-4 flex items-center relative z-10">
                            <Wand2 className="w-4 h-4 mr-2" /> Generador Inteligente (Experto REBT)
                        </h3>
                        <div className="flex flex-col gap-4 relative z-10">
                            <textarea 
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="Describe la instalación (ej: Reforma integral piso 90m2 con aire acondicionado y cocina eléctrica)..."
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
                                <button 
                                    onClick={handleGenerateAI}
                                    disabled={isGenerating || (!aiPrompt && !includeDocs)}
                                    className="bg-[#0047AB] text-white px-6 py-2.5 rounded-xl hover:bg-[#003380] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-semibold shadow-md shadow-blue-900/10 w-full sm:w-auto justify-center"
                                >
                                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                    {isGenerating ? 'Calculando s/ Reglamento...' : 'Generar Partidas'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Items Table */}
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
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input 
                                                type="number"
                                                step="0.01" 
                                                value={item.pricePerUnit} 
                                                onChange={(e) => handleUpdateItem(item.id, 'pricePerUnit', Number(e.target.value))}
                                                className="w-full text-right bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-[#0047AB] focus:ring-0 p-1 font-mono text-slate-700 dark:text-slate-300"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                                            {(item.quantity * item.pricePerUnit).toFixed(2)}€
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
                                {/* Simple dropdown for selecting from DB directly */}
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
                    
                    {/* Summary Footer */}
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