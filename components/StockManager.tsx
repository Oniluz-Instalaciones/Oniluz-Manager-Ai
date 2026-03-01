import React, { useState, useEffect } from 'react';
import { Material, Project, Invoice, InventoryMovement } from '../types';
import { supabase } from '../lib/supabase';
import { Package, Search, Filter, ChevronDown, ChevronUp, History, AlertTriangle, ArrowDown, ArrowUp, Calendar, Building2, ArrowLeft, Trash2, RefreshCw } from 'lucide-react';
import { INVOICE_TAG_OPEN, INVOICE_TAG_CLOSE } from '../constants';

interface StockManagerProps {
    projects: Project[];
    onBack: () => void;
}

const StockManager: React.FC<StockManagerProps> = ({ projects, onBack }) => {
    const [materials, setMaterials] = useState<Material[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedMaterialId, setExpandedMaterialId] = useState<string | null>(null);
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    const [loadingMovements, setLoadingMovements] = useState(false);

    useEffect(() => {
        fetchMaterials();
    }, []);

    const fetchMaterials = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase.from('materials').select('*');
            if (error) throw error;
            
            // Map DB fields to Material type
            const mappedMaterials: Material[] = (data || []).map((m: any) => ({
                id: m.id,
                projectId: m.project_id,
                name: m.name,
                quantity: m.quantity,
                unit: m.unit,
                minStock: m.min_stock,
                pricePerUnit: m.price_per_unit,
                packageSize: m.package_size,
                movements: m.movements,
                createdAt: m.created_at // Assuming Supabase adds this automatically
            }));

            setMaterials(mappedMaterials);
        } catch (error) {
            console.error("Error fetching materials:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleRecalculateStock = async () => {
        if (!confirm("ATENCIÓN: Esta acción RECALCULARÁ todo el stock basándose en:\n\n1. Entradas: Historial de compras ('IN') existente.\n2. Salidas: Facturas enviadas/pagadas de todos los proyectos.\n\nSe borrarán las salidas manuales antiguas y se regenerarán según las facturas actuales.\n\n¿Desea continuar?")) {
            return;
        }

        setLoading(true);
        try {
            // 1. Fetch ALL materials (Global Stock) to ensure we have latest
            const { data: allMaterials, error: matError } = await supabase.from('materials').select('*');
            if (matError) throw matError;

            // 2. Process each material
            for (const mat of allMaterials) {
                let currentQty = 0;
                let newMovements: InventoryMovement[] = [];

                // A. Keep ONLY 'IN' movements (Purchases) from history
                // We assume 'IN' movements in the history are the "Source of Truth" for purchases.
                const purchaseMovements = (mat.movements || []).filter((m: any) => m.type === 'IN');
                
                newMovements = [...purchaseMovements];
                currentQty = newMovements.reduce((sum, m) => sum + m.quantity, 0);

                // B. Generate 'OUT' movements from Invoices
                // Iterate ALL projects to find invoices that used this material
                for (const proj of projects) {
                    const validInvoices = proj.invoices?.filter(inv => inv.status === 'Sent' || inv.status === 'Paid') || [];
                    
                    for (const inv of validInvoices) {
                        for (const item of inv.items) {
                            // Match by Name (Case Insensitive & Trimmed)
                            if (item.description.trim().toLowerCase() === mat.name.trim().toLowerCase()) {
                                const deductionQty = item.quantity;
                                currentQty -= deductionQty;

                                newMovements.push({
                                    id: crypto.randomUUID(),
                                    type: 'OUT',
                                    quantity: deductionQty,
                                    date: inv.date,
                                    description: `Factura: ${inv.number}`,
                                    projectId: proj.id,
                                    invoiceId: inv.id
                                });
                            }
                        }
                    }
                }

                // C. Update Material in DB
                // Sort movements by date DESC
                newMovements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                const { error: updateError } = await supabase
                    .from('materials')
                    .update({
                        quantity: currentQty,
                        movements: newMovements
                    })
                    .eq('id', mat.id);

                if (updateError) console.error(`Error updating ${mat.name}:`, updateError);
            }

            alert("Stock recalculado y sincronizado correctamente.");
            fetchMaterials(); // Refresh UI

        } catch (error: any) {
            console.error("Error recalculating stock:", error);
            alert("Error al recalcular stock: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchMovements = async (material: Material) => {
        setLoadingMovements(true);
        try {
            // Use the movements stored in the JSONB column
            let storedMovements: InventoryMovement[] = material.movements || [];
            
            // Calculate Net Movement from History
            let netHistory = 0;
            storedMovements.forEach(m => {
                if (m.type === 'IN') netHistory += m.quantity;
                else if (m.type === 'OUT') netHistory -= m.quantity;
            });

            // Check for discrepancy with Current Stock
            // Current Stock is the source of truth.
            // If History says 50 but Current is 100, we are missing +50 IN.
            // If History says 100 but Current is 80, we are missing -20 OUT (or +(-20) adjustment).
            
            const discrepancy = material.quantity - netHistory;

            if (Math.abs(discrepancy) > 0.001) {
                // Create a synthetic movement to bridge the gap
                const syntheticMovement: InventoryMovement = {
                    id: `legacy-${material.id}`,
                    type: discrepancy > 0 ? 'IN' : 'OUT',
                    quantity: Math.abs(discrepancy),
                    date: material.createdAt ? material.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
                    description: discrepancy > 0 ? "Stock Inicial / Legacy" : "Ajuste Negativo / Legacy",
                    projectId: material.projectId
                };
                // Prepend it so it appears as the "start" (conceptually)
                storedMovements = [syntheticMovement, ...storedMovements];
            }

            // Sort by date DESC (Newest first)
            storedMovements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            // Calculate Running Balance for display
            // We start from Current Stock and work backwards
            let runningBalance = material.quantity;
            
            const movementsWithBalance = storedMovements.map(mov => {
                const balanceAfter = runningBalance;
                
                // Reverse the operation to find balance BEFORE this movement
                if (mov.type === 'OUT') {
                    runningBalance += mov.quantity; // Before consumption, we had more
                } else if (mov.type === 'IN') {
                    runningBalance -= mov.quantity; // Before purchase, we had less
                }
                
                return { ...mov, balanceAfter };
            });

            setMovements(movementsWithBalance);

        } catch (error) {
            console.error("Error fetching movements:", error);
        } finally {
            setLoadingMovements(false);
        }
    };

    const handleExpand = (material: Material) => {
        if (expandedMaterialId === material.id) {
            setExpandedMaterialId(null);
        } else {
            setExpandedMaterialId(material.id);
            fetchMovements(material);
        }
    };

    const filteredMaterials = materials.filter(m => 
        m.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8 min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <button 
                        onClick={onBack}
                        className="flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white mb-2 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </button>
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
                        <Package className="w-8 h-8 text-[#0047AB] dark:text-blue-400" />
                        Gestión de Stock
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Control centralizado de inventario y trazabilidad de materiales.
                    </p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <button 
                        onClick={handleRecalculateStock}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/40 rounded-xl transition-colors text-sm font-bold"
                    >
                        <RefreshCw className="w-4 h-4" /> Recalcular Stock
                    </button>
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar material..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors shadow-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Stats Cards (Optional) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Referencias</h3>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{materials.length}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Valor Inventario</h3>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        {materials.reduce((sum, m) => sum + (m.quantity * m.pricePerUnit), 0).toLocaleString()}€
                    </p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Bajo Mínimos</h3>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {materials.filter(m => m.quantity <= m.minStock).length}
                    </p>
                </div>
            </div>

            {/* List */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                {loading ? (
                    <div className="p-12 flex justify-center text-slate-400">Cargando inventario...</div>
                ) : filteredMaterials.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">No se encontraron materiales.</div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {filteredMaterials.map(material => {
                            const isLowStock = material.quantity <= material.minStock;
                            const isExpanded = expandedMaterialId === material.id;
                            const project = projects.find(p => p.id === material.projectId);
                            
                            // Display directly from DB
                            const totalUnits = material.quantity;
                            const displayUnit = material.unit;

                            return (
                                <div key={material.id} className="group transition-colors">
                                    <div 
                                        className={`p-5 flex flex-col md:flex-row items-start md:items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 gap-4 ${isExpanded ? 'bg-slate-50 dark:bg-slate-700/50' : ''}`}
                                        onClick={() => handleExpand(material)}
                                    >
                                        <div className="flex items-center gap-4 w-full md:w-auto">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0 ${isLowStock ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-blue-50 dark:bg-blue-900/30 text-[#0047AB] dark:text-blue-400'}`}>
                                                <Package className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="font-bold text-slate-900 dark:text-white truncate pr-2">{material.name}</h3>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                                    <span>{material.pricePerUnit.toLocaleString()}€ / {material.unit}</span>
                                                    {project && (
                                                        <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]">
                                                            <Building2 className="w-3 h-3 flex-shrink-0" /> {project.name}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center justify-between w-full md:w-auto gap-6 pl-14 md:pl-0">
                                            <div className="text-left md:text-right">
                                                <p className={`text-2xl font-extrabold ${
                                                    totalUnits > 0 ? 'text-green-600 dark:text-green-400' :
                                                    totalUnits < 0 ? 'text-red-600 dark:text-red-400' :
                                                    'text-slate-300 dark:text-slate-600'
                                                }`}>
                                                    {totalUnits} <span className="text-sm font-medium text-slate-400">{displayUnit}</span>
                                                </p>
                                                {isLowStock && <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full mt-1 inline-block">Stock Bajo</span>}
                                            </div>
                                            {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                                        </div>
                                    </div>

                                    {/* Expanded Details */}
                                    {isExpanded && (
                                        <div className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 p-6 animate-in slide-in-from-top-2">
                                            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                <History className="w-4 h-4" /> Historial de Movimientos
                                            </h4>
                                            
                                            {loadingMovements ? (
                                                <div className="text-center py-4 text-slate-400 text-xs">Cargando movimientos...</div>
                                            ) : movements.length === 0 ? (
                                                <div className="text-center py-4 text-slate-400 text-xs italic">No hay movimientos registrados (facturas) para este material.</div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {movements.map((mov, idx) => {
                                                        const project = projects.find(p => p.id === mov.projectId);
                                                        return (
                                                            <div key={mov.id || idx} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 flex justify-between items-center shadow-sm">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`p-2 rounded-lg ${mov.type === 'IN' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
                                                                        {mov.type === 'IN' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{mov.description}</p>
                                                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {mov.date}</span>
                                                                            {project && (
                                                                                <span className="flex items-center gap-1 text-[#0047AB] dark:text-blue-400 font-medium">
                                                                                    <Building2 className="w-3 h-3" /> {project.name}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                    <div className="text-right">
                                                                        <span className={`text-sm font-bold block ${mov.type === 'IN' ? 'text-green-600' : 'text-orange-600'}`}>
                                                                            {mov.type === 'IN' ? '+' : '-'}{mov.quantity} {displayUnit}
                                                                        </span>
                                                                        {mov.balanceAfter !== undefined && (
                                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                                Stock: {mov.balanceAfter} {displayUnit}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StockManager;
