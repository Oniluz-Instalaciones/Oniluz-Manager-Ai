
import React, { useRef, useState } from 'react';
import { ProjectDocument, Project } from '../types';
import { FileText, Image as ImageIcon, Trash2, Upload, X, File, Loader2, Camera, Ruler, ExternalLink, AlertTriangle, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DocumentManagerProps {
    project: Project;
    onUpdate: (updatedProject: Project) => void;
    onOpenScanner?: () => void;
    category?: 'general' | 'technical' | 'financial'; 
}

const DocumentManager: React.FC<DocumentManagerProps> = ({ project, onUpdate, onOpenScanner, category = 'general' }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    // Filtrado estricto para mostrar solo lo que corresponde a esta pestaña
    const isDocumentInCurrentCategory = (doc: ProjectDocument) => {
        // Lógica corregida: 
        // Si estamos en la pestaña GENERAL ('Archivos'), queremos ver:
        // 1. Archivos con category = 'general'
        // 2. Archivos con category = 'financial' (tickets)
        // 3. Archivos antiguos (category = null)
        // 4. EXCLUIR los técnicos.
        if (category === 'general') {
             if (doc.category === 'technical') return false;
             if (doc.name.startsWith('[TEC] ')) return false;
             return true; // Muestra general, financial y null
        }
        
        // Si estamos en TECHNICAL, solo mostrar technical
        return doc.category === category;
    };

    const documents = (project.documents || []).filter(isDocumentInCurrentCategory);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        return `${day}-${month}-${year}`;
    };

    const getDisplayName = (name: string) => {
        return name.replace('[TEC] ', '');
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
                            category: category // IMPORTANTE: Se guarda con la categoría de la pestaña actual
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
                            category: category as 'general' | 'technical' | 'financial'
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
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

            {/* Empty State */}
            {documents.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 flex flex-col items-center transition-colors">
                    <div className="p-4 bg-white dark:bg-slate-800 rounded-full mb-4 shadow-sm">
                        {category === 'technical' ? <Ruler className="w-8 h-8 opacity-50" /> : <FileText className="w-8 h-8 opacity-50" />}
                    </div>
                    <p className="font-medium">No hay documentos en esta sección.</p>
                    <p className="text-xs mt-1 opacity-70">Usa los botones de arriba para añadir contenido.</p>
                </div>
            ) : (
                /* Grid View */
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {documents.map(doc => {
                        const isUrl = doc.data.startsWith('http');
                        return (
                            <div key={doc.id} className="group relative bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
                                <div className="aspect-[4/3] bg-gray-100 dark:bg-slate-700/50 flex items-center justify-center overflow-hidden relative cursor-pointer" onClick={() => isUrl && window.open(doc.data, '_blank')}>
                                    {doc.type === 'image' ? (
                                        <img src={doc.data} alt={doc.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                    ) : (
                                        <div className="flex flex-col items-center text-gray-400 dark:text-slate-500 group-hover:text-[#0047AB] dark:group-hover:text-blue-400 transition-colors">
                                            <FileText className="w-12 h-12 mb-2" />
                                            <span className="text-[10px] uppercase font-bold tracking-wider">Documento</span>
                                        </div>
                                    )}
                                    
                                    {/* Overlay on hover */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                        <div className="bg-white/90 dark:bg-slate-900/90 p-2 rounded-full shadow-lg">
                                            <Eye className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                                        </div>
                                    </div>

                                    {isDeleting === doc.id && (
                                        <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 flex items-center justify-center z-20"><Loader2 className="w-8 h-8 animate-spin text-red-500" /></div>
                                    )}
                                    {!isUrl && <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] px-2 py-1 rounded font-bold flex items-center gap-1 z-10"><AlertTriangle className="w-3 h-3" /> Error</div>}
                                </div>
                                
                                <div className="p-3">
                                    <div className="flex justify-between items-start gap-2">
                                        <p className="text-xs font-bold text-gray-800 dark:text-white truncate flex-1" title={doc.name}>{getDisplayName(doc.name)}</p>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }} 
                                            disabled={isDeleting === doc.id} 
                                            className="text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors -mt-0.5"
                                            title="Eliminar"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 flex items-center justify-between">
                                        <span>{formatDate(doc.date)}</span>
                                        <span className="uppercase">{doc.type === 'image' ? 'IMG' : 'DOC'}</span>
                                    </p>
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
