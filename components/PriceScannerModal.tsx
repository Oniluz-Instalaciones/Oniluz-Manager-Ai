
import React, { useState, useRef, useEffect } from 'react';
import { PriceItem } from '../types';
import { Camera, X, Loader2, Save, Image as ImageIcon, Package, Trash2, Plus, RefreshCw, Upload, FileText, AlertTriangle, Tag } from 'lucide-react';
import { parseMaterialsFromImage } from '../services/geminiService';

interface PriceScannerModalProps {
  onClose: () => void;
  onSave: (items: PriceItem[]) => void;
}

interface ScannedPage {
    id: string;
    base64: string;
    blob: Blob;
    mimeType: string;
}

const PriceScannerModal: React.FC<PriceScannerModalProps> = ({ onClose, onSave }) => {
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [step, setStep] = useState<'capture' | 'review' | 'form'>('capture');
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [detectedItems, setDetectedItems] = useState<PriceItem[]>([]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Tu navegador no soporta el acceso a la cámara.");
      return;
    }
    try {
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.error("Error playing video:", e));
        }
      }, 100);
    } catch (err) {
      console.error("Error accessing camera:", err);
      setIsCameraActive(false);
      alert("No se pudo iniciar la cámara. Intenta subir un archivo.");
    }
  };

  const [isMultiPage, setIsMultiPage] = useState(false);

  const processPagesList = async (pagesToProcess: ScannedPage[]) => {
    if (pagesToProcess.length === 0) return;
    
    setIsAnalyzing(true);

    try {
      const images = pagesToProcess.map(p => p.base64);
      // Use the updated parseMaterialsFromImage which supports string[]
      const items = await parseMaterialsFromImage(images);
      
      // Assign IDs to new items
      const newItems: PriceItem[] = items.map(item => ({
          ...item,
          id: crypto.randomUUID(),
          discount: item.discount || undefined
      }));

      setDetectedItems(newItems);
      setStep('form');
    } catch (error) {
      console.error(error);
      alert("Error al procesar las imágenes.");
      setStep('form');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processAllPages = async () => {
      await processPagesList(pages);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64String = canvas.toDataURL('image/jpeg', 0.85); 
        
        canvas.toBlob((blob) => {
            if (blob) {
                const newPage: ScannedPage = {
                    id: crypto.randomUUID(),
                    base64: base64String,
                    blob: blob,
                    mimeType: 'image/jpeg'
                };
                
                if (isMultiPage) {
                    setPages(prev => [...prev, newPage]);
                    setCurrentPageIndex(pages.length); 
                    stopCamera();
                    setStep('review');
                } else {
                    // Single page mode: Process immediately
                    setPages([newPage]);
                    stopCamera();
                    setStep('review'); 
                    processPagesList([newPage]);
                }
            }
        }, 'image/jpeg', 0.85);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type.includes('spreadsheet');

      if (isExcel) {
        // Leer Excel con xlsx y convertir a texto
        const arrayBuffer = await file.arrayBuffer();
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        let allText = '';
        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          allText += `\n--- Hoja: ${sheetName} ---\n`;
          allText += XLSX.utils.sheet_to_csv(sheet);
        });

        // Crear una imagen de texto para enviársela a Gemini
        setIsAnalyzing(true);
        setStep('review');
        try {
          const { parseMaterialsFromText } = await import('../services/geminiService');
          const items = await parseMaterialsFromText(allText);
          const newItems: PriceItem[] = items.map(item => ({
            ...item,
            id: crypto.randomUUID(),
            discount: item.discount || undefined
          }));
          setDetectedItems(newItems);
          setStep('form');
        } catch (error) {
          console.error(error);
          alert("Error al procesar el Excel.");
          setStep('capture');
        } finally {
          setIsAnalyzing(false);
        }
        return;
      }

      // Para imágenes y PDFs (comportamiento original)
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const newPage: ScannedPage = {
          id: crypto.randomUUID(),
          base64: base64String,
          blob: file,
          mimeType: file.type
        };
        if (isMultiPage) {
          setPages(prev => [...prev, newPage]);
          setCurrentPageIndex(pages.length);
          setStep('review');
        } else {
          setPages([newPage]);
          setStep('review');
          processPagesList([newPage]);
        }
      };
      reader.readAsDataURL(file);
    }
};

  const updateItem = (index: number, field: keyof PriceItem, value: any) => {
      const updated = [...detectedItems];
      updated[index] = { ...updated[index], [field]: value };
      setDetectedItems(updated);
  };

  const removeItem = (index: number) => {
      const updated = [...detectedItems];
      updated.splice(index, 1);
      setDetectedItems(updated);
  };

  const addEmptyItem = () => {
      setDetectedItems([...detectedItems, {
          id: crypto.randomUUID(),
          name: '',
          unit: 'ud',
          price: 0,
          category: 'Material'
      }]);
  };

  const handleSubmit = () => {
      onSave(detectedItems);
      onClose();
  };

  const handleClose = () => {
      stopCamera();
      onClose();
  }

  return (
    <div className="fixed inset-0 bg-slate-900/90 flex items-center justify-center p-0 sm:p-4 z-50 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-800 rounded-none sm:rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[90vh] border border-slate-200 dark:border-slate-700 transition-colors">
        <div className="bg-purple-600 p-5 flex justify-between items-center text-white shadow-lg z-10 shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Camera className="w-6 h-6" /> Escáner de Precios IA
          </h2>
          <button onClick={handleClose} className="hover:bg-white/20 p-2 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 overflow-y-auto relative">
          {step === 'capture' && (
            <div className="h-full flex flex-col">
                {isCameraActive ? (
                    <div className="relative h-full flex flex-col bg-black">
                        <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={() => videoRef.current?.play()} className="flex-1 w-full h-full object-cover"></video>
                        <canvas ref={canvasRef} className="hidden"></canvas>
                        <div className="absolute bottom-0 left-0 right-0 p-8 flex justify-center items-center gap-8 bg-gradient-to-t from-black/80 to-transparent z-20">
                            <button onClick={stopCamera} className="bg-white/20 backdrop-blur-md text-white p-4 rounded-full hover:bg-white/30 transition-all"><X className="w-6 h-6" /></button>
                            <button onClick={capturePhoto} className="w-20 h-20 rounded-full border-4 border-white bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-all flex items-center justify-center"><div className="w-16 h-16 bg-white rounded-full"></div></button>
                            <div className="w-14"></div> 
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center space-y-8 py-12 px-6 h-full">
                        <div className="w-28 h-28 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-500 mb-2 shadow-sm border border-slate-100 dark:border-slate-600"><FileText className="w-12 h-12" /></div>
                        
                        <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-700/50 p-2 rounded-xl">
                            <span className={`text-xs font-bold uppercase ${!isMultiPage ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`}>Una Página</span>
                            <button 
                                onClick={() => setIsMultiPage(!isMultiPage)}
                                className={`w-12 h-6 rounded-full p-1 transition-colors ${isMultiPage ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                            >
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${isMultiPage ? 'translate-x-6' : 'translate-x-0'}`} />
                            </button>
                            <span className={`text-xs font-bold uppercase ${isMultiPage ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`}>Multipágina</span>
                        </div>

                        <div className="w-full space-y-4 max-w-sm">
                            <button onClick={startCamera} className="w-full bg-purple-600 text-white py-4 rounded-2xl font-bold shadow-xl shadow-purple-900/20 hover:bg-purple-700 transition-transform active:scale-95 flex items-center justify-center gap-3 text-lg"><Camera className="w-6 h-6" /> Escanear Tarifa</button>
                            <input type="file" accept="*/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                            <button onClick={() => fileInputRef.current?.click()} className="w-full bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-4 rounded-2xl font-bold border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-3"><Upload className="w-5 h-5" /> Subir Archivo</button>
                        </div>
                        <p className="text-xs text-slate-400 text-center max-w-xs">
                            Sube cualquier archivo (imagen, PDF, Excel...). La IA detectará automáticamente los precios, unidades y paquetes.
                        </p>
                    </div>
                )}
            </div>
          )}

          {step === 'review' && (
            <div className="flex flex-col items-center justify-center space-y-6 py-8 h-full">
               <div className="relative group">
                  {pages.length > 0 && (
                      <img src={pages[pages.length - 1].base64} alt="Preview" className="w-64 h-auto object-contain rounded-2xl shadow-lg border-4 border-white dark:border-slate-700" />
                  )}
                  <div className="absolute -top-2 -right-2 bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold shadow-md">
                      {pages.length}
                  </div>
               </div>
               
               <div className="flex flex-col items-center gap-4 w-full px-8 max-w-md">
                 {isAnalyzing ? (
                    <div className="flex flex-col items-center gap-2 text-purple-600 dark:text-purple-400 font-bold animate-pulse">
                        <div className="flex items-center gap-3 text-lg"><Loader2 className="w-6 h-6 animate-spin" /> Analizando {pages.length} página(s)...</div>
                        <p className="text-xs text-slate-500">Detectando precios por unidad y paquete...</p>
                    </div>
                 ) : (
                    <>
                        <div className="flex gap-3 w-full">
                             <button onClick={() => setStep('capture')} className="flex-1 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-2">
                                <Plus className="w-5 h-5" /> Añadir Pág.
                             </button>
                             <button onClick={processAllPages} className="flex-[2] py-3 bg-purple-600 text-white rounded-xl font-bold shadow-lg shadow-purple-900/20 hover:bg-purple-700 transition-all flex items-center justify-center gap-2">
                                <FileText className="w-5 h-5" /> Procesar ({pages.length})
                             </button>
                        </div>
                        
                        <button onClick={() => { setPages([]); setStep('capture'); }} className="text-slate-400 hover:text-red-500 text-sm flex items-center gap-1 transition-colors">
                            <Trash2 className="w-4 h-4" /> Descartar todo
                        </button>
                    </>
                 )}
               </div>
            </div>
          )}

          {step === 'form' && (
            <div className="p-6 space-y-6">
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 p-4 rounded-xl flex items-start gap-3">
                    <Tag className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-bold text-purple-800 dark:text-purple-300 text-sm">Artículos Detectados</h4>
                        <p className="text-xs text-purple-700 dark:text-purple-200 mt-1">Revisa los precios y unidades antes de guardar.</p>
                    </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-700 pt-2">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Package className="w-5 h-5 text-purple-600 dark:text-purple-400" /> {detectedItems.length} Artículos
                        </h3>
                        <button onClick={addEmptyItem} className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-1.5 rounded-lg">+ Añadir Manual</button>
                    </div>
                    <div className="space-y-3">
                        {detectedItems.map((item, idx) => (
                            <div key={item.id} className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-600 flex flex-col gap-3 transition-all">
                                <div className="flex gap-3 items-start">
                                    <div className="flex-1 space-y-2">
                                        <label className="text-[10px] font-bold uppercase text-slate-400">Nombre</label>
                                        <input 
                                            value={item.name} 
                                            onChange={(e) => updateItem(idx, 'name', e.target.value)} 
                                            className="w-full bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-purple-600 outline-none text-sm font-bold text-slate-800 dark:text-white pb-1" 
                                            placeholder="Nombre del artículo" 
                                        />
                                    </div>
                                    <div className="w-1/3 space-y-2">
                                        <label className="text-[10px] font-bold uppercase text-slate-400">Categoría</label>
                                        <input 
                                            value={item.category} 
                                            onChange={(e) => updateItem(idx, 'category', e.target.value)} 
                                            className="w-full bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-purple-600 outline-none text-sm text-slate-600 dark:text-slate-300 pb-1" 
                                            placeholder="Categoría" 
                                        />
                                    </div>
                                </div>
                                
                                <div className="flex gap-3 items-end">
                                    <div className="w-20 space-y-1">
                                        <label className="text-[10px] font-bold uppercase text-slate-400">Unidad</label>
                                        <input 
                                            value={item.unit} 
                                            onChange={(e) => updateItem(idx, 'unit', e.target.value)} 
                                            className="w-full bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-purple-600 outline-none text-sm text-center text-slate-600 dark:text-slate-300 pb-1" 
                                            placeholder="ud/m/kg" 
                                        />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[10px] font-bold uppercase text-slate-400 text-right block">Precio (€)</label>
                                        <input 
                                            type="number" 
                                            step="0.01" 
                                            value={item.price} 
                                            onChange={(e) => updateItem(idx, 'price', Number(e.target.value))} 
                                            className="w-full bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-purple-600 outline-none text-lg font-mono font-bold text-right text-slate-800 dark:text-white pb-1" 
                                        />
                                    </div>
                                    <div className="w-20 space-y-1">
                                        <label className="text-[10px] font-bold uppercase text-slate-400 text-right block">Dto %</label>
                                        <input 
                                            type="number" 
                                            value={item.discount || ''} 
                                            onChange={(e) => updateItem(idx, 'discount', Number(e.target.value))} 
                                            className="w-full bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-purple-600 outline-none text-sm text-right text-slate-600 dark:text-slate-300 pb-1" 
                                            placeholder="0" 
                                        />
                                    </div>
                                    <button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 mb-0.5">
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {detectedItems.length === 0 && <p className="text-center text-xs text-slate-400 italic py-8">No se detectaron artículos. Añade uno manualmente.</p>}
                    </div>
                </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex gap-3 shrink-0">
            {step === 'form' ? (
                <>
                    <button onClick={() => setStep('capture')} className="flex-1 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">Cancelar</button>
                    <button onClick={handleSubmit} className="flex-[2] py-3 bg-purple-600 text-white rounded-xl font-bold shadow-lg shadow-purple-900/20 hover:bg-purple-700 transition-all flex items-center justify-center gap-2">
                        <Save className="w-5 h-5" /> Guardar en Base de Datos
                    </button>
                </>
            ) : step === 'review' ? (
                <button onClick={() => { setPages([]); setStep('capture'); }} className="flex-1 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> Reiniciar</button>
            ) : (
                <button onClick={handleClose} className="w-full py-3 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">Cerrar</button>
            )}
        </div>
      </div>
    </div>
  );
};

export default PriceScannerModal;
