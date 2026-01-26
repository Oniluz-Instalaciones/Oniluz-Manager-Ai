import React, { useState, useRef } from 'react';
import { PriceItem } from '../types';
import { ArrowLeft, Search, Plus, Trash2, Wand2, Loader2, Database, X, ImageIcon, AlertCircle, ArrowRight, CheckCircle, Percent, RefreshCw, Download, Tag, Edit3 } from 'lucide-react';
import { parseMaterialsFromInput, parseMaterialsFromImage } from '../services/geminiService';

interface PriceDatabaseProps {
  items: PriceItem[];
  onAdd: (item: PriceItem) => Promise<void>;
  onEdit: (item: PriceItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBulkAdd: (items: PriceItem[]) => Promise<void>;
  onBack: () => void;
}

interface ConflictItem {
    existing: PriceItem;
    incoming: PriceItem;
    selected: 'existing' | 'incoming';
}

const PriceDatabase: React.FC<PriceDatabaseProps> = ({ items, onAdd, onEdit, onDelete, onBulkAdd, onBack }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [aiInput, setAiInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PriceItem | null>(null);
  
  // States for Conflict Resolution
  const [conflictItems, setConflictItems] = useState<ConflictItem[]>([]);
  const [cleanItems, setCleanItems] = useState<PriceItem[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper for fuzzy-ish matching
  const normalizeString = (str: string) => {
      return str
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
        .replace(/[^a-z0-9]/g, "") 
        .trim();
  };

  // Improved search logic: Filter by words (tokens)
  const filteredItems = items.filter(item => {
      const searchLower = searchTerm.toLowerCase().trim();
      if (!searchLower) return true;

      const tokens = searchLower.split(/\s+/);
      const itemText = `${item.name} ${item.category} ${item.unit}`.toLowerCase();

      return tokens.every(token => itemText.includes(token));
  });

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Eliminar este artículo permanentemente?')) {
      await onDelete(id);
    }
  };

  const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    try {
        const formData = new FormData(e.currentTarget);
        const newItem: PriceItem = {
          id: editingItem?.id && editingItem.id !== '' ? editingItem.id : crypto.randomUUID(),
          name: formData.get('name') as string,
          unit: formData.get('unit') as string,
          price: Number(formData.get('price')),
          category: formData.get('category') as string,
          discount: Number(formData.get('discount')) || undefined
        };

        if (editingItem && editingItem.id) {
          await onEdit(newItem);
        } else {
          await onAdd(newItem);
        }
        setEditingItem(null);
    } catch (e) {
        console.error(e);
        alert("Error al guardar");
    } finally {
        setIsSaving(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onloadend = () => {
              setSelectedImage(reader.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  const handleAiImport = async () => {
    if (!aiInput.trim() && !selectedImage) return;
    setIsProcessingAI(true);
    try {
      let importedItems: PriceItem[] = [];
      
      if (selectedImage) {
          const imageItems = await parseMaterialsFromImage(selectedImage);
          importedItems = [...importedItems, ...imageItems];
      }
      
      if (aiInput.trim()) {
          const textItems = await parseMaterialsFromInput(aiInput);
          importedItems = [...importedItems, ...textItems];
      }

      if (importedItems.length === 0) {
          alert("No se encontraron artículos válidos.");
          setIsProcessingAI(false);
          return;
      }

      const conflicts: ConflictItem[] = [];
      const safeItems: PriceItem[] = [];

      importedItems.forEach(newItem => {
          const normalizedNew = normalizeString(newItem.name);
          
          const existingMatch = items.find(dbItem => 
              normalizeString(dbItem.name) === normalizedNew
          );

          // Prepare Item
          const preparedItem = {
              ...newItem,
              id: crypto.randomUUID(),
              discount: newItem.discount && newItem.discount > 0 ? newItem.discount : undefined 
          };

          if (existingMatch) {
              conflicts.push({
                  existing: existingMatch,
                  incoming: preparedItem,
                  selected: 'existing' // Default to existing
              });
          } else {
              safeItems.push(preparedItem);
          }
      });

      setCleanItems(safeItems);
      setConflictItems(conflicts);

      if (conflicts.length > 0) {
          setShowConflictModal(true);
          setShowAiModal(false); 
      } else {
          if (safeItems.length > 0) {
              await onBulkAdd(safeItems);
              alert(`Se han importado ${safeItems.length} artículos correctamente.`);
          }
          setAiInput('');
          setSelectedImage(null);
          setShowAiModal(false);
      }

    } catch (error) {
      alert("Error al procesar con IA. Verifica el formato o inténtalo de nuevo.");
      console.error(error);
    } finally {
      setIsProcessingAI(false);
    }
  };

  const resolveConflicts = async () => {
      setIsSaving(true);
      try {
        // 1. Process Updates
        const updates = conflictItems
            .filter(c => c.selected === 'incoming')
            .map(c => ({
                ...c.incoming,
                id: c.existing.id
            }));
        
        // 2. Process Inserts
        if (cleanItems.length > 0) {
            await onBulkAdd(cleanItems);
        }

        if (updates.length > 0) {
            for (const item of updates) {
                await onEdit(item);
            }
        }

        // Cleanup
        setConflictItems([]);
        setCleanItems([]);
        setAiInput('');
        setSelectedImage(null);
        setShowConflictModal(false);
        alert("Importación y actualizaciones completadas.");

      } catch (error) {
          console.error(error);
          alert("Error al guardar los cambios de la importación.");
      } finally {
          setIsSaving(false);
      }
  };

  const toggleConflictSelection = (index: number, selection: 'existing' | 'incoming') => {
      const updated = [...conflictItems];
      updated[index].selected = selection;
      setConflictItems(updated);
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col font-sans transition-colors duration-300">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 shadow-sm px-4 sm:px-8 py-6 flex flex-col md:flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700 transition-colors gap-4 sticky top-0 z-20">
        <div className="flex items-center w-full md:w-auto">
            <button onClick={onBack} className="mr-4 sm:mr-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
            <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
                    <Database className="text-[#0047AB] dark:text-blue-400" /> Base de Precios
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">Sincronizada en la nube</p>
            </div>
        </div>
        <div className="flex gap-2 sm:gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 no-scrollbar">
            <button 
                onClick={() => setShowAiModal(true)}
                className="bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-800 px-4 py-2.5 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors flex items-center font-bold shadow-sm whitespace-nowrap text-xs sm:text-sm"
            >
                <Wand2 className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">Importar con IA</span><span className="sm:hidden">Importar IA</span>
            </button>
            <button 
                onClick={() => setEditingItem({ id: '', name: '', unit: 'ud', price: 0, category: 'Material' })}
                className="bg-[#0047AB] text-white px-4 py-2.5 rounded-xl hover:bg-[#003380] transition-colors flex items-center font-bold shadow-lg shadow-blue-900/10 whitespace-nowrap text-xs sm:text-sm"
            >
                <Plus className="w-5 h-5 mr-2" /> Añadir <span className="hidden sm:inline ml-1">Manual</span>
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full">
        
        {/* Search */}
        <div className="relative mb-6 sm:mb-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
                type="text" 
                placeholder="Buscar material..." 
                className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-[#0047AB] outline-none transition-all shadow-sm text-slate-900 dark:text-white placeholder-slate-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>

        {/* --- DESKTOP VIEW (Table) --- */}
        <div className="hidden md:block bg-white dark:bg-slate-800 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 uppercase text-xs tracking-wider">
                    <tr>
                        <th className="px-6 py-4 font-bold">Nombre</th>
                        <th className="px-6 py-4 font-bold">Categoría</th>
                        <th className="px-6 py-4 font-bold">Unidad</th>
                        <th className="px-6 py-4 font-bold text-center">Dto.</th>
                        <th className="px-6 py-4 font-bold text-right">Precio</th>
                        <th className="px-6 py-4 font-bold text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                    {filteredItems.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 group transition-colors">
                            <td className="px-6 py-4 font-bold text-slate-800 dark:text-white">{item.name}</td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                                <span className="bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                                    {item.category}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium">{item.unit}</td>
                            <td className="px-6 py-4 text-center">
                                {item.discount ? (
                                    <span className="text-green-600 dark:text-green-400 font-bold bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-lg text-xs">
                                        -{item.discount}%
                                    </span>
                                ) : (
                                    <span className="text-slate-300 dark:text-slate-600">-</span>
                                )}
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex flex-col items-end">
                                    <span className="font-mono font-bold text-slate-900 dark:text-white text-base">{item.price.toFixed(2)}€</span>
                                    {item.discount && (
                                        <span className="text-[10px] text-slate-400 line-through">
                                            Neto: {(item.price * (1 - item.discount / 100)).toFixed(2)}€
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all">
                                    <button onClick={() => setEditingItem(item)} className="text-[#0047AB] dark:text-blue-400 hover:text-[#003380] dark:hover:text-blue-300 font-bold bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg">Editar</button>
                                    <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"><Trash2 className="w-5 h-5" /></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {/* --- MOBILE VIEW (Cards) --- */}
        <div className="md:hidden grid grid-cols-1 gap-4">
            {filteredItems.map(item => (
                <div key={item.id} className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 pr-4">
                            <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight mb-1">{item.name}</h3>
                            <div className="flex flex-wrap gap-2 mt-2">
                                <span className="inline-flex items-center text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                                    <Tag className="w-3 h-3 mr-1" /> {item.category}
                                </span>
                                <span className="inline-flex items-center text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                                    /{item.unit}
                                </span>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="block font-mono text-xl font-bold text-[#0047AB] dark:text-blue-400">{item.price.toFixed(2)}€</span>
                            {item.discount && (
                                <div className="flex flex-col items-end mt-1">
                                    <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded font-bold">-{item.discount}%</span>
                                    <span className="text-[10px] text-slate-400 line-through mt-0.5">{(item.price * (1 - item.discount / 100)).toFixed(2)}€</span>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Mobile Actions */}
                    <div className="flex gap-3 pt-3 border-t border-slate-100 dark:border-slate-700 mt-3">
                        <button 
                            onClick={() => setEditingItem(item)} 
                            className="flex-1 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-[#0047AB] dark:text-blue-400 font-bold rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/40 active:scale-95 transition-all"
                        >
                            <Edit3 className="w-4 h-4" /> Editar
                        </button>
                        <button 
                            onClick={() => handleDelete(item.id)} 
                            className="py-2.5 px-4 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 font-bold rounded-xl text-sm hover:bg-red-100 dark:hover:bg-red-900/40 active:scale-95 transition-all"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}
        </div>

        {filteredItems.length === 0 && (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500 font-medium bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                No se encontraron resultados en la nube.
            </div>
        )}

      </div>

      {/* Edit Modal */}
      {editingItem && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 backdrop-blur-md">
              <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-8 shadow-2xl border border-slate-100 dark:border-slate-700 transition-colors">
                  <h2 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white">{editingItem.id ? 'Editar Material' : 'Nuevo Material'}</h2>
                  <form onSubmit={handleSaveItem} className="space-y-5">
                      <div>
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Nombre</label>
                          <input name="name" defaultValue={editingItem.name} required className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0047AB] transition-colors" />
                      </div>
                      <div className="flex gap-4">
                          <div className="w-1/2">
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Precio Lista (€)</label>
                              <input name="price" type="number" step="0.01" defaultValue={editingItem.price} required className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0047AB] transition-colors" />
                          </div>
                          <div className="w-1/2">
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Unidad</label>
                              <input name="unit" defaultValue={editingItem.unit} required className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0047AB] transition-colors" />
                          </div>
                      </div>
                      <div className="flex gap-4">
                          <div className="w-1/2">
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Categoría</label>
                              <input name="category" defaultValue={editingItem.category} required className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0047AB] transition-colors" />
                          </div>
                          <div className="w-1/2">
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Descuento (%)</label>
                              <input name="discount" type="number" defaultValue={editingItem.discount} className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0047AB] transition-colors" />
                          </div>
                      </div>
                      <div className="flex gap-4 mt-8">
                          <button type="button" onClick={() => setEditingItem(null)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 font-bold transition-colors">Cancelar</button>
                          <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-[#0047AB] text-white rounded-xl hover:bg-[#003380] font-bold shadow-lg shadow-blue-900/20 transition-colors flex items-center justify-center gap-2">
                             {isSaving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* AI Import Modal */}
      {showAiModal && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 backdrop-blur-md">
              <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-lg p-8 shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-100 dark:border-slate-700 transition-colors">
                  <div className="flex items-center gap-3 mb-6 text-purple-700 dark:text-purple-400">
                      <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl">
                        <Wand2 className="w-6 h-6" />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Importar Precios con IA</h2>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 font-medium leading-relaxed">
                      Sube una foto de una tarifa o pega el texto directamente. La IA detectará los artículos, precios y descuentos automáticamente.
                  </p>
                  
                  {/* Image Upload Area */}
                  <div className="mb-6">
                      {!selectedImage ? (
                          <div 
                              onClick={() => fileInputRef.current?.click()}
                              className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                          >
                              <ImageIcon className="w-12 h-12 text-slate-300 dark:text-slate-500 mb-3 group-hover:text-slate-400 dark:group-hover:text-slate-400 transition-colors" />
                              <p className="text-sm text-slate-500 dark:text-slate-400 font-bold">Haz click para subir una imagen (JPG/PNG)</p>
                              <input 
                                  type="file" 
                                  ref={fileInputRef} 
                                  onChange={handleImageSelect} 
                                  accept="image/*" 
                                  className="hidden" 
                              />
                          </div>
                      ) : (
                          <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-600 shadow-md">
                              <img src={selectedImage} alt="Preview" className="w-full h-56 object-cover" />
                              <button 
                                  onClick={() => setSelectedImage(null)}
                                  className="absolute top-3 right-3 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 backdrop-blur-sm transition-colors"
                              >
                                  <X className="w-4 h-4" />
                              </button>
                              <div className="absolute bottom-3 left-3 bg-black/50 text-white px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-sm">
                                  Imagen seleccionada
                              </div>
                          </div>
                      )}
                  </div>

                  <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-3 bg-white dark:bg-slate-800 text-slate-400 font-medium">O pega el texto</span>
                    </div>
                  </div>

                  <textarea 
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Ejemplo: Cable RV-K 3x1.5mm a 0.85€/m -20%, Interruptor automático 16A 8.50€..."
                    className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none mb-6 resize-none transition-colors"
                  ></textarea>
                  
                  <div className="flex gap-4">
                      <button type="button" onClick={() => setShowAiModal(false)} className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 font-bold transition-colors">Cancelar</button>
                      <button 
                        onClick={handleAiImport}
                        disabled={isProcessingAI || (!aiInput && !selectedImage)}
                        className="flex-1 py-3.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-purple-200 dark:shadow-purple-900/30 transition-all"
                      >
                          {isProcessingAI ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                          {isProcessingAI ? 'Procesando...' : 'Procesar'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Conflict Resolution Modal */}
      {showConflictModal && (
          <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center p-4 z-[60] backdrop-blur-md">
              <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 dark:border-slate-700">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-amber-50 dark:bg-amber-900/20 rounded-t-3xl">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                             <AlertCircle className="text-amber-500 w-6 h-6" /> Conflicto de Importación
                        </h2>
                        <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                            Algunos materiales importados ya existen en la nube. Elige qué versión conservar.
                        </p>
                      </div>
                      <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-3 py-1 rounded-full text-xs font-bold">
                          {conflictItems.length} Conflictos
                      </span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {conflictItems.map((conflict, idx) => (
                          <div key={idx} className="flex flex-col md:flex-row gap-4 items-center bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                              
                              {/* Existing Side */}
                              <div 
                                onClick={() => toggleConflictSelection(idx, 'existing')}
                                className={`flex-1 w-full p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                    conflict.selected === 'existing' 
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                                    : 'border-transparent bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                                }`}
                              >
                                  <div className="flex justify-between mb-2">
                                      <span className="text-xs font-bold uppercase text-slate-400">Nube Actual</span>
                                      {conflict.selected === 'existing' && <CheckCircle className="w-4 h-4 text-blue-500" />}
                                  </div>
                                  <div className="font-bold text-slate-900 dark:text-white mb-1">{conflict.existing.name}</div>
                                  <div className="flex justify-between items-end">
                                      <div>
                                          <div className="text-2xl font-mono text-slate-700 dark:text-slate-300">{conflict.existing.price}€</div>
                                          <div className="text-[10px] text-slate-400 uppercase font-bold mt-1">PVP Tarifa</div>
                                      </div>
                                      {conflict.existing.discount && (
                                          <div className="text-right">
                                              <span className="text-xs bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400 font-bold">-{conflict.existing.discount}%</span>
                                              <div className="text-[10px] text-slate-500 mt-1">Neto: {(conflict.existing.price * (1 - conflict.existing.discount / 100)).toFixed(2)}€</div>
                                          </div>
                                      )}
                                  </div>
                              </div>

                              <ArrowRight className="text-slate-400 hidden md:block" />

                              {/* Incoming Side */}
                              <div 
                                onClick={() => toggleConflictSelection(idx, 'incoming')}
                                className={`flex-1 w-full p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                    conflict.selected === 'incoming' 
                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
                                    : 'border-transparent bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                                }`}
                              >
                                  <div className="flex justify-between mb-2">
                                      <span className="text-xs font-bold uppercase text-slate-400">Importado (IA)</span>
                                      {conflict.selected === 'incoming' && <CheckCircle className="w-4 h-4 text-green-500" />}
                                  </div>
                                  <div className="font-bold text-slate-900 dark:text-white mb-1">{conflict.incoming.name}</div>
                                  <div className="flex justify-between items-end">
                                      <div>
                                          <div className={`text-2xl font-mono ${conflict.incoming.price !== conflict.existing.price ? 'text-purple-600 dark:text-purple-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                              {conflict.incoming.price}€
                                          </div>
                                          <div className="text-[10px] text-slate-400 uppercase font-bold mt-1">PVP Detectado</div>
                                      </div>
                                      {conflict.incoming.discount ? (
                                          <div className="text-right">
                                              <div className="flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded text-green-700 dark:text-green-300 font-bold justify-end">
                                                  <Percent className="w-3 h-3" /> {conflict.incoming.discount}% detectado
                                              </div>
                                              <div className="text-[10px] text-slate-500 mt-1">Neto: {(conflict.incoming.price * (1 - conflict.incoming.discount / 100)).toFixed(2)}€</div>
                                          </div>
                                      ) : (
                                          <div className="text-[10px] text-slate-400 italic">Sin descuento</div>
                                      )}
                                  </div>
                              </div>

                          </div>
                      ))}
                  </div>

                  <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-3xl flex justify-end gap-4">
                      <button 
                          onClick={() => {
                              setShowConflictModal(false); 
                              setConflictItems([]);
                              setCleanItems([]); 
                          }}
                          className="px-6 py-3 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                      >
                          Cancelar Importación
                      </button>
                      <button 
                          onClick={resolveConflicts}
                          disabled={isSaving}
                          className="px-8 py-3 bg-[#0047AB] text-white font-bold rounded-xl hover:bg-[#003380] shadow-lg shadow-blue-900/20 transition-colors flex items-center gap-2"
                      >
                          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                          Confirmar Selección
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default PriceDatabase;