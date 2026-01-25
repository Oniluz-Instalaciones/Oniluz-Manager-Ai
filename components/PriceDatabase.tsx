import React, { useState, useRef } from 'react';
import { PriceItem } from '../types';
import { ArrowLeft, Search, Plus, Save, Trash2, Wand2, Loader2, Database, Download, Upload, X, ImageIcon } from 'lucide-react';
import { parseMaterialsFromInput, parseMaterialsFromImage } from '../services/geminiService';

interface PriceDatabaseProps {
  items: PriceItem[];
  onUpdate: (items: PriceItem[]) => void;
  onBack: () => void;
}

const PriceDatabase: React.FC<PriceDatabaseProps> = ({ items, onUpdate, onBack }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [aiInput, setAiInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PriceItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // CRUD
  const handleDelete = (id: string) => {
    if (window.confirm('¿Eliminar este artículo de la base de precios?')) {
      onUpdate(items.filter(i => i.id !== id));
    }
  };

  const handleSaveItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newItem: PriceItem = {
      id: editingItem ? editingItem.id : Date.now().toString(),
      name: formData.get('name') as string,
      unit: formData.get('unit') as string,
      price: Number(formData.get('price')),
      category: formData.get('category') as string,
    };

    if (editingItem) {
      onUpdate(items.map(i => i.id === newItem.id ? newItem : i));
    } else {
      onUpdate([...items, newItem]);
    }
    setEditingItem(null);
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

  // AI Import
  const handleAiImport = async () => {
    if (!aiInput.trim() && !selectedImage) return;
    setIsProcessingAI(true);
    try {
      let newItems: PriceItem[] = [];
      
      if (selectedImage) {
          const imageItems = await parseMaterialsFromImage(selectedImage);
          newItems = [...newItems, ...imageItems];
      }
      
      if (aiInput.trim()) {
          const textItems = await parseMaterialsFromInput(aiInput);
          newItems = [...newItems, ...textItems];
      }

      // Merge strategy: Add new ones
      if (newItems.length > 0) {
        onUpdate([...newItems, ...items]);
        setAiInput('');
        setSelectedImage(null);
        setShowAiModal(false);
        alert(`Se han importado ${newItems.length} artículos correctamente.`);
      } else {
          alert("No se encontraron artículos válidos.");
      }
    } catch (error) {
      alert("Error al procesar con IA. Verifica el formato o inténtalo de nuevo.");
      console.error(error);
    } finally {
      setIsProcessingAI(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col font-sans transition-colors duration-300">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 shadow-sm px-8 py-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-700 transition-colors">
        <div className="flex items-center">
            <button onClick={onBack} className="mr-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
            <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
                    <Database className="text-[#0047AB] dark:text-blue-400" /> Base de Precios
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">Gestión de tarifas y materiales</p>
            </div>
        </div>
        <div className="flex gap-3">
            <button 
                onClick={() => setShowAiModal(true)}
                className="bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-800 px-5 py-2.5 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors flex items-center font-bold shadow-sm"
            >
                <Wand2 className="w-4 h-4 mr-2" /> Importar con IA
            </button>
            <button 
                onClick={() => setEditingItem({ id: '', name: '', unit: 'ud', price: 0, category: 'Material' })}
                className="bg-[#0047AB] text-white px-5 py-2.5 rounded-xl hover:bg-[#003380] transition-colors flex items-center font-bold shadow-lg shadow-blue-900/10"
            >
                <Plus className="w-5 h-5 mr-2" /> Añadir Manual
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto w-full">
        
        {/* Search */}
        <div className="relative mb-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
                type="text" 
                placeholder="Buscar material..." 
                className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-[#0047AB] outline-none transition-all shadow-sm text-slate-900 dark:text-white placeholder-slate-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>

        {/* List */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 uppercase text-xs tracking-wider">
                    <tr>
                        <th className="px-6 py-4 font-bold">Nombre</th>
                        <th className="px-6 py-4 font-bold">Categoría</th>
                        <th className="px-6 py-4 font-bold">Unidad</th>
                        <th className="px-6 py-4 font-bold text-right">Precio Unitario</th>
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
                            <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 dark:text-white text-base">{item.price.toFixed(2)}€</td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all">
                                    <button onClick={() => setEditingItem(item)} className="text-[#0047AB] dark:text-blue-400 hover:text-[#003380] dark:hover:text-blue-300 font-bold bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg">Editar</button>
                                    <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"><Trash2 className="w-5 h-5" /></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {filteredItems.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-6 py-16 text-center text-slate-400 dark:text-slate-500 font-medium">
                                No se encontraron resultados.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
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
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Precio (€)</label>
                              <input name="price" type="number" step="0.01" defaultValue={editingItem.price} required className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0047AB] transition-colors" />
                          </div>
                          <div className="w-1/2">
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Unidad</label>
                              <input name="unit" defaultValue={editingItem.unit} required className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0047AB] transition-colors" />
                          </div>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Categoría</label>
                          <input name="category" defaultValue={editingItem.category} required className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0047AB] transition-colors" />
                      </div>
                      <div className="flex gap-4 mt-8">
                          <button type="button" onClick={() => setEditingItem(null)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 font-bold transition-colors">Cancelar</button>
                          <button type="submit" className="flex-1 py-3 bg-[#0047AB] text-white rounded-xl hover:bg-[#003380] font-bold shadow-lg shadow-blue-900/20 transition-colors">Guardar</button>
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
                      Sube una foto de una tarifa o pega el texto directamente. La IA detectará los artículos y actualizará tu base de datos automáticamente.
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
                    placeholder="Ejemplo: Cable RV-K 3x1.5mm a 0.85€/m, Interruptor automático 16A 8.50€..."
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

    </div>
  );
};

export default PriceDatabase;