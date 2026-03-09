import React, { useState, useEffect, useRef } from 'react';
import { Project, PriceItem, ProjectDocument } from '../types';
import { X, CheckSquare, Square, Loader2, Play, AlertCircle, FileText, Building2, Pause, Square as StopSquare, Trash2, Edit3, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { analyzeDocument } from '../services/geminiService';

interface ProjectDocumentScannerModalProps {
  projects: Project[];
  onClose: () => void;
  onScanComplete: (items: PriceItem[]) => void;
}

const ProjectDocumentScannerModal: React.FC<ProjectDocumentScannerModalProps> = ({ projects, onClose, onScanComplete }) => {
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentDocName: '' });
  const [foundItems, setFoundItems] = useState<PriceItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  
  // Refs to control the loop and component status
  const shouldStopRef = useRef(false);
  const isPausedRef = useRef(false);
  const isMountedRef = useRef(true);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      isMountedRef.current = true;
      return () => {
          isMountedRef.current = false;
          shouldStopRef.current = true; // Ensure loop stops if unmounted
      };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current && !isReviewing) {
        logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isReviewing]);

  // Select all by default
  useEffect(() => {
    setSelectedProjectIds(new Set(projects.map(p => p.id)));
  }, [projects]);

  const toggleProject = (id: string) => {
    const newSet = new Set(selectedProjectIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedProjectIds(newSet);
  };

  const toggleAll = () => {
    if (selectedProjectIds.size === projects.length) {
      setSelectedProjectIds(new Set());
    } else {
      setSelectedProjectIds(new Set(projects.map(p => p.id)));
    }
  };

  const addLog = (msg: string) => {
    if (isMountedRef.current) {
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    }
  };

  const handleStop = () => {
    // Immediate stop without confirmation for better UX
    shouldStopRef.current = true;
    setIsStopping(true);
    addLog("🛑 Deteniendo escaneo (finalizando documento actual)...");
  };

  const handleClose = () => {
      if (isScanning && !isReviewing) {
          setShowCloseConfirm(true);
      } else {
          onClose();
      }
  };

  const confirmClose = () => {
      shouldStopRef.current = true;
      onClose();
  };

  const handlePauseToggle = () => {
      if (isPaused) {
          isPausedRef.current = false;
          setIsPaused(false);
          addLog("▶️ Reanudando escaneo...");
      } else {
          isPausedRef.current = true;
          setIsPaused(true);
          addLog("⏸️ Escaneo pausado.");
      }
  };

  const startScan = async () => {
    setIsScanning(true);
    setIsPaused(false);
    setIsStopping(false);
    setIsReviewing(false);
    shouldStopRef.current = false;
    isPausedRef.current = false;
    setFoundItems([]);
    setSelectedItems(new Set());
    setLogs([]);
    addLog("Iniciando escaneo de proyectos...");

    try {
      const projectIds = Array.from(selectedProjectIds);
      
      // 1. Fetch documents for selected projects
      addLog(`Consultando documentos de ${projectIds.length} proyectos...`);
      
      // Fetch in chunks to avoid URL length limits if many projects
      let allDocs: any[] = [];
      const CHUNK_SIZE = 10;
      
      for (let i = 0; i < projectIds.length; i += CHUNK_SIZE) {
        if (shouldStopRef.current) break;

        const chunk = projectIds.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase
          .from('documents')
          .select('id, name, type, data, project_id, category')
          .in('project_id', chunk)
          .in('type', ['image', 'pdf'])
          .neq('category', 'technical'); // Exclude explicit technical docs
          
        if (error) throw error;
        
        if (data) {
            // Further filter to match DocumentManager logic for "General" tab
            // Exclude if name starts with [TEC] (legacy technical docs)
            const filteredData = data.filter(d => !d.name.startsWith('[TEC] '));
            allDocs = [...allDocs, ...filteredData];
        }
      }

      if (isMountedRef.current) addLog(`Se encontraron ${allDocs.length} documentos procesables.`);
      
      if (allDocs.length === 0) {
        if (isMountedRef.current) {
            addLog("No hay documentos para escanear en los proyectos seleccionados.");
            setTimeout(() => setIsScanning(false), 2000);
        }
        return;
      }

      if (isMountedRef.current) setProgress({ current: 0, total: allDocs.length, currentDocName: '' });

      const newPriceItems: PriceItem[] = [];
      let consecutiveErrors = 0;

      // 2. Process each document
      for (let i = 0; i < allDocs.length; i++) {
        // Check for Stop
        if (shouldStopRef.current) {
            addLog("Escaneo detenido por el usuario.");
            break;
        }

        // Check for Pause
        while (isPausedRef.current) {
            if (shouldStopRef.current) break;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (shouldStopRef.current) break;

        const doc = allDocs[i];
        if (isMountedRef.current) {
            setProgress({ current: i + 1, total: allDocs.length, currentDocName: doc.name });
        }
        addLog(`Analizando: ${doc.name}...`);

        try {
          // Call Gemini
          const mimeType = doc.type === 'pdf' ? 'application/pdf' : 'image/jpeg';
          const analysis = await analyzeDocument(doc.data, mimeType, (msg) => {
              addLog(`  ${msg}`);
          });
          
          if (analysis.errorType) {
              addLog(`  ⚠️ Error: ${analysis.description}`);
              consecutiveErrors++;
              if (consecutiveErrors >= 3) {
                  addLog(`  ❌ Demasiados errores consecutivos. Deteniendo escaneo para evitar bloqueos.`);
                  shouldStopRef.current = true;
              }
          } else if (analysis && analysis.items && analysis.items.length > 0) {
            consecutiveErrors = 0; // Reset on success
            const validItems = analysis.items.filter((m: any) => m.unitPrice && m.unitPrice > 0 && m.isMaterial !== false);
            
            if (validItems.length > 0) {
              addLog(`  -> Encontrados ${validItems.length} materiales de construcción con precio.`);
              
              validItems.forEach((m: any) => {
                newPriceItems.push({
                  id: crypto.randomUUID(),
                  name: m.name,
                  category: m.category || 'General',
                  unit: m.unit || 'ud',
                  price: m.unitPrice || 0,
                  discount: m.discount
                });
              });
            } else {
              addLog(`  -> Sin precios válidos.`);
            }
          } else {
            consecutiveErrors = 0; // Reset on success
            addLog(`  -> No se detectaron materiales.`);
          }

        } catch (err) {
          console.error(`Error analyzing doc ${doc.id}:`, err);
          addLog(`  -> Error al analizar: ${err instanceof Error ? err.message : 'Desconocido'}`);
          consecutiveErrors++;
          if (consecutiveErrors >= 3) {
              addLog(`  ❌ Demasiados errores consecutivos. Deteniendo escaneo para evitar bloqueos.`);
              shouldStopRef.current = true;
          }
        }
      }

      if (!isMountedRef.current) return;

      addLog(`Escaneo completado. Total artículos encontrados: ${newPriceItems.length}`);
      setFoundItems(newPriceItems);
      setSelectedItems(new Set(newPriceItems.map(i => i.id)));

      // Automatically finish if items found, or let user see logs
      if (newPriceItems.length > 0) {
         setTimeout(() => {
             if (isMountedRef.current) setIsReviewing(true);
         }, 1000);
      } else {
          if (shouldStopRef.current) {
              addLog("Escaneo detenido. No se encontraron nuevos precios hasta el momento.");
          } else {
              addLog("El escaneo finalizó pero no se encontraron nuevos precios.");
          }
          setTimeout(() => setIsScanning(false), 3000);
          setIsStopping(false);
      }

    } catch (error: any) {
      console.error("Scan error:", error);
      if (isMountedRef.current) {
          addLog(`Error crítico: ${error.message}`);
          setTimeout(() => setIsScanning(false), 3000);
          setIsStopping(false);
      }
    }
  };

  const toggleItemSelection = (id: string) => {
      const newSet = new Set(selectedItems);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedItems(newSet);
  };

  const toggleAllItems = () => {
      if (selectedItems.size === foundItems.length) {
          setSelectedItems(new Set());
      } else {
          setSelectedItems(new Set(foundItems.map(i => i.id)));
      }
  };

  const handleItemEdit = (id: string, field: keyof PriceItem, value: any) => {
      setFoundItems(prev => prev.map(item => 
          item.id === id ? { ...item, [field]: value } : item
      ));
  };

  const handleConfirmReview = () => {
      const itemsToAdd = foundItems.filter(item => selectedItems.has(item.id));
      onScanComplete(itemsToAdd);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center p-4 z-[70] backdrop-blur-md">
      <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-100 dark:border-slate-700 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="text-[#0047AB] dark:text-blue-400 w-6 h-6" /> Escáner Masivo de Proyectos
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Analiza documentos históricos para extraer precios y materiales.
            </p>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-6">
          
          {!isScanning ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-700 dark:text-slate-300 text-sm uppercase tracking-wide">
                  Seleccionar Proyectos ({selectedProjectIds.size})
                </h3>
                <button 
                  onClick={toggleAll}
                  className="text-xs font-bold text-[#0047AB] dark:text-blue-400 hover:underline"
                >
                  {selectedProjectIds.size === projects.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/50 p-2 space-y-1">
                {projects.map(project => (
                  <div 
                    key={project.id}
                    onClick={() => toggleProject(project.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedProjectIds.has(project.id) 
                        ? 'bg-white dark:bg-slate-800 shadow-sm border border-blue-200 dark:border-blue-900/50' 
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    <div className={`text-[#0047AB] dark:text-blue-400 ${selectedProjectIds.has(project.id) ? 'opacity-100' : 'opacity-40'}`}>
                      {selectedProjectIds.has(project.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-slate-900 dark:text-white text-sm">{project.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                         <Building2 className="w-3 h-3" /> {project.client}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <button
                  onClick={startScan}
                  disabled={selectedProjectIds.size === 0}
                  className="w-full py-4 bg-[#0047AB] text-white rounded-xl font-bold hover:bg-[#003380] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5 fill-current" /> Iniciar Análisis
                </button>
              </div>
            </>
          ) : isReviewing ? (
            <div className="flex flex-col h-full overflow-hidden">
                <div className="flex justify-between items-center mb-4 shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Revisar Artículos Encontrados</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Selecciona y edita los artículos antes de añadirlos a la base de precios.</p>
                    </div>
                    <button 
                      onClick={toggleAllItems}
                      className="text-sm font-bold text-[#0047AB] dark:text-blue-400 hover:underline"
                    >
                      {selectedItems.size === foundItems.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/50 p-2 space-y-2 min-h-0">
                    {foundItems.map(item => (
                        <div key={item.id} className={`p-4 rounded-xl border transition-colors ${selectedItems.has(item.id) ? 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-900/50 shadow-sm' : 'bg-slate-100/50 dark:bg-slate-800/50 border-transparent opacity-60'}`}>
                            <div className="flex items-start gap-3">
                                <button onClick={() => toggleItemSelection(item.id)} className="mt-1 text-[#0047AB] dark:text-blue-400 shrink-0">
                                    {selectedItems.has(item.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                </button>
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4">
                                    <div className="md:col-span-5">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nombre</label>
                                        <input 
                                            type="text" 
                                            value={item.name}
                                            onChange={(e) => handleItemEdit(item.id, 'name', e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-900 dark:text-white"
                                        />
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Categoría</label>
                                        <input 
                                            type="text" 
                                            value={item.category}
                                            onChange={(e) => handleItemEdit(item.id, 'category', e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-900 dark:text-white"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Precio (€)</label>
                                        <input 
                                            type="number" 
                                            step="0.01"
                                            value={item.price}
                                            onChange={(e) => handleItemEdit(item.id, 'price', parseFloat(e.target.value) || 0)}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-900 dark:text-white"
                                            onFocus={(e) => e.target.select()}
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Dto (%)</label>
                                        <input 
                                            type="number" 
                                            value={item.discount || ''}
                                            onChange={(e) => handleItemEdit(item.id, 'discount', parseFloat(e.target.value) || undefined)}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-900 dark:text-white"
                                            onFocus={(e) => e.target.select()}
                                        />
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setFoundItems(prev => prev.filter(i => i.id !== item.id))}
                                    className="mt-1 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex justify-end gap-4 shrink-0">
                    <button 
                        onClick={() => setIsScanning(false)}
                        className="px-6 py-3 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleConfirmReview}
                        disabled={selectedItems.size === 0}
                        className="px-8 py-3 bg-[#0047AB] text-white font-bold rounded-xl hover:bg-[#003380] shadow-lg shadow-blue-900/20 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Check className="w-5 h-5" />
                        Añadir {selectedItems.size} Artículos
                    </button>
                </div>
            </div>
          ) : (
            <div className="flex flex-col h-full justify-center">
              <div className="text-center mb-8">
                <div className="inline-block p-4 bg-blue-50 dark:bg-blue-900/20 rounded-full mb-4 relative">
                  {isPaused ? (
                      <Pause className="w-12 h-12 text-amber-500 dark:text-amber-400" />
                  ) : isStopping ? (
                      <StopSquare className="w-12 h-12 text-red-500 dark:text-red-400 animate-pulse" />
                  ) : (
                      <Loader2 className="w-12 h-12 text-[#0047AB] dark:text-blue-400 animate-spin" />
                  )}
                  {!isStopping && !isPaused && (
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#0047AB] dark:text-blue-400">
                        {Math.round((progress.current / progress.total) * 100)}%
                      </div>
                  )}
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  {isStopping ? 'Deteniendo...' : isPaused ? 'Escaneo Pausado' : 'Analizando Documentos...'}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm h-6">
                  {isStopping ? 'Finalizando último documento...' : progress.currentDocName ? `Procesando: ${progress.currentDocName}` : 'Preparando...'}
                </p>
                <div className="mt-2 text-xs font-bold text-slate-400">
                  {progress.current} de {progress.total} documentos
                </div>
              </div>

              {/* Controls */}
              <div className="flex gap-4 mb-6">
                  <button 
                    onClick={handlePauseToggle}
                    disabled={isStopping}
                    className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        isPaused 
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300' 
                        : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300'
                    }`}
                  >
                      {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                      {isPaused ? 'Reanudar' : 'Pausar'}
                  </button>
                  <button 
                    onClick={handleStop}
                    disabled={isStopping}
                    className="flex-1 py-3 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      {isStopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopSquare className="w-4 h-4" />}
                      {isStopping ? 'Deteniendo...' : 'Detener'}
                  </button>
              </div>

              {/* Logs Console */}
              <div className="bg-black/90 rounded-xl p-4 font-mono text-xs text-green-400 h-48 overflow-y-auto custom-scrollbar border border-slate-700 shadow-inner">
                {logs.map((log, i) => (
                  <div key={i} className="mb-1 whitespace-pre-wrap">{log}</div>
                ))}
                <div id="log-end" ref={logsEndRef}></div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Close Confirmation Modal */}
      {showCloseConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80]">
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl max-w-sm w-full mx-4 shadow-2xl">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">¿Detener escaneo?</h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-6">El escaneo está en curso. Si cierras ahora, se detendrá el proceso.</p>
                  <div className="flex justify-end gap-3">
                      <button 
                          onClick={() => setShowCloseConfirm(false)}
                          className="px-4 py-2 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                      >
                          Continuar Escaneando
                      </button>
                      <button 
                          onClick={confirmClose}
                          className="px-4 py-2 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600"
                      >
                          Detener y Cerrar
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default ProjectDocumentScannerModal;
