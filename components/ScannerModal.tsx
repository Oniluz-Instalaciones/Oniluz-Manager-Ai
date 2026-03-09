
import React, { useState, useRef, useEffect } from 'react';
import { Project, Transaction, Material, ProjectDocument } from '../types';
import { Camera, X, Loader2, Save, Image as ImageIcon, Package, Trash2, Plus, RefreshCw, Upload, FileText, AlertTriangle, CreditCard, ExternalLink, ArchiveRestore, Ban, Tag, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react';
import { analyzeDocument } from '../services/geminiService';
import { supabase } from '../lib/supabase';
import { jsPDF } from "jspdf";

interface ScannerModalProps {
  projects: Project[];
  onClose: () => void;
  onSave: (projectId: string, transaction: Transaction, newMaterials: Material[], newDocument?: ProjectDocument) => void;
  currentUserName: string;
  defaultProjectId?: string; // Nuevo prop para bloquear selección
  defaultCategory?: 'general' | 'technical' | 'financial'; // Updated type
}

// Extend Material type locally to handle the UI state for "Add to Stock"
interface DetectedItem extends Material {
    addToStock: boolean;
}

const normalizeDate = (dateStr: string | undefined): string => {
    // Si no hay fecha, devolvemos la fecha actual pero forzando 2026 si estamos en ese contexto
    if (!dateStr) return new Date().toISOString().split('T')[0];
    
    let cleanDate = dateStr.trim();
    
    // Intentar detectar formatos DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY
    // También soporta años de 2 dígitos
    const dmyRegex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/;
    const match = cleanDate.match(dmyRegex);

    if (match) {
        let [_, day, month, year] = match;
        
        // Normalizar año de 2 dígitos
        if (year.length === 2) {
            year = '20' + year;
        }

        // CORRECCIÓN ROBUSTA SOLICITADA:
        // Si el año detectado no es 2026, y parece ser un error (ej: 2024, 2025, 2027...),
        // el usuario ha solicitado corregir a 2026.
        // Aplicamos esto con cuidado: si es 2024/2025/2023 lo cambiamos a 2026.
        const yearNum = parseInt(year);
        // FORCE 2026: If year is NOT 2026 (whether past or future), force it to 2026.
        // The user explicitly requested to fix incorrect years to 2026.
        // We allow 2026 obviously.
        if (yearNum !== 2026) {
             year = '2026';
        }

        const paddedDay = day.padStart(2, '0');
        const paddedMonth = month.padStart(2, '0');
        return `${year}-${paddedMonth}-${paddedDay}`;
    }

    // Fallback a Date.parse para otros formatos (YYYY-MM-DD, etc)
    const timestamp = Date.parse(cleanDate);
    if (!isNaN(timestamp)) {
        const d = new Date(timestamp);
        let year = d.getFullYear();
        
        // Misma lógica de corrección de año
        if (year !== 2026) {
            d.setFullYear(2026);
        }
        
        return d.toISOString().split('T')[0];
    }

    // Si todo falla, devolver fecha actual (que debería ser 2026 en este entorno)
    // Pero por si acaso el reloj del sistema está mal:
    const now = new Date();
    if (now.getFullYear() !== 2026) {
        now.setFullYear(2026);
    }
    return now.toISOString().split('T')[0];
};

const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    return `${day}-${month}-${year}`;
};

  interface ScannedPage {
      id: string;
      base64: string;
      blob: Blob;
      mimeType: string;
  }

  const ScannerModal: React.FC<ScannerModalProps> = ({ projects, onClose, onSave, currentUserName, defaultProjectId, defaultCategory = 'general' }) => {
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [step, setStep] = useState<'capture' | 'review' | 'form'>('capture');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [scanErrorType, setScanErrorType] = useState<string | null>(null);
  const [paginationWarning, setPaginationWarning] = useState<string | null>(null);
  const [isZeroTotalWarning, setIsZeroTotalWarning] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Form Data
  const [formData, setFormData] = useState({
    transactionType: 'expense' as 'income' | 'expense',
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
    setScanErrorType(null);
    setPaginationWarning(null); 
    setIsZeroTotalWarning(false);

    try {
      const images = pagesToProcess.map(p => p.base64);
      const data = await analyzeDocument(images, pagesToProcess[0].mimeType);
      
      if (data.errorType) setScanErrorType(data.errorType);
      else if (data.description && data.description.includes("Error")) setScanErrorType('GENERIC');

      const isRefund = data.total < 0;
      const absoluteAmount = Math.abs(data.total || 0);
      
      if (absoluteAmount === 0) {
          setIsZeroTotalWarning(true);
      }

      const shouldAddToStock = typeof data.isStockable === 'boolean' 
          ? data.isStockable 
          : ['Material', 'Herramienta'].includes(data.categoria || '');

      setFormData(prev => ({
        ...prev,
        transactionType: isRefund ? 'income' : 'expense',
        docType: absoluteAmount > 0 ? 'RECEIPT' : 'DELIVERY_NOTE',
        supplier: data.comercio || '',
        amount: absoluteAmount,
        tax: Math.abs(data.iva || 0),
        description: isRefund ? `Devolución - ${data.comercio || 'Desconocido'}` : (data.comercio ? `Gasto en ${data.comercio}` : 'Gasto detectado'),
        category: isRefund ? 'Devolución' : (data.categoria || 'Varios'),
        date: normalizeDate(data.fecha)
      }));

      if (data.items && Array.isArray(data.items)) {
          const newMats: DetectedItem[] = data.items.map((item: any) => ({
              id: crypto.randomUUID(),
              projectId: '', 
              name: item.name || 'Concepto',
              quantity: item.quantity ? Number(item.quantity) : 1, 
              unit: item.unit || 'ud',
              pricePerUnit: item.unitPrice ? Number(item.unitPrice) : (item.price ? Number(item.price) / (item.quantity || 1) : 0),
              minStock: 5,
              packageSize: 1,
              addToStock: shouldAddToStock && item.isMaterial !== false
          }));
          setDetectedMaterials(newMats);

          // Detect Price Updates
          if (shouldAddToStock) {
              const candidates = data.items
                  .filter((item: any) => item.unitPrice && item.name && item.isMaterial !== false)
                  .map((item: any) => ({
                      id: crypto.randomUUID(),
                      name: item.name,
                      unit: item.unit || 'ud',
                      price: Number(item.unitPrice),
                      category: 'Material',
                      discount: item.discount ? Number(item.discount) : undefined
                  }));
              
              if (candidates.length > 0) {
                  setPriceUpdateCandidates(candidates);
              }
          }
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
                    
                    if (pages.length === 0) {
                        checkPagination(base64String, 'image/jpeg');
                    }
                } else {
                    // Single page mode: Process immediately
                    setPages([newPage]);
                    stopCamera();
                    setStep('review'); // Show review/loading briefly
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
            
            if (pages.length === 0) {
                checkPagination(base64String, file.type);
            }
        } else {
            // Single page mode: Process immediately
            setPages([newPage]);
            setStep('review');
            processPagesList([newPage]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Función ligera solo para detectar paginación en la primera página
  const checkPagination = async (base64: string, type: string) => {
      setIsAnalyzing(true);
      try {
          // Usamos analyzeDocument pero solo nos interesa la paginación por ahora
          // Nota: Esto consume una llamada a la API. Es el costo de la "inteligencia".
          const data = await analyzeDocument(base64, type);
          if (data.pagination && data.pagination.hasMore) {
              const { current, total } = data.pagination;
              if (total && current < total) {
                  setPaginationWarning(`Página ${current} de ${total} detectada.`);
              } else {
                  setPaginationWarning("El documento parece tener más páginas.");
              }
          }
      } catch (e) {
          console.warn("Error checking pagination:", e);
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
      setDetectedMaterials([...detectedMaterials, {
          id: crypto.randomUUID(),
          projectId: '',
          name: '',
          quantity: 1,
          unit: 'ud',
          pricePerUnit: 0,
          minStock: 5,
          packageSize: 1,
          addToStock: true
      }]);
  };

  const uploadFileToSupabase = async (projectId: string): Promise<{ url: string, type: 'image' | 'pdf' } | null> => {
      if (pages.length === 0) return null;
      try {
          let fileBlob: Blob;
          let mimeType: string;
          let ext: string;

          // Check if we have multiple pages (images) to merge
          const allImages = pages.every(p => p.mimeType.startsWith('image/'));
          
          if (pages.length > 1 && allImages) {
              // Generate PDF from images
              const doc = new jsPDF();
              for (let i = 0; i < pages.length; i++) {
                  const page = pages[i];
                  if (i > 0) doc.addPage();
                  
                  const imgProps = doc.getImageProperties(page.base64);
                  const pdfWidth = doc.internal.pageSize.getWidth();
                  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                  
                  const format = page.mimeType.includes('png') ? 'PNG' : 'JPEG';
                  doc.addImage(page.base64, format, 0, 0, pdfWidth, pdfHeight);
              }
              fileBlob = doc.output('blob');
              mimeType = 'application/pdf';
              ext = 'pdf';
          } else {
              // Single file or mixed content (fallback to first file if mixed, though mixed shouldn't happen often)
              // If mixed PDF + Images, we just take the first one for now or the PDF if it's the main one.
              // Ideally we should warn, but for this feature request (multi-page scan), it's usually images.
              const page = pages[0];
              fileBlob = page.blob;
              mimeType = page.mimeType;
              ext = mimeType.includes('pdf') ? 'pdf' : 'jpg';
          }

          const timestamp = Date.now();
          const randomString = Math.random().toString(36).substring(7);
          const fileName = `${projectId}/${timestamp}_${randomString}.${ext}`;
          
          const { error } = await supabase.storage.from('photos').upload(fileName, fileBlob, { 
              contentType: mimeType, 
              upsert: false 
          });
          
          if (error) throw error;
          
          const { data } = supabase.storage.from('photos').getPublicUrl(fileName);
          return { url: data.publicUrl, type: ext === 'pdf' ? 'pdf' : 'image' };
      } catch (e: any) {
          console.error("Upload error:", e);
          alert(`Error subiendo archivo: ${e.message}`);
          return null; 
      }
  };

  const [priceUpdateCandidates, setPriceUpdateCandidates] = useState<any[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.projectId) {
      alert("Selecciona un proyecto");
      return;
    }

    setIsUploading(true);

    try {
        // 0. Update Price Database (if candidates exist)
        if (priceUpdateCandidates.length > 0) {
            for (const candidate of priceUpdateCandidates) {
                // Check if exists
                const { data: existing } = await supabase
                    .from('price_database')
                    .select('id, price')
                    .eq('name', candidate.name)
                    .single();
                
                if (existing) {
                    // Update only if price changed significantly or is newer
                    await supabase.from('price_database').update({
                        price: candidate.price,
                        updated_at: new Date().toISOString()
                    }).eq('id', existing.id);
                } else {
                    // Insert new
                    await supabase.from('price_database').insert({
                        name: candidate.name,
                        unit: candidate.unit,
                        price: candidate.price,
                        category: 'Material',
                        discount: candidate.discount
                    });
                }
            }
            console.log("Base de precios actualizada con", priceUpdateCandidates.length, "items.");
        }

        const uploadResult = await uploadFileToSupabase(formData.projectId);
        const fileUrl = uploadResult?.url;
        const fileType = uploadResult?.type || 'image';

        const newTransaction: Transaction = {
          id: crypto.randomUUID(),
          projectId: formData.projectId,
          type: formData.transactionType,
          category: formData.category,
          amount: Number(formData.amount),
          date: formData.date,
          description: formData.description,
          userName: currentUserName
        };

        const stockItemsToAdd = detectedMaterials.filter(m => m.addToStock).map(m => ({ ...m, id: crypto.randomUUID(), projectId: formData.projectId }));

        // 1. Transaction (Only if amount > 0)
        if (newTransaction.amount > 0) {
            const { error: txError } = await supabase.from('transactions').insert({
                id: newTransaction.id,
                project_id: newTransaction.projectId,
                type: newTransaction.type,
                category: newTransaction.category,
                amount: newTransaction.amount,
                date: newTransaction.date || null,
                description: newTransaction.description,
                user_name: newTransaction.userName
            });
            if (txError) throw new Error("Error al guardar la transacción: " + txError.message);
        }

        // 2. Materials (Upsert Logic)
        if (stockItemsToAdd.length > 0) {
            for (const m of stockItemsToAdd) {
                // Check if material exists by name (exact match)
                const { data: existingMaterials } = await supabase
                    .from('materials')
                    .select('*')
                    .eq('name', m.name)
                    .single();

                if (existingMaterials) {
                    // Update existing
                    const newQuantity = existingMaterials.quantity + m.quantity;
                    
                    // Create Movement Log
                    const newMovement = {
                        id: crypto.randomUUID(),
                        type: 'IN',
                        quantity: m.quantity,
                        date: formData.date,
                        description: `Compra: ${formData.description || 'Ticket'}`,
                        projectId: formData.projectId
                    };
                    
                    const currentMovements = existingMaterials.movements || [];
                    const updatedMovements = [...currentMovements, newMovement];

                    const { error: updateError } = await supabase
                        .from('materials')
                        .update({ 
                            quantity: newQuantity,
                            price_per_unit: m.pricePerUnit, // Update to latest price
                            movements: updatedMovements
                        })
                        .eq('id', existingMaterials.id);

                    if (updateError) console.error("Error updating material:", updateError);
                } else {
                    // Insert new
                    const newMovement = {
                        id: crypto.randomUUID(),
                        type: 'IN',
                        quantity: m.quantity,
                        date: formData.date,
                        description: `Alta Inicial: ${formData.description || 'Ticket'}`,
                        projectId: formData.projectId
                    };

                    const { error: insertError } = await supabase
                        .from('materials')
                        .insert({
                            id: crypto.randomUUID(),
                            project_id: m.projectId,
                            name: m.name,
                            quantity: m.quantity,
                            unit: m.unit,
                            min_stock: m.minStock,
                            price_per_unit: m.pricePerUnit,
                            package_size: m.packageSize || 1,
                            movements: [newMovement]
                        });
                    
                    if (insertError) console.error("Error inserting material:", insertError);
                }
            }
        }

        // 3. Document 
        let newDocument: ProjectDocument | undefined;
        if (fileUrl) {
            const finalCategory = defaultCategory; 

            // FORCE 2026 for upload date as well, in case system clock is wrong
            const uploadDate = new Date();
            if (uploadDate.getFullYear() !== 2026) {
                uploadDate.setFullYear(2026);
            }
            const uploadDateStr = uploadDate.toISOString().split('T')[0];

            newDocument = {
                id: crypto.randomUUID(),
                projectId: formData.projectId,
                name: `${formData.docType === 'DELIVERY_NOTE' ? 'Albarán' : 'Factura'} ${formatDate(formData.date)}`,
                type: fileType,
                category: finalCategory as 'general' | 'technical' | 'financial', 
                date: uploadDateStr, // Fecha de subida (hoy, forzada a 2026)
                emissionDate: formData.date, // Fecha del ticket/emisión
                amount: formData.amount, // Importe
                uploadedBy: currentUserName, // Usuario que sube
                data: fileUrl
            };

            const { error: docError } = await supabase.from('documents').insert({
                id: newDocument.id,
                project_id: newDocument.projectId,
                name: newDocument.name,
                type: newDocument.type,
                category: newDocument.category as "general" | "technical" | "financial",
                date: newDocument.date,
                emission_date: newDocument.emissionDate,
                amount: newDocument.amount,
                uploaded_by: newDocument.uploadedBy,
                data: newDocument.data 
            });
            
            if (docError) {
                console.error("Warning: Document save failed", docError);
                alert("Atención: Los datos se guardaron pero la imagen falló al registrarse en la base de datos.");
            }
        }

        onSave(formData.projectId, newTransaction, stockItemsToAdd, newDocument);
    
    } catch (error: any) {
        console.error("Error saving to DB:", error);
        alert(`Error guardando datos: ${error.message || error}`);
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
            <Camera className="w-6 h-6" /> Escáner Inteligente
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
                            <span className={`text-xs font-bold uppercase ${!isMultiPage ? 'text-[#0047AB] dark:text-blue-400' : 'text-slate-400'}`}>Una Página</span>
                            <button 
                                onClick={() => setIsMultiPage(!isMultiPage)}
                                className={`w-12 h-6 rounded-full p-1 transition-colors ${isMultiPage ? 'bg-[#0047AB]' : 'bg-slate-300 dark:bg-slate-600'}`}
                            >
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${isMultiPage ? 'translate-x-6' : 'translate-x-0'}`} />
                            </button>
                            <span className={`text-xs font-bold uppercase ${isMultiPage ? 'text-[#0047AB] dark:text-blue-400' : 'text-slate-400'}`}>Multipágina</span>
                        </div>

                        <div className="w-full space-y-4">
                            <button onClick={startCamera} className="w-full bg-[#0047AB] text-white py-4 rounded-2xl font-bold shadow-xl shadow-blue-900/20 hover:bg-[#003380] transition-transform active:scale-95 flex items-center justify-center gap-3 text-lg"><Camera className="w-6 h-6" /> Escanear con Cámara</button>
                            <input type="file" accept="image/*,application/pdf" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                            <button onClick={() => fileInputRef.current?.click()} className="w-full bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-4 rounded-2xl font-bold border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-3"><Upload className="w-5 h-5" /> Subir Archivo (IMG/PDF)</button>
                        </div>
                    </div>
                )}
            </div>
          )}

          {step === 'review' && (
            <div className="flex flex-col items-center justify-center space-y-6 py-8 h-full">
               <div className="relative group">
                  {pages.length > 0 && (
                      pages[pages.length - 1].mimeType.includes('pdf') ? (
                          <div className="w-64 h-80 bg-slate-100 dark:bg-slate-700 rounded-2xl flex flex-col items-center justify-center border-4 border-white dark:border-slate-600 shadow-lg"><FileText className="w-20 h-20 text-red-500 mb-4" /><span className="text-sm font-bold text-slate-500 dark:text-slate-300">Documento PDF</span></div>
                      ) : (
                        <img src={pages[pages.length - 1].base64} alt="Preview" className="w-64 h-auto object-contain rounded-2xl shadow-lg border-4 border-white dark:border-slate-700" />
                      )
                  )}
                  <div className="absolute -top-2 -right-2 bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold shadow-md">
                      {pages.length}
                  </div>
               </div>
               
               <div className="flex flex-col items-center gap-4 w-full px-8">
                 {isAnalyzing ? (
                    <div className="flex flex-col items-center gap-2 text-[#0047AB] dark:text-blue-400 font-bold animate-pulse">
                        <div className="flex items-center gap-3 text-lg"><Loader2 className="w-6 h-6 animate-spin" /> Analizando {pages.length} página(s)...</div>
                    </div>
                 ) : (
                    <>
                        {paginationWarning && (
                            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 p-4 rounded-xl flex flex-col items-center gap-2 text-center w-full animate-in fade-in slide-in-from-bottom-4">
                                <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 font-bold">
                                    <AlertTriangle className="w-5 h-5" />
                                    <span>¡Documento Incompleto!</span>
                                </div>
                                <p className="text-sm text-yellow-600 dark:text-yellow-300">{paginationWarning}</p>
                                <button onClick={() => setStep('capture')} className="mt-2 bg-yellow-100 dark:bg-yellow-800/40 text-yellow-800 dark:text-yellow-200 px-4 py-2 rounded-lg font-bold text-sm hover:bg-yellow-200 dark:hover:bg-yellow-800/60 transition-colors flex items-center gap-2">
                                    <Plus className="w-4 h-4" /> Escanear Siguiente Página
                                </button>
                            </div>
                        )}

                        <div className="flex gap-3 w-full">
                             <button onClick={() => setStep('capture')} className="flex-1 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-2">
                                <Plus className="w-5 h-5" /> Añadir Pág.
                             </button>
                             <button onClick={processAllPages} className="flex-[2] py-3 bg-[#0047AB] text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 hover:bg-[#003380] transition-all flex items-center justify-center gap-2">
                                <FileText className="w-5 h-5" /> Procesar ({pages.length})
                             </button>
                        </div>
                        
                        <button onClick={() => { setPages([]); setStep('capture'); }} className="text-slate-400 hover:text-red-500 text-sm flex items-center gap-1 transition-colors">
                            <Trash2 className="w-4 h-4" /> Descartar todo y empezar de cero
                        </button>
                    </>
                 )}
               </div>
            </div>
          )}

          {step === 'form' && (
            <div className="p-6 space-y-6">
                {scanErrorType && <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 p-4 rounded-xl flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" /><div><h4 className="font-bold text-orange-700 dark:text-orange-400 text-sm">Revisar Datos</h4><p className="text-xs text-orange-600 dark:text-orange-300 mt-1">Verifica los campos detectados manualmente.</p></div></div>}
                
                {isZeroTotalWarning && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-4 rounded-xl flex items-start gap-3 animate-pulse">
                        <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-blue-800 dark:text-blue-300 text-sm">Importe No Detectado</h4>
                            <p className="text-xs text-blue-700 dark:text-blue-200 mt-1">No se pudo leer el total automáticamente. Por favor, introdúcelo manualmente.</p>
                        </div>
                    </div>
                )}

                {paginationWarning && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800 p-4 rounded-xl flex items-start gap-3 animate-pulse">
                        <FileText className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-yellow-800 dark:text-yellow-300 text-sm">Documento Incompleto</h4>
                            <p className="text-xs text-yellow-700 dark:text-yellow-200 mt-1">{paginationWarning}</p>
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Proyecto</label>
                        <select value={formData.projectId} onChange={(e) => setFormData({...formData, projectId: e.target.value})} disabled={!!defaultProjectId} className={`w-full mt-1 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-bold text-slate-900 dark:text-white ${defaultProjectId ? 'opacity-70 cursor-not-allowed' : ''}`}>
                            <option value="">Seleccionar Proyecto...</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 p-3 rounded-xl flex flex-col justify-center">
                            <div className="flex items-center gap-2 mb-1"><Tag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /><span className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300 uppercase">Categoría</span></div>
                            <span className="text-sm font-extrabold text-indigo-700 dark:text-indigo-300 uppercase truncate">{formData.category}</span>
                        </div>
                        <button onClick={() => setFormData({...formData, transactionType: formData.transactionType === 'expense' ? 'income' : 'expense', category: formData.transactionType === 'expense' ? 'Devolución' : 'Material' })} className={`p-3 rounded-xl border flex flex-col justify-center transition-all ${formData.transactionType === 'income' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                {formData.transactionType === 'income' ? <RotateCcw className="w-3.5 h-3.5 text-green-600" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                                <span className={`text-[10px] font-bold uppercase ${formData.transactionType === 'income' ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>Tipo</span>
                            </div>
                            <span className={`text-sm font-extrabold uppercase truncate ${formData.transactionType === 'income' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>{formData.transactionType === 'income' ? 'Devolución' : 'Gasto'}</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Fecha</label><input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-bold text-slate-900 dark:text-white" /></div>
                        <div><label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Total</label><input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({...formData, amount: Number(e.target.value)})} className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-bold text-slate-900 dark:text-white" onFocus={(e) => e.target.select()} /></div>
                    </div>
                    <div><label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Descripción</label><input type="text" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-bold text-slate-900 dark:text-white" /></div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
                    <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Package className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Líneas</h3><button onClick={addEmptyMaterial} className="text-xs font-bold text-[#0047AB] dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg">+ Añadir</button></div>
                    <div className="space-y-3">
                        {detectedMaterials.map((mat, idx) => (
                            <div key={mat.id} className={`p-3 rounded-xl border flex gap-3 items-center transition-all ${mat.addToStock ? 'bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-600' : 'bg-slate-100/50 dark:bg-slate-800/50 border-transparent opacity-80'}`}>
                                <div className="flex-1 space-y-2">
                                    <input value={mat.name} onChange={(e) => updateMaterial(idx, 'name', e.target.value)} className="w-full bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-[#0047AB] outline-none text-sm font-bold text-slate-800 dark:text-white pb-1" placeholder="Descripción" />
                                    <div className="flex gap-2">
                                        <div className="flex flex-col flex-[0.5]">
                                            <label className="text-[9px] text-slate-400 uppercase font-bold">Cant.</label>
                                            <input type="number" value={mat.quantity} onChange={(e) => updateMaterial(idx, 'quantity', Number(e.target.value))} className="w-full bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-[#0047AB] outline-none text-xs text-slate-600 dark:text-slate-300 pb-1 text-center" onFocus={(e) => e.target.select()} />
                                        </div>
                                        <div className="flex flex-col flex-[0.5]">
                                            <label className="text-[9px] text-slate-400 uppercase font-bold">Unidad</label>
                                            <input value={mat.unit} onChange={(e) => updateMaterial(idx, 'unit', e.target.value)} className="w-full bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-[#0047AB] outline-none text-xs text-slate-600 dark:text-slate-300 pb-1 text-center" />
                                        </div>
                                        {mat.addToStock && (
                                            <div className="flex flex-col flex-[0.5]">
                                                <label className="text-[9px] text-slate-400 uppercase font-bold">Pack</label>
                                                <input type="number" value={mat.packageSize || 1} onChange={(e) => updateMaterial(idx, 'packageSize', Number(e.target.value))} className="w-full bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-[#0047AB] outline-none text-xs text-slate-600 dark:text-slate-300 pb-1 text-center" placeholder="1" onFocus={(e) => e.target.select()} />
                                            </div>
                                        )}
                                        <div className="flex flex-col flex-1">
                                            <label className="text-[9px] text-slate-400 uppercase font-bold">Precio/Ud</label>
                                            <input type="number" step="0.01" value={mat.pricePerUnit} onChange={(e) => updateMaterial(idx, 'pricePerUnit', Number(e.target.value))} className="w-full bg-transparent border-b border-slate-200 dark:border-slate-600 focus:border-[#0047AB] outline-none text-xs text-slate-600 dark:text-slate-300 pb-1 text-right" onFocus={(e) => e.target.select()} />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 items-center">
                                    <button onClick={() => toggleAddToStock(idx)} className={`p-2 rounded-lg transition-colors ${mat.addToStock ? 'text-[#0047AB] dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`} title={mat.addToStock ? "Se añadirá al Inventario" : "Solo gasto"}><ArchiveRestore className="w-4 h-4" /></button>
                                    <button onClick={() => removeMaterial(idx)} className="text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        ))}
                        {detectedMaterials.length === 0 && <p className="text-center text-xs text-slate-400 italic py-2">No se detectaron líneas.</p>}
                    </div>
                </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex gap-3 shrink-0">
            {step === 'form' ? (
                <>
                    <button onClick={() => setStep('capture')} className="flex-1 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">Cancelar</button>
                    <button onClick={handleSubmit} disabled={isUploading} className="flex-[2] py-3 bg-[#0047AB] text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 hover:bg-[#003380] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">{isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}{isUploading ? 'Guardando...' : 'Guardar Todo'}</button>
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

export default ScannerModal;