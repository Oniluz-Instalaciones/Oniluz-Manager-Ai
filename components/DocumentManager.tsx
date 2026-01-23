import React, { useRef } from 'react';
import { ProjectDocument, Project } from '../types';
import { FileText, Image as ImageIcon, Trash2, Upload, X, File } from 'lucide-react';

interface DocumentManagerProps {
    project: Project;
    onUpdate: (updatedProject: Project) => void;
}

const DocumentManager: React.FC<DocumentManagerProps> = ({ project, onUpdate }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            Array.from(e.target.files).forEach((file: File) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64String = reader.result as string;
                    const type = file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other';
                    
                    const newDoc: ProjectDocument = {
                        id: Date.now().toString() + Math.random(),
                        projectId: project.id,
                        name: file.name,
                        type: type as any,
                        date: new Date().toISOString().split('T')[0],
                        data: base64String
                    };

                    // We need to use a callback or ensure we are working with the latest state if multiple files are processed
                    // For simplicity in this structure, we update immediately. In a real app with large files, 
                    // this should be handled more carefully with state batching.
                    const currentDocs = project.documents || [];
                    onUpdate({ ...project, documents: [newDoc, ...currentDocs] });
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const handleDelete = (docId: string) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este documento?')) {
            const updatedDocs = project.documents.filter(d => d.id !== docId);
            onUpdate({ ...project, documents: updatedDocs });
        }
    };

    const documents = project.documents || [];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Documentación de Obra</h3>
                <div className="flex gap-2">
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        multiple 
                        accept="image/*,application/pdf"
                        className="hidden" 
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-gray-900 dark:bg-slate-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-black dark:hover:bg-slate-600 transition-colors shadow-lg"
                    >
                        <Upload className="w-4 h-4" /> Subir Archivos
                    </button>
                </div>
            </div>

            {documents.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 dark:bg-slate-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 flex flex-col items-center transition-colors">
                    <FileText className="w-12 h-12 mb-3 opacity-20" />
                    <p>No hay documentos adjuntos.</p>
                    <p className="text-sm mt-1">Sube planos, fotos, facturas o manuales.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {documents.map(doc => (
                        <div key={doc.id} className="group relative bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                            <div className="aspect-square bg-gray-100 dark:bg-slate-700/50 flex items-center justify-center overflow-hidden">
                                {doc.type === 'image' ? (
                                    <img src={doc.data} alt={doc.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center text-gray-400 dark:text-slate-500">
                                        <FileText className="w-12 h-12 mb-2" />
                                        <span className="text-xs uppercase font-bold text-gray-300 dark:text-slate-600">PDF</span>
                                    </div>
                                )}
                            </div>
                            <div className="p-3">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={doc.name}>{doc.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{doc.date}</p>
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
                                    className="p-1.5 bg-white/90 dark:bg-slate-900/90 rounded-full text-red-500 hover:text-red-700 shadow-sm"
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