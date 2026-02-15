import React, { useState, useRef, useEffect } from 'react';
import { Project, Transaction, Material, ProjectDocument } from '../types';
import { Camera, X, Loader2, Save, Image as ImageIcon, Package, Trash2, Plus, RefreshCw, Upload, FileText, AlertTriangle, CreditCard, ExternalLink, ArchiveRestore, Ban, Tag, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react';
import { analyzeDocument } from '../services/geminiService';
import { supabase } from '../lib/supabase';

interface ScannerModalProps {
  projects: Project[];
  onClose: () => void;
  onSave: (projectId: string, transaction: Transaction, newMaterials: Material[], newDocument?: ProjectDocument) => void;
  currentUserName: string;
  defaultProjectId?: string; // New prop to lock project selection
  defaultCategory?: 'general' | 'technical'; // New prop to set doc category
}

// Extend Material type locally to handle the UI state for "Add to Stock"
interface DetectedItem extends Material {
    addToStock: boolean;
}

// Helper to fix date format mismatch (DD/MM/YYYY -> YYYY-MM-DD)
const normalizeDate = (dateStr: string | undefined): string => {
    if (!dateStr) return new Date().toISOString().split('T')[0];

    // Remove any timestamps or extra text, keep only date part if strictly formatted
    let cleanDate = dateStr.trim();

    // Check for DD/MM/YYYY or DD-MM-YYYY format
    // Regex logic: 1 or 2 digits, separator, 1 or 2 digits, separator, 4 digits
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(cleanDate)) {
        const [day, month, year] = cleanDate.split(/[\/\-]/);
        // Ensure padded zeros (e.g., 1 -> 01)
        const paddedDay = day.padStart(2, '0');
        const paddedMonth = month.padStart(2, '0');
        return `${year}-${paddedMonth}-${paddedDay}`;
    }

    // Attempt to parse standard formats
    const timestamp = Date.parse(cleanDate);
    if (!isNaN(timestamp)) {
        return new Date(timestamp).toISOString().split('T')[0];
    }

    // Fallback to today if parsing completely fails to prevent DB crash
    return new Date().toISOString().split('T')[0];
};

// Helper for display formatting
const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    return `${day}-${month}-${year}`;
};

const ScannerModal: React.FC<ScannerModalProps> = ({ projects, onClose, onSave, currentUserName, defaultProjectId, defaultCategory = 'general' }) => {
  const [fileData, setFileData] = useState<string | null>(null); // Base64
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [step, setStep] = useState<'capture' | 'review' | 'form'>('capture');
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  // State for specific errors: 'QUOTA' | 'GENERIC' | null
  const [scanErrorType, setScanErrorType] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Form Data
  const [formData, setFormData] = useState({
    transactionType: 'expense' as 'income' | 'expense', // New field to handle refunds
    docType: 'RECEIPT', 
    supplier: '',
    amount: 0,
    tax: 0,
    description: '',
    category: 'Material',
    date: new Date().toISOString().split('T')[0],
    projectId: defaultProjectId || projects[0]?.id || ''
  });

  const [detectedMaterials, setDetectedMaterials] = useState<DetectedItem[]>([]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
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
        video: { 
          facingMode: 'environment', 
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
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
      
      if (err instanceof DOMException && err.name === "NotAllowedError") {
         alert("Permiso denegado. Por favor, permite el acceso a la cámara en la configuración de tu navegador.");
      } else {
         alert("No se pudo iniciar la cámara. Intenta subir un archivo.");
      }
    }
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
            if (blob) setFileBlob(blob);
        }, 'image/jpeg', 0.85);
        stopCamera();
        setFileData(base64String);
        setMimeType('image/jpeg');
        setStep('review');
        processDocument(base64String, 'image/jpeg');
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileBlob(file); 
      setMimeType(file.type);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFileData(base64String);
        setStep('review');
        processDocument(base64String, file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  const processDocument = async (base64: string, type: string) => {
    setIsAnalyzing(true);
    setScanErrorType(null);
    try {
      const data = await analyzeDocument(base64, type);
      
      // Check for error types returned by service
      if (data.errorType) {
          setScanErrorType(data.errorType);
      } else if (data.description && data.description.includes("Error")) {
          setScanErrorType('GENERIC');
      }

      // Detect negative amount for Refund logic
      const isRefund = data.total < 0;
      const absoluteAmount = Math.abs(data.total || 0);

      // AUTOMATIC STOCK LOGIC: Now controlled by the AI's boolean 'isStockable'
      // Fallback to legacy string check if AI doesn't return the boolean for some reason
      const shouldAddToStock = typeof data.isStockable === 'boolean' 
          ? data.isStockable 
          : ['Material', 'Herramienta'].includes(data.categoria || '');

      // Normalize date here before setting state
      const safeDate = normalizeDate(data.fecha);

      setFormData(prev => ({
        ...prev,
        transactionType: isRefund ? 'income' : 'expense', // Auto-set to income if refund
        docType: absoluteAmount > 0 ? 'RECEIPT' : 'DELIVERY_NOTE',
        supplier: data.comercio || '',
        amount: absoluteAmount, // Always positive in form
        tax: Math.abs(data.iva || 0),
        description: isRefund ? `Devolución - ${data.comercio || 'Desconocido'}` : (data.comercio ? `Gasto en ${data.comercio}` : 'Gasto detectado'),
        category: isRefund ? 'Devolución' : (data.categoria || 'Varios'),
        date: safeDate // Use normalized date YYYY-MM-DD
      }));

      if (data.items && Array.isArray(data.items)) {
          const newMats: DetectedItem[] = data.items.map((item: any) => ({
              id: crypto.randomUUID(),
              projectId: '', 
              name: item.name || 'Concepto',
              quantity: item.quantity ? Number(item.quantity) : 1, 
              unit: item.unit || 'ud',
              pricePerUnit: item.price ? Number(item.price) : 0,
              minStock: 5,
              addToStock: shouldAddToStock // In refund, we probably don't want to add negative stock yet, user manual review is safer
          }));
          setDetectedMaterials(newMats);
      } else {
        setDetectedMaterials([]);
      }

      setStep('form');
    } catch (error) {
      console.error(error);
      setScanErrorType('GENERIC');
      setStep('form');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateMaterial = (index: number, field: keyof DetectedItem, value: any) => {
      const updated = [...detectedMaterials];
      updated[index] = { ...updated[index], [field]: value };
      setDetectedMaterials(updated);
  };

  const toggleAddToStock = (index: number) => {
      const updated = [...detectedMaterials];
      updated[index].addToStock = !updated[index].addToStock;
      setDetectedMaterials(updated);
  }

  const removeMaterial = (index: number) => {
      const updated = [...detectedMaterials];
      updated.splice(index, 1);
      setDetectedMaterials(updated);
  };

  const addEmptyMaterial = () => {
      // Manual adds default check stock based on current category
      const stockCategories = ['Material', 'Herramienta'];
      const shouldAddToStock = stockCategories.includes(formData.category);

      setDetectedMaterials([...detectedMaterials, {
          id: crypto.randomUUID(),
          projectId: '',
          name: '',
          quantity: 1,
          unit: 'ud',
          pricePerUnit: 0,
          minStock: 5,
          addToStock: shouldAddToStock
      }]);
  };

  const uploadFileToSupabase = async (projectId: string): Promise<string | null> => {
      if (!fileBlob) return null;
      try {
          const ext = mimeType === 'application/pdf' ? 'pdf' : 'jpg';
          const fileName = `${projectId}/${Date.now()}.${ext}`;
          
          const { error } = await supabase.storage
              .from('photos')
              .upload(fileName, fileBlob, { contentType: mimeType, upsert: false });

          if (error) throw error;
          
          const { data: { publicUrl } } = supabase.storage
              .from('photos')
              .getPublicUrl(fileName);
              
          return publicUrl;
      } catch (e) {
          console.error("Upload error:", e);
          return null; 
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.projectId) {
      alert("Selecciona un proyecto");
      return;
    }

    setIsUploading(true);

    try {
        const fileUrl = await uploadFileToSupabase(formData.projectId);

        const newTransaction: Transaction = {
          id: crypto.randomUUID(),
          projectId: formData.projectId,
          type: formData.transactionType, // Uses dynamic type (income/expense)
          category: formData.category,
          amount: Number(formData.amount),
          date: formData.date,
          description: formData.description,
          userName: currentUserName
        };

        // Filter: Only add items to stock if 'addToStock' is true
        const stockItemsToAdd = detectedMaterials
            .filter(m => m.addToStock)
            .map(m => ({ 
                ...m, 
                id: crypto.randomUUID(), // Ensure ID is generated
                projectId: formData.projectId 
            }));

        // 1. Insert Transaction (Always) - Check for error
        const { error: txError } = await supabase.from('transactions').insert({
            id: newTransaction.id,
            project_id: newTransaction.projectId,
            type: newTransaction.type,
            category: newTransaction.category,
            amount: newTransaction.amount,
            date: newTransaction.date || null,
            description: newTransaction.description,
            user_name: newTransaction.userName // Column 'user_name' exists now
        });

        if (txError) throw new Error("Error al guardar la transacción: " + txError.message);

        // 2. Insert Materials (Only if marked as stock)
        if (stockItemsToAdd.length > 0) {
            const matsForDb = stockItemsToAdd.map(m => ({
                id: m.id,
                project_id: m.projectId,
                name: m.name,
                quantity: m.quantity,
                unit: m.unit,
                min_stock: m.minStock,
                price_per_unit: m.pricePerUnit
            }));
            const { error: matError } = await supabase.from('materials').insert(matsForDb);
            if (matError) throw new Error("Error al guardar materiales: " + matError.message);
        }

        // 3. Insert Document (Linked to Project)
        let newDocument: ProjectDocument | undefined;
        if (fileUrl) {
            newDocument = {
                id: crypto.randomUUID(),
                projectId: formData.projectId,
                name: `${formData.docType === 'DELIVERY_NOTE' ? 'Albarán' : 'Factura'} ${formatDate(formData.date)}`,
                type: mimeType === 'application/pdf' ? 'pdf' : 'image',
                category: defaultCategory, // Use the defaultCategory prop
                date: formData.date || new Date().toISOString().split('T')[0],
                data: fileUrl // Stores URL
            };

            const { error: docError } = await supabase.from('documents').insert({
                id: newDocument.id,
                project_id: newDocument.projectId,
                name: newDocument.name,
                type: newDocument.type,
                category: newDocument.category,
                date: newDocument.date,
                data: newDocument.data 
            });
            
            if (docError) console.error("Warning: Document save failed", docError);
        }

        onSave(formData.projectId, newTransaction, stockItemsToAdd, newDocument);
    
    } catch (error: any) {
        console.error("Error saving to DB:", error);
        alert(`Error guardando datos en la nube: ${error.message || error}`);
    } finally {
        setIsUploading(false);
    }
  };

  const handleClose = () => {
      stopCamera();
      onClose();
  }

  return (
    <div className="fixed inset-0 bg-slate-900/90 flex items-center justify-center p-0 sm:p-4 z-50 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-800 rounded-none sm:rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[90vh] border border-slate-200 dark:border-slate-700 transition-colors">
        
        <div className="bg-[#0047AB] p-5 flex justify-between items-center text-white shadow-lg z-10 shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Camera className="w-6 h-6" /> Escáner Multimodal
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
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted
                            onLoadedMetadata={() => videoRef.current?.play()}
                            className="flex-1 w-full h-full object-cover"
                        ></video>
                        <canvas ref={canvasRef} className="hidden"></canvas>
                        
                        <div className="absolute bottom-0 left-0 right-0 p-8 flex justify-center items-center gap-8 bg-gradient-to-t from-black/80 to-transparent z-20">
                            <button 
                                onClick={stopCamera}
                                className="bg-white/20 backdrop-blur-md text-white p-4 rounded-full hover:bg-white/30 transition-all"
                            >
                                <X className="w-6 h-6" />
                            </button>
                            <button 
                                onClick={capturePhoto}
                                className="w-20 h-20 rounded-full border-4 border-white bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-all flex items-center justify-center"
                            >
                                <div className="w-16 h-16 bg-white rounded-full"></div>
                            </button>
                            <div className="w-14"></div> 
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center space-y-8 py-12 px-6 h-full">
                        <div className="w-28 h-28 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-500 mb-2 shadow-sm border border-slate-100 dark:border-slate-600">
                            <FileText className="w-12 h-12" />
                        </div>
                        
                        <div className="w-full space-y-4">
                            <button 
                                onClick={startCamera}
                                className="w-full bg-[#0047AB] text-white py-4 rounded-2xl font-bold shadow-xl shadow-blue-900/20 hover:bg-[#003380] transition-transform active:scale-95 flex items-center justify-center gap-3 text-lg"
                            >
                                <Camera className="w-6 h-6" /> Escanear con Cámara
                            </button>
                            
                            <div className="relative py-2">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-300 dark:border-slate-600"></div>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-slate-50 dark:bg-slate-800 px-2 text-slate-500 dark:text-slate-400">O también</span>
                                </div>
                            </div>

                            <input 
                                type="file" 
                                accept="image/*,application/pdf" 
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden" 
                            />
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-4 rounded-2xl font-bold border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-3"
                            >
                                <Upload className="w-5 h-5" /> Subir Archivo (IMG/PDF)
                            </button>
                        </div>
                    </div>
                )}
            </div>
          )}

          {step === 'review' && (
            <div className="flex flex-col items-center justify-center space-y-6 py-8 h-full">
               <div className="relative">
                  {mimeType === 'application/pdf' ? (
                      <div className="w-64 h-80 bg-slate-100 dark:bg-slate-700 rounded-2xl flex flex-col items-center justify-center border-4 border-white dark:border-slate-600 shadow-lg">
                          <FileText className="w-20 h-20 text-red-500 mb-4" />
                          <span className="text-sm font-bold text-slate-500 dark:text-slate-300">Documento PDF</span>
                      </div>
                  ) : (
                    fileData && <img src={fileData} alt="Preview" className="w-64 h-auto object-contain rounded-2xl shadow-lg border-4 border-white dark:border-slate-700" />
                  )}
               </div>
               <div className="flex flex-col items-center gap-2 text-[#0047AB] dark:text-blue-400 font-bold animate-pulse">
                 <div className="flex items-center gap-3 text-lg">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Analizando documento con IA...
                 </div>
                 <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Categorizando gastos y stock automáticamente...</span>
               </div>
            </div>
          )}

          {step === 'form' && (
            <div className="p-6 space-y-6">
                {scanErrorType && (
                    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 p-4 rounded-xl flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-orange-700 dark:text-orange-400 text-sm">Aviso de Escaneo</h4>
                            <p className="text-xs text-orange-600 dark:text-orange-300 mt-1">
                                {scanErrorType === 'QUOTA' 
                                ? "El servicio de IA está saturado momentáneamente. Por favor, revisa los datos extraídos manualmente." 
                                : "Hubo un problema al leer el documento. Verifica los campos manualmente."}
                            </p>
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Proyecto</label>
                        <select 
                            value={formData.projectId}
                            onChange={(e) => setFormData({...formData, projectId: e.target.value})}
                            disabled={!!defaultProjectId}
                            className={`w-full mt-1 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-bold text-slate-900 dark:text-white ${defaultProjectId ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            <option value="">Seleccionar Proyecto...</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Auto-detected Category Display */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 p-3 rounded-xl flex flex-col justify-center">
                            <div className="flex items-center gap-2 mb-1">
                                <Tag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300 uppercase">Categoría</span>
                            </div>
                            <span className="text-sm font-extrabold text-indigo-700 dark:text-indigo-300 uppercase truncate">
                                {formData.category}
                            </span>
                        </div>

                        {/* Transaction Type Toggle */}
                        <button
                            onClick={() => setFormData({
                                ...formData, 
                                transactionType: formData.transactionType === 'expense' ? 'income' : 'expense',
                                category: formData.transactionType === 'expense' ? 'Devolución' : 'Material' 
                            })}
                            className={`p-3 rounded-xl border flex flex-col justify-center transition-all ${
                                formData.transactionType === 'income' 
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                            }`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                {formData.transactionType === 'income' ? <RotateCcw className="w-3.5 h-3.5 text-green-600" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                                <span className={`text-[10px] font-bold uppercase ${formData.transactionType === 'income' ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>Tipo</span>
                            </div>
                            <span className={`text-sm font-extrabold uppercase truncate ${formData.transactionType === 'income' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                                {formData.transactionType === 'income' ? 'Devolución' : 'Gasto'}
                            </span>
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Fecha</label>
                            <input 
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({...formData, date: e.target.value})}
                                className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-bold text-slate-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Importe Total</label>
                            <input 
                                type="number"
                                step="0.01"
                                value={formData.amount}
                                onChange={(e) => setFormData({...formData, amount: Number(e.target.value)})}
                                className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-bold text-slate-900 dark:text-white"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Descripción / Proveedor</label>
                        <input 
                            type="text"
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-bold text-slate-900 dark:text-white"
                        />
                    </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Package className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Líneas Detectadas
                        </h3>
                        <button onClick={addEmptyMaterial} className="text-xs font-bold text-[#0047AB] dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                            + Añadir
                        </button>
                    </div>
                    
                    <div className="space-y-3">
                        {detectedMaterials.map((mat, idx) => (
                            <div key={mat.id} className={`p-3 rounded-xl border flex gap-3 items-center transition-all ${mat.addToStock ? 'bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-600' : 'bg-slate-100/50 dark:bg-slate-800/50 border-transparent opacity-80'}`}>
                                <div className="flex-1 space-y-2">
                                    <input 
                                        value={mat.name}
                                        onChange={(e) => updateMaterial(idx, 'name', e.target.value)}
                                        className="w-full bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-[#0047AB] outline-none text-sm font-bold text-slate-800 dark:text-white pb-1"
                                        placeholder="Descripción"
                                    />
                                    <div className="flex gap-2">
                                        <input 
                                            type="number"
                                            value={mat.quantity}
                                            onChange={(e) => updateMaterial(idx, 'quantity', Number(e.target.value))}
                                            className="w-16 bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-[#0047AB] outline-none text-xs text-slate-600 dark:text-slate-300 pb-1 text-center"
                                            placeholder="Cant"
                                        />
                                        <input 
                                            value={mat.unit}
                                            onChange={(e) => updateMaterial(idx, 'unit', e.target.value)}
                                            className="w-16 bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-[#0047AB] outline-none text-xs text-slate-600 dark:text-slate-300 pb-1 text-center"
                                            placeholder="Ud"
                                        />
                                        <input 
                                            type="number"
                                            step="0.01"
                                            value={mat.pricePerUnit}
                                            onChange={(e) => updateMaterial(idx, 'pricePerUnit', Number(e.target.value))}
                                            className="flex-1 bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-[#0047AB] outline-none text-xs text-slate-600 dark:text-slate-300 pb-1 text-right"
                                            placeholder="Precio/u"
                                        />
                                    </div>
                                </div>
                                
                                <div className="flex flex-col gap-1 items-center">
                                    <button 
                                        onClick={() => toggleAddToStock(idx)}
                                        className={`p-2 rounded-lg transition-colors ${mat.addToStock ? 'text-[#0047AB] dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                                        title={mat.addToStock ? "Se añadirá al Inventario" : "Solo gasto (No inventariable)"}
                                    >
                                        {mat.addToStock ? <ArchiveRestore className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                                    </button>
                                    <button onClick={() => removeMaterial(idx)} className="text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {detectedMaterials.length === 0 && (
                            <p className="text-center text-xs text-slate-400 italic py-2">No se detectaron líneas automáticamente.</p>
                        )}
                        <p className="text-[10px] text-slate-400 text-center mt-2 flex items-center justify-center gap-1">
                            <ArchiveRestore className="w-3 h-3" /> Marcado: Se añade a Stock | <Ban className="w-3 h-3" /> Desmarcado: Solo Gasto
                        </p>
                    </div>
                </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex gap-3 shrink-0">
            {step === 'form' ? (
                <>
                    <button 
                        onClick={() => setStep('capture')}
                        className="flex-1 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={isUploading}
                        className="flex-[2] py-3 bg-[#0047AB] text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 hover:bg-[#003380] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {isUploading ? 'Guardando...' : 'Guardar Todo'}
                    </button>
                </>
            ) : step === 'review' ? (
                <>
                    <button 
                        onClick={() => { setFileData(null); setStep('capture'); }}
                        className="flex-1 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" /> Repetir
                    </button>
                </>
            ) : (
                <button onClick={handleClose} className="w-full py-3 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                    Cerrar
                </button>
            )}
        </div>

      </div>
    </div>
  );
};

export default ScannerModal;