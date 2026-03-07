
import React, { useRef, useState, useMemo } from 'react';
import { ProjectDocument, Project } from '../types';
import { FileText, Image as ImageIcon, Trash2, Upload, X, File, Loader2, Camera, Ruler, ExternalLink, AlertTriangle, Eye, Filter, ArrowUpDown, User, Edit2, Save, FolderInput, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DocumentManagerProps {
    project: Project;
    allProjects?: Project[];
    onUpdate: (updatedProject: Project) => void;
    onOpenScanner?: () => void;
    category?: 'general' | 'technical' | 'financial'; 
    currentUserName?: string;
}

type SortOption = 'dateDesc' | 'dateAsc' | 'emissionDesc' | 'emissionAsc' | 'amountDesc' | 'amountAsc';

const DocumentManager: React.FC<DocumentManagerProps> = ({ project, allProjects = [], onUpdate, onOpenScanner, category = 'general', currentUserName }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [editingDocId, setEditingDocId] = useState<string | null>(null);
    const [movingDocId, setMovingDocId] = useState<string | null>(null);
    const [targetProjectId, setTargetProjectId] = useState<string>('');
    const [editForm, setEditForm] = useState<{ emissionDate: string; amount: string; date: string }>({ emissionDate: '', amount: '', date: '' });
    
    // Filtering & Sorting State
    const [sortBy, setSortBy] = useState<SortOption>('dateDesc');
    const [filterText, setFilterText] = useState('');
    const [filterUploader, setFilterUploader] = useState<string>('all');

    // Filtrado estricto para mostrar solo lo que corresponde a esta pestaña
    const isDocumentInCurrentCategory = (doc: ProjectDocument) => {
        if (category === 'general') {
             if (doc.category === 'technical') return false;
             if (doc.name.startsWith('[TEC] ')) return false;
             return true; 
        }
        return doc.category === category;
    };

    const rawDocuments = (project.documents || []).filter(isDocumentInCurrentCategory);

    // Get unique uploaders for filter dropdown
    const uploaders = useMemo(() => {
        const users = new Set<string>();
        rawDocuments.forEach(d => {
            if (d.uploadedBy) users.add(d.uploadedBy);
        });
        return Array.from(users);
    }, [rawDocuments]);

    // Apply Filters and Sort
    const processedDocuments = useMemo(() => {
        let docs = [...rawDocuments];

        // 1. Filter by Text (Name or Uploader)
        if (filterText) {
            const lowerFilter = filterText.toLowerCase();
            docs = docs.filter(d => 
                d.name.toLowerCase().includes(lowerFilter) || 
                (d.uploadedBy && d.uploadedBy.toLowerCase().includes(lowerFilter))
            );
        }

        // 2. Filter by Uploader
        if (filterUploader !== 'all') {
            docs = docs.filter(d => d.uploadedBy === filterUploader);
        }

        // 3. Sort
        docs.sort((a, b) => {
            const parseDate = (dateStr: string | undefined) => {
                if (!dateStr) return 0;
                // Ensure date is parsed correctly regardless of format (YYYY-MM-DD or ISO)
                return new Date(dateStr).getTime();
            };

            const dateA = parseDate(a.date);
            const dateB = parseDate(b.date);
            const emissionA = parseDate(a.emissionDate || a.date);
            const emissionB = parseDate(b.emissionDate || b.date);

            switch (sortBy) {
                case 'dateDesc':
                    return dateB - dateA;
                case 'dateAsc':
                    return dateA - dateB;
                case 'emissionDesc':
                    return emissionB - emissionA;
                case 'emissionAsc':
                    return emissionA - emissionB;
                case 'amountDesc':
                    return (b.amount || 0) - (a.amount || 0);
                case 'amountAsc':
                    return (a.amount || 0) - (b.amount || 0);
                default:
                    return 0;
            }
        });

        return docs;
    }, [rawDocuments, filterText, filterUploader, sortBy]);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        return `${day}-${month}-${year}`;
    };

    const getDisplayName = (doc: ProjectDocument) => {
        return doc.name.replace('[TEC] ', '');
    };

    const startEditing = (doc: ProjectDocument) => {
        setEditingDocId(doc.id);
        setMovingDocId(null); // Close move if open
        setEditForm({
            emissionDate: doc.emissionDate || '',
            amount: doc.amount ? doc.amount.toString() : '',
            date: doc.date ? doc.date.split('T')[0] : ''
        });
    };

    const cancelEditing = () => {
        setEditingDocId(null);
        setEditForm({ emissionDate: '', amount: '', date: '' });
    };

    const startMoving = (doc: ProjectDocument) => {
        setMovingDocId(doc.id);
        setEditingDocId(null); // Close edit if open
        setTargetProjectId('');
    };

    const cancelMoving = () => {
        setMovingDocId(null);
        setTargetProjectId('');
    };

    const handleMoveDocument = async () => {
        if (!movingDocId || !targetProjectId) return;
        
        try {
            // 1. Update in DB
            const { error } = await supabase
                .from('documents')
                .update({ project_id: targetProjectId })
                .eq('id', movingDocId);
    
            if (error) throw error;
    
            // 2. Update Local State (Remove from current project)
            const updatedDocs = project.documents.filter(d => d.id !== movingDocId);
            onUpdate({ ...project, documents: updatedDocs });
            
            // 3. Reset State
            setMovingDocId(null);
            setTargetProjectId('');
            alert("Documento movido correctamente.");
    
        } catch (error: any) {
            console.error("Error moving document:", error);
            alert("Error al mover el documento: " + error.message);
        }
    };

    const saveEditing = async (docId: string) => {
        try {
            const amountVal = editForm.amount ? parseFloat(editForm.amount) : null;
            
            // 1. Update DB
            const { error } = await supabase
                .from('documents')
                .update({
                    emission_date: editForm.emissionDate || null,
                    amount: amountVal,
                    date: editForm.date ? new Date(editForm.date).toISOString() : undefined
                })
                .eq('id', docId);

            if (error) throw error;

            // 2. Update Local State
            const updatedDocs = project.documents.map(d => {
                if (d.id === docId) {
                    return { 
                        ...d, 
                        emissionDate: editForm.emissionDate || undefined, 
                        amount: amountVal || undefined,
                        date: editForm.date || d.date
                    };
                }
                return d;
            });

            onUpdate({ ...project, documents: updatedDocs });
            setEditingDocId(null);

        } catch (err: any) {
            console.error("Error updating document:", err);
            alert("Error al actualizar el documento: " + err.message);
        }
    };

    const uploadFileToStorage = async (file: File, projectId: string): Promise<string> => {
        // Limpiamos el nombre del archivo para evitar problemas con URLs
        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 50); 
        const timestamp = Date.now();
        const filePath = `${projectId}/${timestamp}_${cleanName}`;

        // 1. Subida
        const { error: uploadError } = await supabase.storage
            .from('photos')
            .upload(filePath, file, { 
                cacheControl: '3600', 
                upsert: true // Forzamos sobrescritura si existe para evitar error 409
            });

        if (uploadError) {
            console.error("Storage upload error:", uploadError);
            throw new Error(`Error de permisos o red al subir: ${uploadError.message}`);
        }

        // 2. Obtención de URL Pública
        const { data } = supabase.storage.from('photos').getPublicUrl(filePath);

        if (!data || !data.publicUrl) {
            throw new Error("El archivo se subió pero no se pudo generar el enlace público.");
        }

        return data.publicUrl;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setIsUploading(true);
            const files = Array.from(e.target.files);
            const newDocuments: ProjectDocument[] = [];
            let errorMessages: string[] = [];

            try {
                for (const file of files) {
                    try {
                        const fileObj = file as File;
                        const fileUrl = await uploadFileToStorage(fileObj, project.id);
                        
                        const type = fileObj.type.startsWith('image/') ? 'image' : fileObj.type === 'application/pdf' ? 'pdf' : 'other';
                        const newId = crypto.randomUUID();
                        const dateStr = new Date().toISOString().split('T')[0];
                        
                        // Objeto listo para DB
                        const docPayload: any = {
                            id: newId,
                            project_id: project.id,
                            name: fileObj.name,
                            type: type,
                            date: dateStr,
                            data: fileUrl,
                            category: category, 
                            uploaded_by: currentUserName 
                        };

                        // Insertar en Base de Datos
                        const { error } = await supabase.from('documents').insert(docPayload);
                        
                        if (error) throw error;
                        
                        // Añadir a estado local solo si la DB respondió OK
                        const newDoc: ProjectDocument = {
                            id: newId,
                            projectId: project.id,
                            name: fileObj.name,
                            type: type as 'pdf' | 'image' | 'other',
                            date: dateStr,
                            data: fileUrl,
                            category: category as 'general' | 'technical' | 'financial',
                            uploadedBy: currentUserName
                        };
                        newDocuments.push(newDoc);

                    } catch (fileErr: any) {
                        const f = file as File;
                        console.error(`Error procesando ${f.name}:`, fileErr);
                        errorMessages.push(`${f.name}: ${fileErr.message}`);
                    }
                }

                if (errorMessages.length > 0) {
                    alert(`Resumen de la subida:\n\nExitosos: ${newDocuments.length}\nFallidos:\n${errorMessages.join('\n')}`);
                }

                if (newDocuments.length > 0) {
                    const currentDocs = project.documents || [];
                    onUpdate({ ...project, documents: [...newDocuments, ...currentDocs] });
                }

            } catch (error: any) {
                console.error("Critical upload error:", error);
                alert("Error crítico del sistema de archivos: " + error.message);
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    };

    const handleDelete = async (docId: string) => {
        if (!window.confirm('¿Eliminar este documento permanentemente?')) return;
        setIsDeleting(docId);
        try {
            // 1. Intentar borrar de Storage (si es posible parsear la URL)
            const docToDelete = project.documents.find(d => d.id === docId);
            if (docToDelete && docToDelete.data.includes('/photos/')) {
                try {
                    const urlParts = docToDelete.data.split('/photos/');
                    if (urlParts.length > 1) {
                        const filePath = urlParts[1]; // Resto de la ruta
                        await supabase.storage.from('photos').remove([decodeURIComponent(filePath)]);
                    }
                } catch (err) {
                    console.warn("No se pudo eliminar el archivo físico (puede que ya no exista), borrando registro DB.", err);
                }
            }

            // 2. Borrar de Base de Datos
            const { error } = await supabase.from('documents').delete().eq('id', docId);
            if (error) throw error;

            // 3. Actualizar UI
            const updatedDocs = project.documents.filter(d => d.id !== docId);
            onUpdate({ ...project, documents: updatedDocs });

        } catch (error: any) {
            console.error("Error deleting document:", error);
            alert("No se pudo eliminar el registro: " + error.message);
        } finally {
            setIsDeleting(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="flex flex-col gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-lg ${category === 'technical' ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                            {category === 'technical' ? (
                                <Ruler className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                            ) : (
                                <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                            )}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white leading-tight">
                                {category === 'technical' ? 'Documentación Técnica' : 'Archivos Generales'}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {category === 'technical' ? 'Planos, esquemas y memorias' : 'Facturas, albaranes y fotos varias'}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2 w-full sm:w-auto">
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple accept="image/*,application/pdf" className="hidden" />
                        {onOpenScanner && (
                            <button onClick={onOpenScanner} className="flex-1 sm:flex-none bg-[#0047AB] text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-[#003380] transition-colors shadow-md shadow-blue-900/10 font-bold text-sm">
                                <Camera className="w-4 h-4" />
                                <span className="hidden sm:inline">Escanear</span>
                                <span className="sm:hidden">Escanear</span>
                            </button>
                        )}
                        <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="flex-1 sm:flex-none bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-bold text-sm disabled:opacity-70">
                            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {isUploading ? 'Subiendo...' : 'Subir'}
                        </button>
                    </div>
                </div>

                {/* Filters & Sort Toolbar */}
                {rawDocuments.length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                        <div className="relative flex-1">
                            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="Filtrar por nombre..." 
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        
                        {uploaders.length > 0 && (
                            <div className="relative min-w-[150px]">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <select 
                                    value={filterUploader}
                                    onChange={(e) => setFilterUploader(e.target.value)}
                                    className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                                >
                                    <option value="all">Todos los usuarios</option>
                                    {uploaders.map(u => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="relative min-w-[180px]">
                            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select 
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as SortOption)}
                                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                            >
                                <option value="dateDesc">Fecha Subida (Reciente)</option>
                                <option value="dateAsc">Fecha Subida (Antigua)</option>
                                <option value="emissionDesc">Fecha Emisión (Reciente)</option>
                                <option value="emissionAsc">Fecha Emisión (Antigua)</option>
                                <option value="amountDesc">Importe (Mayor a menor)</option>
                                <option value="amountAsc">Importe (Menor a mayor)</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Empty State */}
            {processedDocuments.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 flex flex-col items-center transition-colors">
                    <div className="p-4 bg-white dark:bg-slate-800 rounded-full mb-4 shadow-sm">
                        {category === 'technical' ? <Ruler className="w-8 h-8 opacity-50" /> : <FileText className="w-8 h-8 opacity-50" />}
                    </div>
                    <p className="font-medium">No se encontraron documentos.</p>
                    <p className="text-xs mt-1 opacity-70">Intenta cambiar los filtros o sube un nuevo archivo.</p>
                </div>
            ) : (
                /* Grid View */
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {processedDocuments.map(doc => {
                        const isUrl = doc.data.startsWith('http');
                        const isEditing = editingDocId === doc.id;
                        const isMoving = movingDocId === doc.id;

                        return (
                            <div key={doc.id} className="group relative bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
                                <div className="aspect-[4/3] bg-gray-100 dark:bg-slate-700/50 flex items-center justify-center overflow-hidden relative cursor-pointer" onClick={() => !isEditing && !isMoving && isUrl && window.open(doc.data, '_blank')}>
                                    {doc.type === 'image' ? (
                                        <img src={doc.data} alt={doc.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                    ) : (
                                        <div className="flex flex-col items-center text-gray-400 dark:text-slate-500 group-hover:text-[#0047AB] dark:group-hover:text-blue-400 transition-colors">
                                            <FileText className="w-12 h-12 mb-2" />
                                            <span className="text-[10px] uppercase font-bold tracking-wider">Documento</span>
                                        </div>
                                    )}
                                    
                                    {/* Overlay on hover */}
                                    {!isEditing && !isMoving && (
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                            <div className="bg-white/90 dark:bg-slate-900/90 p-2 rounded-full shadow-lg">
                                                <Eye className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                                            </div>
                                        </div>
                                    )}

                                    {isDeleting === doc.id && (
                                        <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 flex items-center justify-center z-20"><Loader2 className="w-8 h-8 animate-spin text-red-500" /></div>
                                    )}
                                    {!isUrl && <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] px-2 py-1 rounded font-bold flex items-center gap-1 z-10"><AlertTriangle className="w-3 h-3" /> Error</div>}
                                </div>
                                
                                <div className="p-3">
                                    <div className="flex justify-between items-start gap-2">
                                        <p className="text-xs font-bold text-gray-800 dark:text-white truncate flex-1" title={doc.name}>
                                            {getDisplayName(doc)}
                                        </p>
                                        
                                        <div className="flex gap-1 -mt-0.5">
                                            {isMoving ? (
                                                <>
                                                    <button onClick={handleMoveDocument} disabled={!targetProjectId} className="text-green-500 hover:text-green-600 transition-colors disabled:opacity-50" title="Confirmar Mover">
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={cancelMoving} className="text-slate-400 hover:text-slate-500 transition-colors" title="Cancelar">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </>
                                            ) : isEditing ? (
                                                <>
                                                    <button onClick={() => saveEditing(doc.id)} className="text-green-500 hover:text-green-600 transition-colors" title="Guardar">
                                                        <Save className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={cancelEditing} className="text-slate-400 hover:text-slate-500 transition-colors" title="Cancelar">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={(e) => { e.stopPropagation(); startEditing(doc); }} className="text-slate-300 hover:text-[#0047AB] dark:text-slate-600 dark:hover:text-blue-400 transition-colors" title="Editar">
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); startMoving(doc); }} className="text-slate-300 hover:text-blue-500 dark:text-slate-600 dark:hover:text-blue-400 transition-colors" title="Mover a otro proyecto">
                                                        <FolderInput className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }} disabled={isDeleting === doc.id} className="text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors" title="Eliminar">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 space-y-1.5">
                                        <div className="flex justify-between items-center">
                                            <span>Subido:</span>
                                            <span className="font-mono">{formatDate(doc.date)}</span>
                                        </div>
                                        
                                        {doc.uploadedBy && (
                                            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400" title={`Subido por ${doc.uploadedBy}`}>
                                                <span className="flex items-center gap-1"><User className="w-3 h-3" /> Por:</span>
                                                <span className="truncate max-w-[80px]">{doc.uploadedBy}</span>
                                            </div>
                                        )}

                                        {isMoving ? (
                                            <div className="pt-2 border-t border-slate-100 dark:border-slate-700 mt-2 animate-in fade-in slide-in-from-top-1">
                                                <label className="text-[9px] font-bold text-slate-500 block mb-1">Mover a Proyecto:</label>
                                                <select 
                                                    value={targetProjectId}
                                                    onChange={(e) => setTargetProjectId(e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-full text-[10px] p-1.5 border rounded-lg bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-600 outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-200"
                                                >
                                                    <option value="">Seleccionar...</option>
                                                    {allProjects.filter(p => p.id !== project.id).map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ) : isEditing ? (
                                            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[9px] font-bold text-slate-500">Fecha (Subida)</label>
                                                    <input 
                                                        type="date" 
                                                        value={editForm.date} 
                                                        onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                                                        className="w-full text-[10px] p-1 border rounded bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-600"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[9px] font-bold text-slate-500">Fecha Emisión</label>
                                                    <input 
                                                        type="date" 
                                                        value={editForm.emissionDate} 
                                                        onChange={(e) => setEditForm({...editForm, emissionDate: e.target.value})}
                                                        className="w-full text-[10px] p-1 border rounded bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-600"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[9px] font-bold text-slate-500">Importe (€)</label>
                                                    <input 
                                                        type="number" 
                                                        step="0.01"
                                                        value={editForm.amount} 
                                                        onChange={(e) => setEditForm({...editForm, amount: e.target.value})}
                                                        className="w-full text-[10px] p-1 border rounded bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-600"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {doc.emissionDate && (
                                                    <div className="flex justify-between items-center font-medium text-slate-600 dark:text-slate-400">
                                                        <span>Emisión:</span>
                                                        <span className="font-mono">{formatDate(doc.emissionDate)}</span>
                                                    </div>
                                                )}
                                                
                                                {doc.amount != null && (
                                                    <div className="flex justify-between items-center font-bold text-slate-800 dark:text-white pt-1.5 border-t border-slate-100 dark:border-slate-700 mt-1">
                                                        <span>Importe:</span>
                                                        <span>{doc.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default DocumentManager;
