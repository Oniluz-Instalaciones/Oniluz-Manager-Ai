import React, { useState, useRef, useEffect } from 'react';
import { Project, Transaction, Material } from '../types';
import { Camera, X, Loader2, Save, Image as ImageIcon, Package, Trash2, Plus, RefreshCw, Upload, FileText, AlertTriangle, CreditCard, ExternalLink } from 'lucide-react';
import { analyzeDocument } from '../services/geminiService';
import { supabase } from '../lib/supabase';

interface ScannerModalProps {
  projects: Project[];
  onClose: () => void;
  onSave: (projectId: string, transaction: Transaction, newMaterials: Material[]) => void;
}

const ScannerModal: React.FC<ScannerModalProps> = ({ projects, onClose, onSave }) => {
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
    docType: 'RECEIPT', 
    supplier: '',
    amount: 0,
    tax: 0,
    description: '',
    category: 'Material',
    date: new Date().toISOString().split('T')[0],
    projectId: projects[0]?.id || ''
  });

  const [detectedMaterials, setDetectedMaterials] = useState<Material[]>([]);

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

      setFormData(prev => ({
        ...prev,
        docType: data.total > 0 ? 'RECEIPT' : 'DELIVERY_NOTE',
        supplier: data.comercio || '',
        amount: data.total || 0,
        tax: data.iva || 0,
        description: data.comercio ? `Gasto en ${data.comercio}` : 'Gasto detectado',
        category: data.categoria || 'Material',
        date: data.fecha || prev.date
      }));

      if (data.items && Array.isArray(data.items)) {
          const newMats: Material[] = data.items.map((item: any) => ({
              id: crypto.randomUUID(),
              projectId: '', 
              name: item.name || 'Material',
              quantity: item.quantity ? Number(item.quantity) : 1, 
              unit: item.unit || 'ud',
              pricePerUnit: item.price ? Number(item.price) : 0,
              minStock: 5 
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

  const updateMaterial = (index: number, field: keyof Material, value: any) => {
      const updated = [...detectedMaterials];
      updated[index] = { ...updated[index], [field]: value };
      setDetectedMaterials(updated);
  };

  const removeMaterial = (index: number) => {
      const updated = [...detectedMaterials];
      updated.splice(index, 1);
      setDetectedMaterials(updated);
  };

  const addEmptyMaterial = () => {
      setDetectedMaterials([...detectedMaterials, {
          id: crypto.randomUUID(),
          projectId: '',
          name: '',
          quantity: 1,
          unit: 'ud',
          pricePerUnit: 0,
          minStock: 5
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
          type: 'expense', 
          category: formData.category,
          amount: Number(formData.amount),
          date: formData.date,
          description: formData.description
        };

        const finalMaterials = detectedMaterials.map(m => ({ ...m, projectId: formData.projectId }));

        await supabase.from('transactions').insert({
            project_id: newTransaction.projectId,
            type: newTransaction.type,
            category: newTransaction.category,
            amount: newTransaction.amount,
            date: newTransaction.date || null,
            description: newTransaction.description
        });

        if (finalMaterials.length > 0) {
            const matsForDb = finalMaterials.map(m => ({
                project_id: m.projectId,
                name: m.name,
                quantity: m.quantity,
                unit: m.unit,
                min_stock: m.minStock,
                price_per_unit: m.pricePerUnit
            }));
            await supabase.from('materials').insert(matsForDb);
        }

        if (fileUrl) {
            await supabase.from('documents').insert({
                project_id: formData.projectId,
                name: `${formData.docType === 'DELIVERY_NOTE' ? 'Albarán' : 'Factura'} ${formData.date}`,
                type: mimeType === 'application/pdf' ? 'pdf' : 'image',
                date: formData.date || null,
                data: fileUrl 
            });
        }

        onSave(formData.projectId, newTransaction, finalMaterials);
    
    } catch (error) {
        console.error("Error saving to DB:", error);
        alert("Error guardando datos en la nube.");
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
                 <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Detectando tipo, precios y materiales</span>
               </div>
            </div>
          )}

          {step === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-6 p-6">
              
              {/* Special Error Handling for Quota vs Generic */}
              {scanErrorType === 'QUOTA' && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-xl flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <CreditCard className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-bold text-red-800 dark:text-red-300">Límite Gratuito Alcanzado</h4>
                            <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                                Has superado la cuota gratuita de la IA. Para seguir usando el escáner automático, debes activar la facturación.
                            </p>
                        </div>
                      </div>
                      <a 
                        href="https://aistudio.google.com/app/billing" 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 py-2 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
                      >
                         <ExternalLink className="w-3 h-3" /> Activar Facturación en Google
                      </a>
                  </div>
              )}

              {scanErrorType === 'GENERIC' && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4 rounded-xl flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                          <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400">Escaneo Manual Activado</h4>
                          <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                              No se pudieron extraer datos automáticamente. Por favor, introduce los datos manualmente.
                          </p>
                      </div>
                  </div>
              )}

              <div className="flex items-center justify-between mb-2">
                 <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                     formData.docType === 'DELIVERY_NOTE' ? 'bg-orange-100 text-orange-700' :
                     formData.docType === 'BUDGET' ? 'bg-purple-100 text-purple-700' :
                     'bg-green-100 text-green-700'
                 }`}>
                     {formData.docType === 'DELIVERY_NOTE' ? 'Albarán' : formData.docType === 'BUDGET' ? 'Presupuesto' : 'Factura'}
                 </span>
                 {formData.supplier && <span className="text-xs font-bold text-slate-500">{formData.supplier}</span>}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Proyecto Destino</label>
                <select 
                  value={formData.projectId} 
                  onChange={(e) => setFormData({...formData, projectId: e.target.value})}
                  className="w-full mt-2 p-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white font-semibold shadow-sm transition-colors"
                  required
                >
                  <option value="" disabled>Selecciona un proyecto</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
                 <h3 className="text-sm font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">Datos Económicos</h3>
                 <div className="flex gap-4">
                    <div className="w-1/2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase">Total (€)</label>
                       <input 
                         type="number" 
                         step="0.01"
                         value={formData.amount}
                         onChange={(e) => setFormData({...formData, amount: Number(e.target.value)})}
                         className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg font-bold text-slate-900 dark:text-white text-lg focus:ring-2 focus:ring-[#0047AB] transition-all outline-none" 
                       />
                    </div>
                    <div className="w-1/2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase">IVA (€)</label>
                       <input 
                         type="number"
                         step="0.01"
                         value={formData.tax}
                         onChange={(e) => setFormData({...formData, tax: Number(e.target.value)})}
                         className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-[#0047AB] transition-all outline-none" 
                       />
                    </div>
                 </div>
                 <div className="flex gap-4">
                     <div className="w-2/3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Descripción</label>
                        <input 
                          value={formData.description}
                          onChange={(e) => setFormData({...formData, description: e.target.value})}
                          className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-[#0047AB] transition-all outline-none" 
                        />
                     </div>
                     <div className="w-1/3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha</label>
                        <input 
                          type="date" 
                          value={formData.date}
                          onChange={(e) => setFormData({...formData, date: e.target.value})}
                          className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-[#0047AB] transition-all outline-none" 
                        />
                     </div>
                 </div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
                 <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Package className="w-4 h-4 text-[#0047AB] dark:text-blue-400" /> Materiales
                    </h3>
                    <button type="button" onClick={addEmptyMaterial} className="text-xs text-[#0047AB] dark:text-blue-400 font-bold flex items-center hover:underline">
                        <Plus className="w-3 h-3 mr-1" /> Añadir
                    </button>
                 </div>
                 
                 {detectedMaterials.length === 0 ? (
                     <p className="text-center text-xs text-slate-400 py-4">No se han detectado materiales específicos.</p>
                 ) : (
                     <div className="space-y-3">
                         {detectedMaterials.map((mat, idx) => (
                             <div key={idx} className="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700 relative group transition-all hover:border-[#0047AB]/30">
                                 <button 
                                    type="button" 
                                    onClick={() => removeMaterial(idx)}
                                    className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                 >
                                     <Trash2 className="w-4 h-4" />
                                 </button>
                                 <input 
                                     placeholder="Nombre material"
                                     value={mat.name}
                                     onChange={(e) => updateMaterial(idx, 'name', e.target.value)}
                                     className="w-full bg-transparent border-none text-sm font-bold text-slate-800 dark:text-white p-0 focus:ring-0 placeholder-slate-300 focus:text-[#0047AB] transition-colors"
                                 />
                                 <div className="flex gap-2">
                                     <div className="w-1/3">
                                         <label className="text-[9px] uppercase text-slate-400 font-bold block mb-1">Cant.</label>
                                         <input 
                                             type="number"
                                             value={mat.quantity}
                                             onChange={(e) => updateMaterial(idx, 'quantity', Number(e.target.value))}
                                             className="w-full bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 text-xs p-1.5 focus:border-[#0047AB] focus:ring-1 focus:ring-[#0047AB] outline-none transition-all font-bold text-slate-700 dark:text-slate-200"
                                         />
                                     </div>
                                     <div className="w-1/3">
                                         <label className="text-[9px] uppercase text-slate-400 font-bold block mb-1">Ud.</label>
                                         <input 
                                             value={mat.unit}
                                             onChange={(e) => updateMaterial(idx, 'unit', e.target.value)}
                                             className="w-full bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 text-xs p-1.5 focus:border-[#0047AB] focus:ring-1 focus:ring-[#0047AB] outline-none transition-all text-slate-700 dark:text-slate-200"
                                         />
                                     </div>
                                     <div className="w-1/3">
                                         <label className="text-[9px] uppercase text-slate-400 font-bold block mb-1">Precio/u</label>
                                         <input 
                                             type="number"
                                             step="0.01"
                                             value={mat.pricePerUnit}
                                             onChange={(e) => updateMaterial(idx, 'pricePerUnit', Number(e.target.value))}
                                             className="w-full bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 text-xs p-1.5 focus:border-[#0047AB] focus:ring-1 focus:ring-[#0047AB] outline-none transition-all text-slate-700 dark:text-slate-200"
                                         />
                                     </div>
                                 </div>
                             </div>
                         ))}
                     </div>
                 )}
              </div>

              <div className="pt-2 flex gap-4">
                 <button type="button" onClick={() => setStep('capture')} className="flex-1 py-3 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 font-bold transition-colors">Reintentar</button>
                 <button type="submit" disabled={isUploading} className="flex-1 py-3 text-white bg-green-600 rounded-xl hover:bg-green-700 shadow-lg shadow-green-200 dark:shadow-green-900/30 font-bold flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {isUploading ? 'Guardando...' : 'Guardar Todo'}
                 </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};

export default ScannerModal;