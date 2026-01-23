import React, { useState, useRef, useEffect } from 'react';
import { Project, Transaction, Material } from '../types';
import { Camera, X, Loader2, Save, Image as ImageIcon, Package, Trash2, Plus, RefreshCw, Upload } from 'lucide-react';
import { analyzeReceiptImage } from '../services/geminiService';

interface ScannerModalProps {
  projects: Project[];
  onClose: () => void;
  onSave: (projectId: string, transaction: Transaction, newMaterials: Material[]) => void;
}

const ScannerModal: React.FC<ScannerModalProps> = ({ projects, onClose, onSave }) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [step, setStep] = useState<'capture' | 'review' | 'form'>('capture');
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    amount: 0,
    description: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    projectId: projects[0]?.id || ''
  });

  // Detected Materials State
  const [detectedMaterials, setDetectedMaterials] = useState<Material[]>([]);

  // Cleanup camera on unmount or close
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
          facingMode: 'environment', // Prefer back camera
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      
      streamRef.current = stream;
      
      // Delay slightly to ensure ref is mounted
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);

    } catch (err) {
      console.error("Error accessing camera:", err);
      setIsCameraActive(false);
      
      // Handle specific permission errors
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
      
      // Check if video is ready
      if (video.videoWidth === 0 || video.videoHeight === 0) {
          return;
      }

      // Set canvas dimensions to match video source dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw video frame to canvas
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64
        const base64String = canvas.toDataURL('image/jpeg', 0.85); // 0.85 quality
        
        stopCamera();
        setImagePreview(base64String);
        setStep('review');
        analyzeImage(base64String);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImagePreview(base64String);
        setStep('review');
        analyzeImage(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async (base64: string) => {
    setIsAnalyzing(true);
    try {
      const data = await analyzeReceiptImage(base64);
      
      // Update basic transaction info
      setFormData(prev => ({
        ...prev,
        amount: data.amount || 0,
        description: data.description || '',
        category: data.category || 'Material',
        date: data.date || prev.date
      }));

      // Update detected materials if any
      if (data.items && Array.isArray(data.items)) {
          const newMats: Material[] = data.items.map((item: any) => ({
              id: Date.now().toString() + Math.random(),
              projectId: '', // Will update on submit
              name: item.name || 'Material detectado',
              quantity: item.quantity ? Number(item.quantity) : 1, // Ensure number
              unit: item.unit || 'ud',
              pricePerUnit: item.pricePerUnit ? Number(item.pricePerUnit) : 0,
              minStock: 5 // Default
          }));
          setDetectedMaterials(newMats);
      }

      setStep('form');
    } catch (error) {
      console.error(error);
      alert("No se pudo analizar la imagen correctamente. Por favor, rellena los datos manualmente.");
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
          id: Date.now().toString() + Math.random(),
          projectId: '',
          name: '',
          quantity: 1,
          unit: 'ud',
          pricePerUnit: 0,
          minStock: 5
      }]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.projectId) {
      alert("Selecciona un proyecto");
      return;
    }

    const newTransaction: Transaction = {
      id: Date.now().toString(),
      projectId: formData.projectId,
      type: 'expense', // Default to expense for receipts
      category: formData.category,
      amount: Number(formData.amount),
      date: formData.date,
      description: formData.description
    };

    const finalMaterials = detectedMaterials.map(m => ({
        ...m,
        projectId: formData.projectId
    }));

    onSave(formData.projectId, newTransaction, finalMaterials);
  };

  const handleClose = () => {
      stopCamera();
      onClose();
  }

  return (
    <div className="fixed inset-0 bg-slate-900/90 flex items-center justify-center p-0 sm:p-4 z-50 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-800 rounded-none sm:rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[90vh] border border-slate-200 dark:border-slate-700 transition-colors">
        
        {/* Header */}
        <div className="bg-[#0047AB] p-5 flex justify-between items-center text-white shadow-lg z-10 shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Camera className="w-6 h-6" /> Escáner Inteligente
          </h2>
          <button onClick={handleClose} className="hover:bg-white/20 p-2 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 overflow-y-auto relative">
          
          {/* STEP 1: CAPTURE (Live Camera or Upload) */}
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
                        
                        {/* Overlay Controls */}
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
                            {/* Placeholder for camera switch if needed later */}
                            <div className="w-14"></div> 
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center space-y-8 py-12 px-6 h-full">
                        <div className="w-28 h-28 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-500 mb-2 shadow-sm border border-slate-100 dark:border-slate-600">
                            <ImageIcon className="w-12 h-12" />
                        </div>
                        
                        <div className="w-full space-y-4">
                            <button 
                                onClick={startCamera}
                                className="w-full bg-[#0047AB] text-white py-4 rounded-2xl font-bold shadow-xl shadow-blue-900/20 hover:bg-[#003380] transition-transform active:scale-95 flex items-center justify-center gap-3 text-lg"
                            >
                                <Camera className="w-6 h-6" /> Abrir Cámara
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
                                accept="image/*" 
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden" 
                            />
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-4 rounded-2xl font-bold border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-3"
                            >
                                <Upload className="w-5 h-5" /> Subir de Galería
                            </button>
                        </div>
                        
                        <p className="text-center text-slate-400 dark:text-slate-500 text-sm mt-4">
                            La IA analizará el ticket o material automáticamente.
                        </p>
                    </div>
                )}
            </div>
          )}

          {/* STEP 2: ANALYZING */}
          {step === 'review' && (
            <div className="flex flex-col items-center justify-center space-y-6 py-8 h-full">
               {imagePreview && (
                 <img src={imagePreview} alt="Preview" className="w-64 h-auto object-contain rounded-2xl shadow-lg border-4 border-white dark:border-slate-700" />
               )}
               <div className="flex items-center gap-3 text-[#0047AB] dark:text-blue-400 font-bold animate-pulse text-lg">
                 <Loader2 className="w-6 h-6 animate-spin" />
                 Analizando con IA...
               </div>
            </div>
          )}

          {/* STEP 3: FORM */}
          {step === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-6 p-6">
              
              {/* Project Select - Sticky or Top */}
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

              {/* Transaction Section */}
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
                 <h3 className="text-sm font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">Datos Económicos</h3>
                 <div className="flex gap-4">
                    <div className="w-1/2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase">Importe Total (€)</label>
                       <input 
                         type="number" 
                         step="0.01"
                         value={formData.amount}
                         onChange={(e) => setFormData({...formData, amount: Number(e.target.value)})}
                         className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg font-bold text-slate-900 dark:text-white text-lg focus:ring-2 focus:ring-[#0047AB] transition-all outline-none" 
                       />
                    </div>
                    <div className="w-1/2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha</label>
                       <input 
                         type="date" 
                         value={formData.date}
                         onChange={(e) => setFormData({...formData, date: e.target.value})}
                         className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0047AB] transition-all outline-none" 
                       />
                    </div>
                 </div>
                 <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Descripción</label>
                    <input 
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-[#0047AB] transition-all outline-none" 
                    />
                 </div>
              </div>

              {/* Detected Stock Section */}
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
                 <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Package className="w-4 h-4 text-[#0047AB] dark:text-blue-400" /> Stock Detectado
                    </h3>
                    <button type="button" onClick={addEmptyMaterial} className="text-xs text-[#0047AB] dark:text-blue-400 font-bold flex items-center hover:underline">
                        <Plus className="w-3 h-3 mr-1" /> Añadir
                    </button>
                 </div>
                 
                 {detectedMaterials.length === 0 ? (
                     <p className="text-center text-xs text-slate-400 py-4">No se han detectado materiales específicos para inventario.</p>
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
                 <button type="submit" className="flex-1 py-3 text-white bg-green-600 rounded-xl hover:bg-green-700 shadow-lg shadow-green-200 dark:shadow-green-900/30 font-bold flex items-center justify-center gap-2 transition-transform active:scale-95">
                    <Save className="w-5 h-5" /> Guardar Todo
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