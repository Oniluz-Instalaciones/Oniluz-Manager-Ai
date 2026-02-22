import React, { useState, useEffect } from 'react';
import { Project, InvoiceData, InvoiceItem } from '../types';
import { FileText, Plus, Trash2, Save, Download, Calculator, Building2, User, Calendar } from 'lucide-react';
import { jsPDF } from "jspdf";

interface InvoiceManagerProps {
    project: Project;
    onUpdate: (project: Project) => void;
}

const COMPANY_DATA = {
    name: "ONILUZ",
    address: "C/ Ejemplo, 123, Madrid",
    nif: "B-12345678",
    phone: "+34 600 000 000",
    email: "info@oniluz.com"
};

const InvoiceManager: React.FC<InvoiceManagerProps> = ({ project, onUpdate }) => {
    const [company, setCompany] = useState(COMPANY_DATA);

    const [invoice, setInvoice] = useState<InvoiceData>({
        invoiceNumber: `FACT-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
        date: new Date().toISOString().split('T')[0],
        clientName: project.client || '',
        clientNif: '',
        clientAddress: project.location || '',
        items: [],
        notes: '',
        status: 'Draft'
    });

    const [isEditing, setIsEditing] = useState(false);

    // Initialize or Load Invoice
    useEffect(() => {
        if (project.invoiceData) {
            setInvoice(project.invoiceData);
        } else {
            // Auto-populate defaults
            const newItems: InvoiceItem[] = [];

            // 1. Budget
            const activeBudgetTotal = project.budgets?.filter(b => b.status === 'Accepted').reduce((sum, b) => sum + b.total, 0) || 0;
            const finalBudget = project.budget > 0 ? project.budget : activeBudgetTotal;
            
            if (finalBudget > 0) {
                newItems.push({
                    id: crypto.randomUUID(),
                    concept: `Presupuesto Proyecto: ${project.name}`,
                    quantity: 1,
                    price: finalBudget,
                    amount: finalBudget
                });
            }

            // 2. Dietas / Personal (Expenses)
            // User requested "gastos de dietas sin el iva". Assuming stored amounts are gross or net? 
            // Usually expenses are stored as total paid. If we invoice them, we re-invoice them.
            // Let's assume we sum them up.
            const dietExpenses = project.transactions
                .filter(t => t.type === 'expense' && (t.category === 'Dietas' || t.category === 'Personal'))
                .reduce((sum, t) => sum + t.amount, 0);

            if (dietExpenses > 0) {
                newItems.push({
                    id: crypto.randomUUID(),
                    concept: 'Gastos de Dietas y Personal',
                    quantity: 1,
                    price: dietExpenses,
                    amount: dietExpenses
                });
            }

            setInvoice(prev => ({
                ...prev,
                items: newItems
            }));
        }
    }, [project.id]); // Only re-run if project changes, not on every render

    const handleAddItem = () => {
        const newItem: InvoiceItem = {
            id: crypto.randomUUID(),
            concept: '',
            quantity: 1,
            price: 0,
            amount: 0
        };
        setInvoice(prev => ({ ...prev, items: [...prev.items, newItem] }));
    };

    const handleUpdateItem = (id: string, field: keyof InvoiceItem, value: any) => {
        setInvoice(prev => {
            const newItems = prev.items.map(item => {
                if (item.id === id) {
                    const updated = { ...item, [field]: value };
                    if (field === 'quantity' || field === 'price') {
                        updated.amount = Number(updated.quantity) * Number(updated.price);
                    }
                    return updated;
                }
                return item;
            });
            return { ...prev, items: newItems };
        });
    };

    const handleDeleteItem = (id: string) => {
        setInvoice(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
    };

    const calculateTotals = () => {
        const subtotal = invoice.items.reduce((sum, item) => sum + item.amount, 0);
        const vat = subtotal * 0.21;
        const total = subtotal + vat;
        return { subtotal, vat, total };
    };

    const { subtotal, vat, total } = calculateTotals();

    const handleSave = () => {
        const updatedProject = { ...project, invoiceData: invoice };
        onUpdate(updatedProject);
        alert("Factura guardada en el proyecto.");
    };

    const generatePDF = () => {
        const doc = new jsPDF();
        
        // Header
        doc.setFontSize(20);
        doc.setTextColor(0, 71, 171); // Oniluz Blue
        doc.text(company.name, 20, 20);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(company.address, 20, 26);
        doc.text(`NIF: ${company.nif}`, 20, 31);
        doc.text(`Email: ${company.email}`, 20, 36);

        // Invoice Info
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(`FACTURA: ${invoice.invoiceNumber}`, 140, 20);
        doc.setFontSize(10);
        doc.text(`Fecha: ${invoice.date}`, 140, 26);

        // Client Info
        doc.setFillColor(245, 247, 250);
        doc.rect(20, 45, 170, 25, 'F');
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Datos del Cliente:", 25, 52);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(invoice.clientName, 25, 58);
        doc.text(invoice.clientNif || 'NIF: -', 25, 63);
        doc.text(invoice.clientAddress, 100, 58);

        // Table Header
        let y = 80;
        doc.setFillColor(0, 71, 171);
        doc.setTextColor(255);
        doc.rect(20, y, 170, 8, 'F');
        doc.setFont("helvetica", "bold");
        doc.text("Concepto", 25, y + 5);
        doc.text("Cant.", 110, y + 5);
        doc.text("Precio", 130, y + 5);
        doc.text("Total", 160, y + 5);

        // Table Body
        y += 15;
        doc.setTextColor(0);
        doc.setFont("helvetica", "normal");
        
        invoice.items.forEach(item => {
            doc.text(item.concept, 25, y);
            doc.text(item.quantity.toString(), 115, y, { align: 'center' });
            doc.text(`${item.price.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`, 145, y, { align: 'right' });
            doc.text(`${item.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`, 185, y, { align: 'right' });
            y += 10;
        });

        // Totals
        y += 10;
        doc.line(110, y, 190, y);
        y += 10;
        
        doc.text("Base Imponible:", 130, y);
        doc.text(`${subtotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`, 185, y, { align: 'right' });
        y += 7;
        
        doc.text("IVA (21%):", 130, y);
        doc.text(`${vat.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`, 185, y, { align: 'right' });
        y += 10;
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("TOTAL:", 130, y);
        doc.text(`${total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`, 185, y, { align: 'right' });

        // Footer
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150);
        doc.text("Gracias por su confianza.", 105, 280, { align: 'center' });

        doc.save(`Factura_${invoice.invoiceNumber}.pdf`);
    };

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                {/* Header Actions */}
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText className="w-6 h-6 text-[#0047AB] dark:text-blue-400" /> Facturación
                    </h2>
                    <div className="flex gap-3">
                        <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                            <Save className="w-4 h-4" /> Guardar
                        </button>
                        <button onClick={generatePDF} className="flex items-center gap-2 px-4 py-2 bg-[#0047AB] text-white rounded-lg font-bold hover:bg-[#003380] transition-colors shadow-lg shadow-blue-900/20">
                            <Download className="w-4 h-4" /> Descargar PDF
                        </button>
                    </div>
                </div>

                {/* Invoice Header Form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                        <h3 className="font-bold text-slate-500 dark:text-slate-400 uppercase text-xs flex items-center gap-2"><Building2 className="w-4 h-4" /> Emisor (Nosotros)</h3>
                        <div className="space-y-3">
                            <input 
                                value={company.name} 
                                onChange={(e) => setCompany({...company, name: e.target.value})}
                                className="w-full bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-[#0047AB] outline-none py-1 font-bold text-lg text-slate-900 dark:text-white"
                            />
                            <input 
                                value={company.address} 
                                onChange={(e) => setCompany({...company, address: e.target.value})}
                                className="w-full bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-[#0047AB] outline-none py-1 text-sm text-slate-700 dark:text-slate-300"
                            />
                            <input 
                                value={company.nif} 
                                onChange={(e) => setCompany({...company, nif: e.target.value})}
                                className="w-full bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-[#0047AB] outline-none py-1 text-sm text-slate-700 dark:text-slate-300"
                            />
                            <input 
                                value={company.email} 
                                onChange={(e) => setCompany({...company, email: e.target.value})}
                                className="w-full bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-[#0047AB] outline-none py-1 text-sm text-slate-700 dark:text-slate-300"
                            />
                        </div>
                    </div>

                    <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                        <h3 className="font-bold text-slate-500 dark:text-slate-400 uppercase text-xs flex items-center gap-2"><User className="w-4 h-4" /> Cliente</h3>
                        <div className="space-y-3">
                            <input 
                                value={invoice.clientName} 
                                onChange={(e) => setInvoice({...invoice, clientName: e.target.value})}
                                placeholder="Nombre del Cliente"
                                className="w-full bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-[#0047AB] outline-none py-1 font-bold text-slate-900 dark:text-white"
                            />
                            <input 
                                value={invoice.clientNif} 
                                onChange={(e) => setInvoice({...invoice, clientNif: e.target.value})}
                                placeholder="NIF / CIF"
                                className="w-full bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-[#0047AB] outline-none py-1 text-sm text-slate-700 dark:text-slate-300"
                            />
                            <input 
                                value={invoice.clientAddress} 
                                onChange={(e) => setInvoice({...invoice, clientAddress: e.target.value})}
                                placeholder="Dirección"
                                className="w-full bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-[#0047AB] outline-none py-1 text-sm text-slate-700 dark:text-slate-300"
                            />
                        </div>
                    </div>
                </div>

                {/* Invoice Meta */}
                <div className="flex gap-6 mb-8">
                    <div className="flex-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Número de Factura</label>
                        <input 
                            value={invoice.invoiceNumber} 
                            onChange={(e) => setInvoice({...invoice, invoiceNumber: e.target.value})}
                            className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0047AB]"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Fecha</label>
                        <input 
                            type="date"
                            value={invoice.date} 
                            onChange={(e) => setInvoice({...invoice, date: e.target.value})}
                            className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0047AB]"
                        />
                    </div>
                </div>

                {/* Items Table */}
                <div className="mb-8 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-xs">
                            <tr>
                                <th className="p-4">Concepto</th>
                                <th className="p-4 w-24 text-center">Cant.</th>
                                <th className="p-4 w-32 text-right">Precio U.</th>
                                <th className="p-4 w-32 text-right">Total</th>
                                <th className="p-4 w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {invoice.items.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="p-4">
                                        <input 
                                            value={item.concept} 
                                            onChange={(e) => handleUpdateItem(item.id, 'concept', e.target.value)}
                                            className="w-full bg-transparent outline-none font-medium text-slate-900 dark:text-white placeholder-slate-400"
                                            placeholder="Descripción del concepto"
                                        />
                                    </td>
                                    <td className="p-4">
                                        <input 
                                            type="number"
                                            value={item.quantity} 
                                            onChange={(e) => handleUpdateItem(item.id, 'quantity', Number(e.target.value))}
                                            className="w-full bg-transparent outline-none text-center text-slate-700 dark:text-slate-300"
                                        />
                                    </td>
                                    <td className="p-4">
                                        <input 
                                            type="number"
                                            step="0.01"
                                            value={item.price} 
                                            onChange={(e) => handleUpdateItem(item.id, 'price', Number(e.target.value))}
                                            className="w-full bg-transparent outline-none text-right text-slate-700 dark:text-slate-300"
                                        />
                                    </td>
                                    <td className="p-4 text-right font-bold text-slate-900 dark:text-white">
                                        {item.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                                    </td>
                                    <td className="p-4 text-center">
                                        <button onClick={() => handleDeleteItem(item.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="p-2 bg-slate-50 dark:bg-slate-900/30 border-t border-slate-200 dark:border-slate-700">
                        <button onClick={handleAddItem} className="w-full py-2 flex items-center justify-center gap-2 text-[#0047AB] dark:text-blue-400 font-bold text-sm hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors">
                            <Plus className="w-4 h-4" /> Añadir Línea
                        </button>
                    </div>
                </div>

                {/* Totals */}
                <div className="flex justify-end">
                    <div className="w-full max-w-xs space-y-3 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                            <span>Base Imponible</span>
                            <span className="font-medium">{subtotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                            <span>IVA (21%)</span>
                            <span className="font-medium">{vat.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                        </div>
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <span className="font-bold text-lg text-slate-900 dark:text-white">TOTAL</span>
                            <span className="font-bold text-xl text-[#0047AB] dark:text-blue-400">{total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvoiceManager;
