import React, { useRef, useState } from 'react';
import { ProjectDocument, Project } from '../types';
import { FileText, Image as ImageIcon, Trash2, Upload, X, File, Loader2, Camera, Ruler, ExternalLink, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DocumentManagerProps {
    project: Project;
    onUpdate: (updatedProject: Project) => void;
    onOpenScanner?: () => void;
    category?: 'general' | 'technical' | 'financial'; // Updated
}

const DocumentManager: React.FC<DocumentManagerProps> = ({ project, onUpdate, onOpenScanner, category = 'general' }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    // Helper: Strict filtering for clean separation
    const isDocumentInCurrentCategory = (doc: ProjectDocument) => {
        // Compatibility with legacy "null" categories
        if (!doc.category || doc.category === 'general') {
            // If viewing 'general' tab, show items that are NOT technical AND NOT financial
            if (category === 'general') {
                 // Check if it's implicitly technical (old tag) or explicitly financial
                 return !doc.name.startsWith('[TEC] ');
            }
            return false;
        }

        // Standard strict matching
        return doc.category === category;
    };

    // Filter documents
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
        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const timestamp = Date.now();
        const filePath = `${projectId}/${timestamp}_${cleanName}`;

        console.log(`[Upload] Intentando subir a bucket 'photos': ${filePath}`);

        const { error: uploadError } = await supabase.storage
            .from('photos')
            .upload(filePath, file, { cacheControl: '3600', upsert: false });

        if (uploadError) {
            console.error("Storage upload error details:", uploadError);
            if (uploadError.message.includes("row-level security")) {
                throw new Error("Error de permisos: El bucket 'photos' no es público.");
            }
            throw new Error(`Error subiendo archivo: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
            .from('photos')
            .getPublicUrl(filePath);

        if (!publicUrl) throw new Error("No se pudo obtener la URL pública del archivo.");

        return publicUrl;
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
                        const fileUrl = await uploadFileToStorage(file, project.id);
                        
                        const type = file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other';
                        const newId = crypto.randomUUID();
                        const dateStr = new Date().toISOString().split('T')[0];
                        const finalName = file.name;
                        
                        const docPayload: any = {
                            id: newId,
                            project_id: project.id,
                            name: finalName,
                            type: type,
                            date: dateStr,
                            data: fileUrl,
                            category: category 
                        };

                        let { error } = await supabase.from('documents').insert(docPayload);
                        
                        // Compatibility fallback
                        if (error && (error.code === '42703' || error.message.includes('column'))) {
                            delete docPayload.category; 
                            if (category === 'technical') docPayload.name = `[TEC] ${finalName}`; 
                            const retry = await supabase.from('documents').insert(docPayload);
                            error = retry.error;
                        }

                        if (error) throw error;
                        newDocuments.push(docPayload as ProjectDocument);

                    } catch (fileErr: any) {
                        console.error(`Error processing file ${file.name}:`, fileErr);
                        errorMessages.push(`${file.name}: ${fileErr.message}`);
                    }
                }

                if (errorMessages.length > 0) alert(`Algunos archivos no se guardaron:\n\n${errorMessages.join('\n')}`);

                if (newDocuments.length > 0) {
                    const currentDocs = project.documents || [];
                    onUpdate({ ...project, documents: [...newDocuments, ...currentDocs] });
                }

            } catch (error: any) {
                console.error("Critical upload error:", error);
                alert("Error crítico del sistema: " + error.message);
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
            const docToDelete = project.documents.find(d => d.id === docId);
            if (docToDelete && docToDelete.data.includes('/storage/v1/object/public/')) {
                try {
                    const url = new URL(docToDelete.data);
                    const pathParts = url.pathname.split('/public/');
                    if (pathParts.length > 1) {
                        const bucketAndPath = pathParts[1].split('/'); 
                        const filePath = bucketAndPath.slice(1).join('/');
                        await supabase.storage.from('photos').remove([decodeURIComponent(filePath)]);
                    }
                } catch (err) {
                    console.warn("Could not delete file from storage, proceeding to DB delete.", err);
                }
            }
            const { error } = await supabase.from('documents').delete().eq('id', docId);
            if (error) throw error;
            const updatedDocs = project.documents.filter(d => d.id !== docId);
            onUpdate({ ...project, documents: updatedDocs });
        } catch (error: any) {
            console.error("Error deleting document:", error);
            alert("No se pudo eliminar el documento: " + error.message);
        } finally {
            setIsDeleting(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-2">
                    {category === 'technical' ? (
                        <div className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded-lg">
                            <Ruler className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                        </div>
                    ) : (
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                    )}
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                        {category === 'technical' ? 'Planos y Esquemas' : 'Documentación Administrativa'}
                    </h3>
                </div>
                
                <div className="flex gap-2 w-full sm:w-auto">
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple accept="image/*,application/pdf" className="hidden" />
                    {onOpenScanner && (
                        <button onClick={onOpenScanner} className="flex-1 sm:flex-none bg-[#0047AB] text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-[#003380] transition-colors shadow-md font-bold text-sm">
                            <Camera className="w-4 h-4" />
                            <span className="hidden sm:inline">Escanear</span>
                            <span className="sm:hidden">Escanear</span>
                        </button>
                    )}
                    <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="flex-1 sm:flex-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors shadow-sm text-sm font-bold disabled:opacity-70">
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {isUploading ? 'Subir' : 'Subir Archivo'}
                    </button>
                </div>
            </div>

            {documents.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 dark:bg-slate-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 flex flex-col items-center transition-colors">
                    {category === 'technical' ? <Ruler className="w-12 h-12 mb-3 opacity-20" /> : <FileText className="w-12 h-12 mb-3 opacity-20" />}
                    <p>No hay documentos en esta sección.</p>
                    <p className="text-sm mt-1">{category === 'technical' ? 'Sube planos, esquemas unifilares o memorias técnicas.' : 'Sube facturas, albaranes o fotos de la obra.'}</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {documents.map(doc => {
                        const isUrl = doc.data.startsWith('http');
                        return (
                            <div key={doc.id} className="group relative bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                                <div className="aspect-square bg-gray-100 dark:bg-slate-700/50 flex items-center justify-center overflow-hidden relative">
                                    {doc.type === 'image' ? (
                                        <img src={doc.data} alt={doc.name} className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => isUrl && window.open(doc.data, '_blank')} />
                                    ) : (
                                        <div className="flex flex-col items-center text-gray-400 dark:text-slate-500 cursor-pointer hover:text-[#0047AB] dark:hover:text-blue-400 transition-colors" onClick={() => isUrl && window.open(doc.data, '_blank')}>
                                            <FileText className="w-12 h-12 mb-2" />
                                            <span className="text-xs uppercase font-bold text-gray-300 dark:text-slate-600">PDF</span>
                                        </div>
                                    )}
                                    {isDeleting === doc.id && (
                                        <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 flex items-center justify-center z-10"><Loader2 className="w-8 h-8 animate-spin text-red-500" /></div>
                                    )}
                                    {!isUrl && <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] px-2 py-1 rounded font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Error Carga</div>}
                                </div>
                                <div className="p-3">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={doc.name}>{getDisplayName(doc.name)}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 flex justify-between items-center mt-1">
                                        <span>{formatDate(doc.date)}</span>
                                        {isUrl && <ExternalLink className="w-3 h-3 text-slate-300" />}
                                    </p>
                                </div>
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                    {isUrl && (
                                        <a href={doc.data} download={doc.name} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-white/90 dark:bg-slate-900/90 rounded-full text-blue-600 dark:text-blue-400 hover:text-blue-800 shadow-sm" title="Descargar/Ver"><Upload className="w-3 h-3 rotate-180" /></a>
                                    )}
                                    <button onClick={() => handleDelete(doc.id)} disabled={isDeleting === doc.id} className="p-1.5 bg-white/90 dark:bg-slate-900/90 rounded-full text-red-500 hover:text-red-700 shadow-sm disabled:opacity-50" title="Eliminar"><Trash2 className="w-3 h-3" /></button>
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