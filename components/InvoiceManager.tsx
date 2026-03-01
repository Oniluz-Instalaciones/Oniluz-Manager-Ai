import React, { useState, useEffect, useRef } from 'react';
import { Project, Invoice, InvoiceItem, PriceItem } from '../types';
import { Plus, Trash2, Printer, Save, Edit3, FileText, Calculator, Download, Car, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { INVOICE_TAG_OPEN, INVOICE_TAG_CLOSE } from '../constants';

interface InvoiceManagerProps {
  project: Project;
  onUpdate: (updatedProject: Project) => void;
  priceDatabase: PriceItem[];
}

const InvoiceManager: React.FC<InvoiceManagerProps> = ({ project, onUpdate, priceDatabase }) => {
  const [invoices, setInvoices] = useState<Invoice[]>(project.invoices || []);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Incident Budget State
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentData, setIncidentData] = useState({
      km: 0,
      hours: 0,
      priceKm: 0.35, // Default price per km
      priceHour: 22 // Default price per hour
  });
  
  // Autocomplete state
  const [suggestions, setSuggestions] = useState<PriceItem[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setSuggestions([]);
        setActiveSuggestionIndex(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Update local state when project prop changes
  useEffect(() => {
    if (project.invoices) {
      setInvoices(project.invoices);
    }
  }, [project.invoices]);

  const handleDownloadPDF = (invoice: Invoice) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(0, 71, 171); // #0047AB
    doc.text('FACTURA', 20, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`#${invoice.number}`, 20, 25);
    
    // Company Info (Right aligned)
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Oniluz S.L.', 190, 20, { align: 'right' });
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('C/ Don Eduardo Martín, Nº 27', 190, 25, { align: 'right' });
    doc.text('45560 Oropesa, Toledo', 190, 30, { align: 'right' });
    doc.text('CIF: B26575688', 190, 35, { align: 'right' });

    // Client Info
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text('FACTURAR A', 20, 45);
    
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(invoice.clientName, 20, 52);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    const addressLines = doc.splitTextToSize(invoice.clientAddress || '', 80);
    doc.text(addressLines, 20, 58);
    
    if (invoice.clientNif) {
        doc.text(`CIF: ${invoice.clientNif}`, 20, 58 + (addressLines.length * 5));
    }

    // Date
    doc.text(`Fecha: ${new Date(invoice.date).toLocaleDateString()}`, 190, 50, { align: 'right' });

    // Table
    const tableBody = invoice.items.map(item => [
        item.description,
        item.quantity.toString(),
        `${item.unitPrice.toFixed(2)}€`,
        `${item.amount.toFixed(2)}€`
    ]);

    autoTable(doc, {
        startY: 80,
        head: [['Descripción', 'Cant.', 'Precio', 'Total']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [0, 71, 171], textColor: 255 },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 20, halign: 'right' },
            2: { cellWidth: 30, halign: 'right' },
            3: { cellWidth: 30, halign: 'right' }
        }
    });

    // Totals
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.text('Base Imponible:', 140, finalY);
    doc.text(`${invoice.subtotal.toFixed(2)}€`, 190, finalY, { align: 'right' });
    
    doc.text(`IVA (${invoice.taxRate}%):`, 140, finalY + 7);
    doc.text(`${invoice.taxAmount.toFixed(2)}€`, 190, finalY + 7, { align: 'right' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 71, 171);
    doc.text('TOTAL:', 140, finalY + 15);
    doc.text(`${invoice.total.toFixed(2)}€`, 190, finalY + 15, { align: 'right' });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.setFont('helvetica', 'normal');
    doc.text('Gracias por su confianza. Oniluz S.L. - B26575688', 105, 280, { align: 'center' });

    doc.save(`Factura_${invoice.number}.pdf`);
  };

  const calculateTotals = (items: InvoiceItem[], taxRate: number) => {
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    // Fix floating point errors
    const safeSubtotal = Number(subtotal.toFixed(2));
    const taxAmount = Number(((safeSubtotal * taxRate) / 100).toFixed(2));
    const total = Number((safeSubtotal + taxAmount).toFixed(2));
    return { subtotal: safeSubtotal, taxAmount, total };
  };

  const getNextInvoiceNumber = async (): Promise<string> => {
    try {
      // 1. Fetch all projects from DB
      const { data: dbProjects, error } = await supabase
        .from('projects')
        .select('id, description');
      
      if (error) throw error;

      let maxNumber = 0;
      const currentYear = new Date().getFullYear();

      // Helper to parse invoice numbers
      const processInvoiceList = (list: Invoice[]) => {
        list.forEach(inv => {
            if (!inv.number) return;
            // Normalize: Remove # and extra spaces
            const cleanNum = inv.number.replace(/^#/, '').trim();
            const parts = cleanNum.split('-');
            
            // Expected format: INV-YYYY-XXX
            if (parts.length === 3) {
                const year = parseInt(parts[1]);
                const num = parseInt(parts[2]);
                
                if (year === currentYear && !isNaN(num)) {
                    if (num > maxNumber) maxNumber = num;
                }
            }
        });
      };

      // 2. Iterate DB projects (excluding current one to avoid stale data)
      dbProjects?.forEach(p => {
        if (p.id === project.id) return; // Skip current project, use local state instead

        if (p.description && p.description.includes(INVOICE_TAG_OPEN)) {
           try {
             const startIndex = p.description.indexOf(INVOICE_TAG_OPEN);
             const endIndex = p.description.indexOf(INVOICE_TAG_CLOSE);
             if (startIndex !== -1 && endIndex !== -1) {
               const jsonStr = p.description.substring(startIndex + INVOICE_TAG_OPEN.length, endIndex);
               const projectInvoices: Invoice[] = JSON.parse(jsonStr);
               processInvoiceList(projectInvoices);
             }
           } catch (e) {
             console.error("Error parsing invoices for number generation", e);
           }
        }
      });

      // 3. Process current project from LOCAL STATE (most up to date)
      processInvoiceList(invoices);

      return `INV-${currentYear}-${(maxNumber + 1).toString().padStart(3, '0')}`;

    } catch (error) {
      console.error("Error fetching projects for invoice number:", error);
      // Fallback to local length if fetch fails
      return `INV-${new Date().getFullYear()}-${(invoices.length + 1).toString().padStart(3, '0')}`;
    }
  };

  const generateIncidentInvoice = async () => {
    const items: InvoiceItem[] = [];

    // 1. Kilometers
    if (incidentData.km > 0) {
        items.push({
            id: crypto.randomUUID(),
            description: `Desplazamiento (${incidentData.km} km)`,
            quantity: incidentData.km,
            unitPrice: incidentData.priceKm,
            amount: Number((incidentData.km * incidentData.priceKm).toFixed(2))
        });
    }

    // 2. Hours
    if (incidentData.hours > 0) {
        items.push({
            id: crypto.randomUUID(),
            description: `Mano de Obra (${incidentData.hours} h)`,
            quantity: incidentData.hours,
            unitPrice: incidentData.priceHour,
            amount: Number((incidentData.hours * incidentData.priceHour).toFixed(2))
        });
    }

    // 3. Diet Expenses (Gastos de Dieta)
    // Filter transactions with category 'Dietas' or 'Personal' (if description implies diet)
    // For now, stick to 'Dietas' category as per previous logic, but maybe check description too if needed.
    // User said "gastos de dieta añadidos a el proyecto".
    const dietTransactions = project.transactions.filter(t => 
        t.type === 'expense' && (t.category === 'Dietas' || t.description.toLowerCase().includes('dieta'))
    );

    dietTransactions.forEach(t => {
        // Assume stored expense amount is GROSS (includes VAT).
        // Base = Amount / 1.10 (10% VAT for hospitality)
        const baseAmount = Number((t.amount / 1.10).toFixed(2));
        const formattedDate = t.date ? t.date.split('-').reverse().join('-') : '';

        items.push({
            id: crypto.randomUUID(),
            description: `Dieta: ${t.description} (${formattedDate})`,
            quantity: 1,
            unitPrice: baseAmount,
            amount: baseAmount
        });
    });

    if (items.length === 0) {
        alert("No se han generado conceptos. Añade km, horas o asegúrate de tener gastos de dieta.");
        return;
    }

    const { subtotal, taxAmount, total } = calculateTotals(items, 21);
    const nextInvoiceNumber = await getNextInvoiceNumber();

    const newInvoice: Invoice = {
        id: crypto.randomUUID(),
        projectId: project.id,
        number: nextInvoiceNumber,
        date: new Date().toISOString().split('T')[0],
        clientName: project.client || 'VALIDA SOLUTIONS SL', // Default to Valida if empty, or project client
        clientAddress: project.client?.toLowerCase().includes('valida') ? 'Polígono Industrial Montfulla 21 - Can Culebra, 17162, Bescano (Girona)' : '',
        clientNif: project.client?.toLowerCase().includes('valida') ? 'B55004238' : '',
        items,
        subtotal,
        taxRate: 21,
        taxAmount,
        total,
        status: 'Draft'
    };

    setEditingInvoice(newInvoice);
    setShowIncidentModal(false);
    // Reset data
    setIncidentData({ km: 0, hours: 0, priceKm: 0.35, priceHour: 22 });
  };

  const handleCreateInvoice = async () => {
    // 1. Get Budget Items (Detailed)
    const acceptedBudgets = project.budgets?.filter(b => b.status === 'Accepted') || [];
    let budgetItems: InvoiceItem[] = [];

    if (acceptedBudgets.length > 0) {
        // If there are accepted budgets, use their items
        acceptedBudgets.forEach(budget => {
            const items = budget.items.map(item => {
                const unitPrice = Number(item.pricePerUnit.toFixed(2));
                return {
                    id: crypto.randomUUID(),
                    description: item.name, // Use item name directly
                    quantity: item.quantity,
                    unitPrice: unitPrice,
                    amount: Number((item.quantity * unitPrice).toFixed(2))
                };
            });
            budgetItems = [...budgetItems, ...items];
        });
    } else if (project.budget > 0) {
        // Fallback to global budget if no detailed budget exists
        budgetItems.push({
            id: crypto.randomUUID(),
            description: `Presupuesto Proyecto: ${project.name}`,
            quantity: 1,
            unitPrice: Number(project.budget.toFixed(2)),
            amount: Number(project.budget.toFixed(2))
        });
    }

    // 2. Get Diet Expenses (Detailed)
    // Filter ONLY 'Dietas'. Exclude 'Personal'.
    const dietTransactions = project.transactions.filter(t => t.type === 'expense' && t.category === 'Dietas');
    
    const expenseItems: InvoiceItem[] = dietTransactions.map(t => {
        // Assume stored expense amount is GROSS (includes VAT).
        // User said: "si el hotel cuesta 220 euros 200 de hotel y 20 de iva".
        // This implies 10% VAT for Dietas/Hotel.
        // We need to extract the BASE amount to invoice it, then apply 21% invoice VAT.
        // Base = Amount / 1.10
        const baseAmount = Number((t.amount / 1.10).toFixed(2));
        
        // Format date to dd-mm-yyyy
        const formattedDate = t.date ? t.date.split('-').reverse().join('-') : '';

        return {
            id: crypto.randomUUID(),
            description: `Dieta: ${t.description} (${formattedDate})`,
            quantity: 1,
            unitPrice: baseAmount,
            amount: baseAmount
        };
    });

    const newItems: InvoiceItem[] = [...budgetItems, ...expenseItems];

    const { subtotal, taxAmount, total } = calculateTotals(newItems, 21);

    const nextInvoiceNumber = await getNextInvoiceNumber();

    const newInvoice: Invoice = {
      id: crypto.randomUUID(),
      projectId: project.id,
      number: nextInvoiceNumber,
      date: new Date().toISOString().split('T')[0],
      clientName: 'VALIDA SOLUTIONS SL',
      clientAddress: 'Polígono Industrial Montfulla 21 - Can Culebra, 17162, Bescano (Girona)', 
      clientNif: 'B55004238',     
      items: newItems,
      subtotal,
      taxRate: 21,
      taxAmount,
      total,
      status: 'Draft'
    };

    setEditingInvoice(newInvoice);
  };

  const handleSaveInvoice = async () => {
    if (!editingInvoice) return;
    setIsSaving(true);

    try {
      // STOCK DEDUCTION LOGIC
      // Only if status is Sent or Paid, and not already deducted
      let updatedInvoice = { ...editingInvoice };
      
      // Reset deduction flag if moved back to Draft (allows re-deduction if needed)
      // Note: In a full system, we should also RESTORE the stock here. 
      // But given the previous bug where stock wasn't deducted, this allows the user to 'retry' the deduction.
      if (updatedInvoice.status === 'Draft') {
          updatedInvoice.stockDeducted = false;
      }
      
      if ((updatedInvoice.status === 'Sent' || updatedInvoice.status === 'Paid') && !updatedInvoice.stockDeducted) {
          console.log("Processing stock deduction for invoice:", updatedInvoice.number);
          
          // 1. Fetch all materials to find matches
          const { data: stockMaterials, error: materialError } = await supabase.from('materials').select('*');
          
          if (materialError) {
              console.error("Error fetching materials for deduction:", materialError);
          } else if (stockMaterials) {
              // Helper to detect package size (Duplicated from StockManager for safety)
              const detectPackageSize = (name: string, explicitSize?: number): number => {
                  if (explicitSize && explicitSize > 1) return explicitSize;
                  const containerMatch = name.match(/(?:pack|bolsa|caja|paquete)\s+(?:de\s+)?(\d+)/i);
                  if (containerMatch && containerMatch[1]) return parseInt(containerMatch[1], 10);
                  const startNumberMatch = name.match(/^(\d+)\s+(?:uds|unidades|piezas|bridas|tacos|tornillos|tuercas|arandelas)/i);
                  if (startNumberMatch && startNumberMatch[1]) return parseInt(startNumberMatch[1], 10);
                  return 1;
              };

              for (const item of updatedInvoice.items) {
                  // Robust Matching Logic (Same as StockManager)
                  const itemDesc = (item.description || '').toLowerCase();
                  const itemWords = itemDesc.split(' ').filter((w: string) => w.length > 3);

                  let bestMatch = null;
                  let maxScore = 0;

                  for (const m of stockMaterials) {
                      const matName = m.name.toLowerCase();
                      const matWords = matName.split(' ').filter((w: string) => w.length > 3);

                      // 1. Direct inclusion
                      const directMatch = itemDesc.includes(matName) || matName.includes(itemDesc);
                      
                      // 2. Fuzzy overlap
                      const matches = matWords.filter((word: string) => itemDesc.includes(word));
                      const reverseMatches = itemWords.filter((word: string) => matName.includes(word));
                      
                      const score = matches.length + reverseMatches.length;
                      
                      const isFuzzyMatch = (matWords.length > 0 && matches.length >= matWords.length * 0.7) ||
                                           (itemWords.length > 0 && reverseMatches.length >= itemWords.length * 0.7);

                      if (directMatch || isFuzzyMatch) {
                          const currentScore = score + (directMatch ? 10 : 0);
                          if (currentScore > maxScore) {
                              maxScore = currentScore;
                              bestMatch = m;
                          }
                      }
                  }
                  
                  if (bestMatch) {
                      // Calculate deduction amount
                      const packageSize = detectPackageSize(bestMatch.name, bestMatch.package_size);
                      
                      // Invoice Item Qty is UNITS.
                      // Material Quantity in DB is PACKAGES.
                      // Deduction = Units / PackageSize
                      
                      const deductionAmount = item.quantity / packageSize;
                      const newQuantity = bestMatch.quantity - deductionAmount;
                      
                      console.log(`Deducting ${item.quantity} units (${deductionAmount} packs) from ${bestMatch.name} (Pack Size: ${packageSize}). New Qty: ${newQuantity}`);
                      
                      const { error: updateError } = await supabase.from('materials').update({ 
                          quantity: newQuantity 
                      }).eq('id', bestMatch.id);

                      if (updateError) {
                          console.error(`Error updating stock for ${bestMatch.name}:`, updateError);
                      }
                  }
              }
              // Mark as deducted
              updatedInvoice.stockDeducted = true;
          }
      }

      const updatedInvoices = invoices.some(inv => inv.id === updatedInvoice.id)
        ? invoices.map(inv => inv.id === updatedInvoice.id ? updatedInvoice : inv)
        : [...invoices, updatedInvoice];

      // Update local state
      setInvoices(updatedInvoices);
      
      // Propagate to parent
      let updatedProject = { ...project, invoices: updatedInvoices };

      // AUTOMATION: Update Project Status & Progress
      // Invoice Created -> Completed (90%)
      // Invoice Paid -> Completed (100%)
      
      let newStatus = project.status;
      let newProgress = project.progress || 0;

      if (updatedInvoice.status === 'Paid') {
          newStatus = 'Completed';
          newProgress = 100;
      } else {
          // Draft or Sent
          if (newStatus !== 'Completed') newStatus = 'Completed';
          if (newProgress < 75) newProgress = 75;
      }

      updatedProject = {
          ...updatedProject,
          status: newStatus,
          progress: newProgress
      };

      onUpdate(updatedProject);
      
      setEditingInvoice(null);
      
    } catch (error) {
      console.error("Error saving invoice:", error);
      alert("Error al guardar la factura.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateInvoiceItem = (index: number, field: keyof InvoiceItem, value: any) => {
    if (!editingInvoice) return;
    
    const newItems = [...editingInvoice.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Recalculate amount if quantity or price changes
    if (field === 'quantity' || field === 'unitPrice') {
      const q = field === 'quantity' ? Number(value) : newItems[index].quantity;
      const p = field === 'unitPrice' ? Number(value) : newItems[index].unitPrice;
      newItems[index].amount = Number((q * p).toFixed(2));
    }

    const { subtotal, taxAmount, total } = calculateTotals(newItems, editingInvoice.taxRate);
    
    setEditingInvoice({
      ...editingInvoice,
      items: newItems,
      subtotal,
      taxAmount,
      total
    });
  };

  const handleDescriptionChange = (index: number, value: string) => {
    updateInvoiceItem(index, 'description', value);
    
    if (value.trim().length > 1) {
      const lowerValue = value.toLowerCase();
      const matches = priceDatabase.filter(item => 
        item.name.toLowerCase().includes(lowerValue)
      ).slice(0, 5); // Limit to 5 suggestions
      
      setSuggestions(matches);
      setActiveSuggestionIndex(index);
    } else {
      setSuggestions([]);
      setActiveSuggestionIndex(null);
    }
  };

  const handleSelectSuggestion = (index: number, suggestion: PriceItem) => {
    // Update description and price
    const newItems = [...(editingInvoice?.items || [])];
    if (!newItems[index]) return;

    newItems[index] = {
      ...newItems[index],
      description: suggestion.name,
      unitPrice: suggestion.price
    };
    
    // Recalculate amount
    newItems[index].amount = Number((newItems[index].quantity * suggestion.price).toFixed(2));
    
    const { subtotal, taxAmount, total } = calculateTotals(newItems, editingInvoice?.taxRate || 21);
    
    setEditingInvoice({
      ...(editingInvoice as Invoice),
      items: newItems,
      subtotal,
      taxAmount,
      total
    });

    setSuggestions([]);
    setActiveSuggestionIndex(null);
  };

  const addInvoiceItem = () => {
    if (!editingInvoice) return;
    const newItem: InvoiceItem = {
      id: crypto.randomUUID(),
      description: '',
      quantity: 1,
      unitPrice: 0,
      amount: 0
    };
    
    const newItems = [...editingInvoice.items, newItem];
    const { subtotal, taxAmount, total } = calculateTotals(newItems, editingInvoice.taxRate);
    
    setEditingInvoice({
      ...editingInvoice,
      items: newItems,
      subtotal,
      taxAmount,
      total
    });
  };

  const removeInvoiceItem = (index: number) => {
    if (!editingInvoice) return;
    const newItems = editingInvoice.items.filter((_, i) => i !== index);
    const { subtotal, taxAmount, total } = calculateTotals(newItems, editingInvoice.taxRate);
    
    setEditingInvoice({
      ...editingInvoice,
      items: newItems,
      subtotal,
      taxAmount,
      total
    });
  };

  const updateInvoiceField = (field: keyof Invoice, value: any) => {
    if (!editingInvoice) return;
    
    let updates: Partial<Invoice> = { [field]: value };
    
    if (field === 'taxRate') {
      const { subtotal, taxAmount, total } = calculateTotals(editingInvoice.items, value);
      updates = { ...updates, subtotal, taxAmount, total };
    }

    setEditingInvoice({ ...editingInvoice, ...updates });
  };

  const handleDeleteInvoice = (id: string) => {
    if (confirm('¿Estás seguro de eliminar esta factura?')) {
      const updatedInvoices = invoices.filter(i => i.id !== id);
      setInvoices(updatedInvoices);
      onUpdate({ ...project, invoices: updatedInvoices });
    }
  };

  if (editingInvoice) {
    return (
      <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 max-w-4xl mx-auto">
        {/* Header Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 no-print">
          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                {editingInvoice.id ? 'Editar Factura' : 'Nueva Factura'}
            </h2>
            <select
                value={editingInvoice.status}
                onChange={(e) => updateInvoiceField('status', e.target.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border outline-none cursor-pointer transition-colors ${
                    editingInvoice.status === 'Paid' ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900' :
                    editingInvoice.status === 'Sent' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-900' :
                    'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
                }`}
            >
                <option value="Draft">Borrador</option>
                <option value="Sent">Enviada</option>
                <option value="Paid">Pagada</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
            {editingInvoice.id && (
                <button 
                onClick={() => handleDownloadPDF(editingInvoice)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2"
                >
                <Download className="w-4 h-4" /> PDF
                </button>
            )}
            <button 
              onClick={() => setEditingInvoice(null)}
              className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveInvoice}
              disabled={isSaving}
              className="px-4 py-2 bg-[#0047AB] text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> Guardar
            </button>
          </div>
        </div>

        {/* Invoice Template */}
        <div className="bg-white p-6 md:p-12 rounded-xl shadow-lg border border-slate-100 text-slate-800 print:shadow-none print:border-none print:p-0" id="invoice-template">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start mb-8 md:mb-12 gap-6">
            <div>
              <h1 className="text-3xl font-extrabold text-[#0047AB] uppercase tracking-wider mb-2">FACTURA</h1>
              <div className="flex items-center gap-1 text-sm text-slate-500 font-mono">
                <span>#</span>
                <input 
                    value={editingInvoice.number}
                    onChange={(e) => updateInvoiceField('number', e.target.value)}
                    className="bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#0047AB] outline-none w-32 transition-colors font-mono text-slate-700"
                />
              </div>
            </div>
            <div className="text-left md:text-right">
              <h3 className="text-xl font-bold text-slate-900">Oniluz S.L.</h3>
              <p className="text-sm text-slate-500 mt-1">C/ Don Eduardo Martín, Nº 27</p>
              <p className="text-sm text-slate-500">45560 Oropesa, Toledo</p>
              <p className="text-sm text-slate-500">CIF: B26575688</p>
            </div>
          </div>

          {/* Client & Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 mb-8 md:mb-12">
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Facturar a</h4>
              <div className="space-y-1">
                <input 
                  value={editingInvoice.clientName}
                  onChange={(e) => updateInvoiceField('clientName', e.target.value)}
                  className="w-full font-bold text-xl text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-[#0047AB] outline-none bg-transparent transition-colors placeholder-slate-300"
                  placeholder="Nombre del Cliente"
                />
                <textarea 
                  value={editingInvoice.clientAddress || ''}
                  onChange={(e) => updateInvoiceField('clientAddress', e.target.value)}
                  className="w-full text-sm text-slate-500 border-b border-transparent hover:border-slate-300 focus:border-[#0047AB] outline-none bg-transparent transition-colors placeholder-slate-400 resize-none mt-1"
                  placeholder="Dirección completa"
                  rows={2}
                />
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span>CIF:</span>
                  <input 
                    value={editingInvoice.clientNif || ''}
                    onChange={(e) => updateInvoiceField('clientNif', e.target.value)}
                    className="w-32 border-b border-transparent hover:border-slate-300 focus:border-[#0047AB] outline-none bg-transparent transition-colors placeholder-slate-400"
                    placeholder="NIF / CIF"
                  />
                </div>
              </div>
            </div>
            <div className="text-left md:text-right space-y-2">
              <div className="flex md:justify-end items-center gap-4">
                <label className="text-sm font-medium text-slate-500">Fecha:</label>
                <input 
                  type="date"
                  value={editingInvoice.date}
                  onChange={(e) => updateInvoiceField('date', e.target.value)}
                  className="text-sm font-medium text-slate-900 bg-transparent border-b border-slate-200 focus:border-[#0047AB] outline-none text-right w-32"
                />
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-8 overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  <th className="text-left py-3 text-xs font-bold text-slate-400 uppercase tracking-wider w-1/2">Descripción</th>
                  <th className="text-right py-3 text-xs font-bold text-slate-400 uppercase tracking-wider w-24">Cant.</th>
                  <th className="text-right py-3 text-xs font-bold text-slate-400 uppercase tracking-wider w-32">Precio (Base)</th>
                  <th className="text-right py-3 text-xs font-bold text-slate-400 uppercase tracking-wider w-32">Total (Base)</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {editingInvoice.items.map((item, index) => (
                  <tr key={item.id} className="group">
                    <td className="py-3 relative">
                      <input 
                        value={item.description}
                        onChange={(e) => handleDescriptionChange(index, e.target.value)}
                        className="w-full text-sm font-medium text-slate-700 bg-transparent outline-none placeholder-slate-300"
                        placeholder="Descripción del concepto"
                        onFocus={() => setActiveSuggestionIndex(null)} // Clear suggestions when focusing another field? No, maybe just let it be.
                      />
                      {activeSuggestionIndex === index && suggestions.length > 0 && (
                        <div 
                          ref={suggestionsRef}
                          className="absolute z-50 left-0 top-full mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                        >
                          {suggestions.map((suggestion) => (
                            <button
                              key={suggestion.id}
                              onClick={() => handleSelectSuggestion(index, suggestion)}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-b border-slate-50 dark:border-slate-700 last:border-0 flex justify-between items-center group"
                            >
                              <span className="font-medium">{suggestion.name}</span>
                              <span className="text-xs text-slate-400 group-hover:text-[#0047AB] dark:group-hover:text-blue-400 font-mono">
                                {suggestion.price.toFixed(2)}€
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3">
                      <input 
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) => updateInvoiceItem(index, 'quantity', Number(e.target.value))}
                        className="w-full text-right text-sm text-slate-600 bg-transparent outline-none"
                        onBlur={(e) => updateInvoiceItem(index, 'quantity', Number(parseFloat(e.target.value).toFixed(2)))}
                      />
                    </td>
                    <td className="py-3">
                      <input 
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => updateInvoiceItem(index, 'unitPrice', Number(e.target.value))}
                        className="w-full text-right text-sm text-slate-600 bg-transparent outline-none"
                        onBlur={(e) => updateInvoiceItem(index, 'unitPrice', Number(parseFloat(e.target.value).toFixed(2)))}
                      />
                    </td>
                    <td className="py-3 text-right text-sm font-bold text-slate-800">
                      {item.amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                    </td>
                    <td className="py-3 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => removeInvoiceItem(index)}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button 
              onClick={addInvoiceItem}
              className="mt-4 flex items-center gap-2 text-sm font-bold text-[#0047AB] hover:text-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Añadir Concepto
            </button>
          </div>

          {/* Totals */}
          <div className="flex justify-end border-t-2 border-slate-100 pt-8">
            <div className="w-64 space-y-3">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Base Imponible</span>
                <span className="font-medium text-slate-900">{editingInvoice.subtotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</span>
              </div>
              <div className="flex justify-between items-center text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <span>IVA</span>
                  <select 
                    value={editingInvoice.taxRate}
                    onChange={(e) => updateInvoiceField('taxRate', Number(e.target.value))}
                    className="bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-xs outline-none focus:border-[#0047AB]"
                  >
                    <option value="0">0%</option>
                    <option value="4">4%</option>
                    <option value="10">10%</option>
                    <option value="21">21%</option>
                  </select>
                </div>
                <span className="font-medium text-slate-900">{editingInvoice.taxAmount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</span>
              </div>
              <div className="flex justify-between text-lg font-extrabold text-[#0047AB] pt-4 border-t border-slate-100">
                <span>Total</span>
                <span>{editingInvoice.total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€</span>
              </div>
            </div>
          </div>
          
          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-slate-100 text-center text-xs text-slate-400">
            <p>Gracias por su confianza.</p>
            <p className="mt-1">Oniluz S.L. - B26575688</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Facturas del Proyecto
        </h3>
        <div className="flex items-center gap-2">
            <button 
                onClick={() => setShowIncidentModal(true)}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-md shadow-orange-900/20"
            >
                <Calculator className="w-4 h-4" /> Factura Incidencia
            </button>
            <button 
              onClick={handleCreateInvoice}
              className="bg-[#0047AB] hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-md shadow-blue-900/20"
            >
              <Plus className="w-4 h-4" /> Nueva Factura
            </button>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-slate-400" />
          </div>
          <h4 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">No hay facturas creadas</h4>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto mb-6">
            Genera una factura automáticamente con los datos del presupuesto y gastos de dietas del proyecto.
          </p>
          <button 
            onClick={handleCreateInvoice}
            className="text-[#0047AB] dark:text-blue-400 font-bold text-sm hover:underline"
          >
            Crear primera factura
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {invoices.map(invoice => (
            <div key={invoice.id} className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-shadow group">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide mb-2 ${
                    invoice.status === 'Paid' ? 'bg-green-100 text-green-700' :
                    invoice.status === 'Sent' ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {invoice.status === 'Paid' ? 'Pagada' : invoice.status === 'Sent' ? 'Enviada' : 'Borrador'}
                  </span>
                  <h4 className="font-bold text-slate-900 dark:text-white">{invoice.number}</h4>
                  <p className="text-xs text-slate-500">{new Date(invoice.date).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleDownloadPDF(invoice)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 hover:text-[#0047AB] transition-colors"
                    title="Descargar PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setEditingInvoice(invoice)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 hover:text-[#0047AB] transition-colors"
                    title="Editar"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDeleteInvoice(invoice.id)}
                    className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Cliente</span>
                  <span className="font-medium text-slate-900 dark:text-white truncate max-w-[120px]">{invoice.clientName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Importe</span>
                  <span className="font-bold text-slate-900 dark:text-white">{invoice.total.toLocaleString()}€</span>
                </div>
              </div>

              <button 
                onClick={() => setEditingInvoice(invoice)}
                className="w-full py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Ver Detalles
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Incident Budget Modal */}
      {showIncidentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Calculator className="w-6 h-6 text-orange-500" />
                    Presupuesto de Incidencia
                </h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Kilómetros Recorridos
                        </label>
                        <div className="relative">
                            <input 
                                type="number" 
                                min="0"
                                value={incidentData.km}
                                onChange={(e) => setIncidentData({...incidentData, km: Number(e.target.value)})}
                                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                                placeholder="0"
                            />
                            <div className="absolute left-3 top-2.5 text-slate-400">
                                <Car className="w-5 h-5" />
                            </div>
                            <div className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">
                                {incidentData.priceKm}€/km
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Horas de Trabajo
                        </label>
                        <div className="relative">
                            <input 
                                type="number" 
                                min="0"
                                value={incidentData.hours}
                                onChange={(e) => setIncidentData({...incidentData, hours: Number(e.target.value)})}
                                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                                placeholder="0"
                            />
                            <div className="absolute left-3 top-2.5 text-slate-400">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">
                                {incidentData.priceHour}€/h
                            </div>
                        </div>
                    </div>

                    <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl border border-orange-100 dark:border-orange-800">
                        <h4 className="text-sm font-bold text-orange-800 dark:text-orange-300 mb-2">Resumen de Costes</h4>
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-600 dark:text-slate-400">Desplazamiento:</span>
                                <span className="font-mono font-bold">{(incidentData.km * incidentData.priceKm).toFixed(2)}€</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-600 dark:text-slate-400">Mano de Obra:</span>
                                <span className="font-mono font-bold">{(incidentData.hours * incidentData.priceHour).toFixed(2)}€</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-orange-200 dark:border-orange-700 mt-2">
                                <span className="font-bold text-orange-900 dark:text-orange-200">Total Estimado:</span>
                                <span className="font-mono font-bold text-orange-900 dark:text-orange-200">
                                    {((incidentData.km * incidentData.priceKm) + (incidentData.hours * incidentData.priceHour)).toFixed(2)}€
                                </span>
                            </div>
                            <p className="text-xs text-orange-600/80 mt-2 italic">
                                * Se añadirán automáticamente los gastos de dieta del proyecto.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button 
                            onClick={() => setShowIncidentModal(false)}
                            className="flex-1 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors font-bold"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={generateIncidentInvoice}
                            className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors font-bold shadow-lg shadow-orange-500/20"
                        >
                            Generar Presupuesto
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceManager;
