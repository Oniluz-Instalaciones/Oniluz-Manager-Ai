import React, { useRef, useState } from 'react';
import { ProjectDocument, Project } from '../types';
import { FileText, Image as ImageIcon, Trash2, Upload, X, File, Loader2, Camera } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DocumentManagerProps {
    project: Project;
    onUpdate: (updatedProject: Project) => void;
    onOpenScanner?: () => void; // New callback
}

const DocumentManager: React.FC<DocumentManagerProps> = ({ project, onUpdate, onOpenScanner }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    // Helper to format dates as dd-mm-yyyy
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        return `${day}-${month}-${year}`;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setIsUploading(true);
            const files = Array.from(e.target.files);
            const newDocuments: ProjectDocument[] = [];

            try {
                for (const file of files) {
                    // Convert to Base64 for DB storage (simpler for small files) 
                    // or ideally upload to Storage for large files.
                    // For consistency with current app logic, we'll maintain Base64 for small docs 
                    // but save to DB immediately.
                    
                    const base64String: string = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                    });

                    const type = file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other';
                    const newId = crypto.randomUUID();
                    const dateStr = new Date().toISOString().split('T')[0];

                    const docPayload = {
                        id: newId,
                        project_id: project.id,
                        name: file.name,
                        type: type,
                        date: dateStr,
                        data: base64String
                    };

                    // 1. Save directly to DB to ensure persistence
                    const { error } = await supabase.from('documents').insert(docPayload);
                    
                    if (error) {
                        console.error("Error saving document to DB:", error);
                        continue; 
                    }

                    newDocuments.push(docPayload as any);
                }

                // 2. Update local state
                if (newDocuments.length > 0) {
                    const currentDocs = project.documents || [];
                    onUpdate({ ...project, documents: [...newDocuments, ...currentDocs] });
                }

            } catch (error) {
                console.error("Critical upload error:", error);
                alert("Error al subir los archivos.");
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    };

    const handleDelete = async (docId: string) => {
        if (!window.confirm('¿Estás seguro de que quieres eliminar este documento permanentemente?')) {
            return;
        }

        setIsDeleting(docId);
        
        try {
            const docToDelete = project.documents.find(d => d.id === docId);

            // 1. Try to delete file from Storage if it is a hosted URL (from ScannerModal)
            // Checks if data is a URL and contains the supabase storage path
            if (docToDelete && docToDelete.data.includes('/storage/v1/object/public/')) {
                try {
                    const url = new URL(docToDelete.data);
                    // Extract path after /public/
                    const pathParts = url.pathname.split('/public/');
                    if (pathParts.length > 1) {
                        const bucketAndPath = pathParts[1].split('/'); // "photos/projectId/file.jpg"
                        const bucket = bucketAndPath[0];
                        const filePath = bucketAndPath.slice(1).join('/');
                        
                        // We assume bucket is 'photos' based on App logic, but let's be safe
                        if (bucket === 'photos') {
                            await supabase.storage.from('photos').remove([filePath]);
                        }
                    }
                } catch (err) {
                    console.warn("Could not delete file from storage, proceeding to DB delete.", err);
                }
            }

            // 2. Delete Record from Database
            const { error } = await supabase
                .from('documents')
                .delete()
                .eq('id', docId);

            if (error) throw error;

            // 3. Update Local State (Optimistic UI update)
            const updatedDocs = project.documents.filter(d => d.id !== docId);
            onUpdate({ ...project, documents: updatedDocs });

        } catch (error: any) {
            console.error("Error deleting document:", error);
            alert("No se pudo eliminar el documento de la base de datos: " + error.message);
        } finally {
            setIsDeleting(null);
        }
    };

    const documents = project.documents || [];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Documentación de Obra</h3>
                <div className="flex gap-2 w-full sm:w-auto">
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        multiple 
                        accept="image/*,application/pdf"
                        className="hidden" 
                    />
                    
                    {onOpenScanner && (
                        <button 
                            onClick={onOpenScanner}
                            className="flex-1 sm:flex-none bg-[#0047AB] text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-[#003380] transition-colors shadow-md font-bold text-sm"
                        >
                            <Camera className="w-4 h-4" />
                            <span className="hidden sm:inline">Escanear / Cámara</span>
                            <span className="sm:hidden">Escanear</span>
                        </button>
                    )}

                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex-1 sm:flex-none bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors shadow-sm text-sm font-bold disabled:opacity-70"
                    >
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {isUploading ? 'Subiendo...' : 'Subir Archivos'}
                    </button>
                </div>
            </div>

            {documents.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 dark:bg-slate-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 flex flex-col items-center transition-colors">
                    <FileText className="w-12 h-12 mb-3 opacity-20" />
                    <p>No hay documentos adjuntos.</p>
                    <p className="text-sm mt-1">Escanea documentos técnicos o sube planos.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {documents.map(doc => (
                        <div key={doc.id} className="group relative bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                            <div className="aspect-square bg-gray-100 dark:bg-slate-700/50 flex items-center justify-center overflow-hidden relative">
                                {doc.type === 'image' ? (
                                    <img src={doc.data} alt={doc.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center text-gray-400 dark:text-slate-500">
                                        <FileText className="w-12 h-12 mb-2" />
                                        <span className="text-xs uppercase font-bold text-gray-300 dark:text-slate-600">PDF</span>
                                    </div>
                                )}
                                {/* Deleting Overlay */}
                                {isDeleting === doc.id && (
                                    <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 flex items-center justify-center z-10">
                                        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                                    </div>
                                )}
                            </div>
                            <div className="p-3">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={doc.name}>{doc.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(doc.date)}</p>
                            </div>
                            
                            {/* Overlay Actions */}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                <a 
                                    href={doc.data} 
                                    download={doc.name}
                                    className="p-1.5 bg-white/90 dark:bg-slate-900/90 rounded-full text-blue-600 dark:text-blue-400 hover:text-blue-800 shadow-sm"
                                    title="Descargar"
                                >
                                    <Upload className="w-3 h-3 rotate-180" />
                                </a>
                                <button 
                                    onClick={() => handleDelete(doc.id)}
                                    disabled={isDeleting === doc.id}
                                    className="p-1.5 bg-white/90 dark:bg-slate-900/90 rounded-full text-red-500 hover:text-red-700 shadow-sm disabled:opacity-50"
                                    title="Eliminar"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DocumentManager;