import React, { useState, useEffect } from 'react';
import { Material, Project, Invoice, InventoryMovement } from '../types';
import { supabase } from '../lib/supabase';
import { Package, Search, Filter, ChevronDown, ChevronUp, History, AlertTriangle, ArrowDown, ArrowUp, Calendar, Building2, ArrowLeft } from 'lucide-react';

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

    // Helper to detect package size from name if not explicitly set
    const detectPackageSize = (name: string, explicitSize?: number): number => {
        if (explicitSize && explicitSize > 1) return explicitSize;
        
        // Regex to find patterns like "Bolsa 100", "Caja de 50", "Pack 10", "100 Bridas"
        // 1. "Pack/Bolsa/Caja [de] X"
        const containerMatch = name.match(/(?:pack|bolsa|caja|paquete)\s+(?:de\s+)?(\d+)/i);
        if (containerMatch && containerMatch[1]) return parseInt(containerMatch[1], 10);

        // 2. Starts with number followed by item name (e.g. "100 Bridas")
        // We look for a number at the start, followed by a space and a word
        const startNumberMatch = name.match(/^(\d+)\s+(?:uds|unidades|piezas|bridas|tacos|tornillos|tuercas|arandelas)/i);
        if (startNumberMatch && startNumberMatch[1]) return parseInt(startNumberMatch[1], 10);

        return 1;
    };

    const fetchMovements = async (material: Material) => {
        setLoadingMovements(true);
        try {
            const calculatedMovements: InventoryMovement[] = [];
            const packageSize = detectPackageSize(material.name, material.packageSize);

            // 1. IN: Initial Stock / Purchase (Creation)
            // Fetch Transactions (Expenses)
            const nameParts = material.name.split(' ').filter(p => p.length > 3);
            
            let query = supabase
                .from('transactions')
                .select('*')
                .eq('category', 'Material');
            
            if (material.projectId) {
                query = query.eq('project_id', material.projectId);
            }

            const { data: transactionsData } = await query;

            if (transactionsData) {
                transactionsData.forEach((tx: any) => {
                    const txDesc = tx.description.toLowerCase();
                    const matName = material.name.toLowerCase();
                    const matches = nameParts.filter(part => txDesc.includes(part.toLowerCase()));
                    const isMatch = txDesc.includes(matName) || (nameParts.length > 0 && matches.length >= nameParts.length * 0.7);

                    if (isMatch) {
                        // Try to extract quantity from description if possible, else default to current stock (fallback)
                        // This is an estimation for INs
                        calculatedMovements.push({
                            id: tx.id,
                            type: 'IN',
                            quantity: material.quantity * packageSize, // Show in units
                            date: tx.date,
                            description: `Compra: ${tx.description}`,
                            projectId: tx.project_id
                        });
                    }
                });
            }

            // Fallback IN
            if (calculatedMovements.length === 0 && material.createdAt) {
                 calculatedMovements.push({
                    id: `init-${material.id}`,
                    type: 'IN',
                    quantity: material.quantity * packageSize,
                    date: material.createdAt.split('T')[0],
                    description: "Alta en Inventario",
                    projectId: material.projectId
                });
            }

            // 2. OUT: Invoices (Consumption)
            const { data: invoicesData } = await supabase
                .from('invoices')
                .select('*, items:invoice_items(*)')
                .eq('status', 'Sent'); // Only finalized invoices
                
            if (invoicesData) {
                invoicesData.forEach((inv: any) => {
                    const items = inv.items || []; 
                    items.forEach((item: any) => {
                        // Robust Matching for Invoices (OUT)
                        const itemDesc = (item.description || '').toLowerCase();
                        const matName = material.name.toLowerCase();
                        
                        // 1. Direct inclusion (either way)
                        const directMatch = itemDesc.includes(matName) || matName.includes(itemDesc);
                        
                        // 2. Word overlap (Fuzzy)
                        const matWords = nameParts; // From previous step (words > 3 chars)
                        const itemWords = itemDesc.split(' ').filter((w: string) => w.length > 3);
                        
                        // Count how many material words appear in the invoice item description
                        const matches = matWords.filter(word => itemDesc.includes(word.toLowerCase()));
                        
                        // Reverse check: if invoice item has words and > 70% of them are found in material
                        const reverseMatches = itemWords.filter((word: string) => matName.includes(word));
                        
                        const isFuzzyMatch = (matWords.length > 0 && matches.length >= matWords.length * 0.7) ||
                                             (itemWords.length > 0 && reverseMatches.length >= itemWords.length * 0.7);

                        if (directMatch || isFuzzyMatch) {
                            calculatedMovements.push({
                                id: `inv-${inv.id}-${item.id || Math.random()}`,
                                type: 'OUT',
                                quantity: item.quantity, 
                                date: inv.date,
                                description: `Usado en ${inv.number} (${item.description})`, // Show item desc for clarity
                                projectId: inv.project_id,
                                invoiceId: inv.id
                            });
                        }
                    });
                });
            }

            // Sort by date DESC (Newest first)
            calculatedMovements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            // Calculate Running Balance (Backwards from Current Stock)
            let currentBalance = material.quantity * packageSize;
            
            const movementsWithBalance = calculatedMovements.map(mov => {
                const balanceAfter = currentBalance;
                
                // Update balance for the next iteration (which is the previous point in time)
                if (mov.type === 'OUT') {
                    currentBalance += mov.quantity; // Before consumption, we had more
                } else if (mov.type === 'IN') {
                    // For IN, we assume it added to the stock.
                    // But since our IN quantity is estimated, this might get wonky.
                    // For display purposes, let's just show the balance *after* this event as the anchor.
                    // If we rely on the loop,: Before purchase = Balance After - Purchase Qty.
                    currentBalance -= mov.quantity;
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
                            
                            // Calculate package size using helper if not explicit
                            const detectedSize = detectPackageSize(material.name, material.packageSize);
                            
                            // Calculate total units: if detectedSize > 1, total = quantity * detectedSize
                            const totalUnits = (detectedSize > 1) 
                                ? material.quantity * detectedSize 
                                : material.quantity;
                            
                            // Display unit
                            const displayUnit = (detectedSize > 1) 
                                ? 'uds' 
                                : material.unit;

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
                                                    {detectedSize > 1 && (
                                                        <span className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 font-bold whitespace-nowrap">
                                                            Contiene: {detectedSize} uds
                                                        </span>
                                                    )}
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
                                                <p className={`text-2xl font-extrabold ${isLowStock ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
                                                    {totalUnits} <span className="text-sm font-medium text-slate-400">{displayUnit}</span>
                                                </p>
                                                {detectedSize > 1 && (
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                        {material.quantity} {material.unit} x {detectedSize} uds
                                                    </p>
                                                )}
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
