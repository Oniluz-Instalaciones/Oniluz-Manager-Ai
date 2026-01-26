import React, { useState } from 'react';
import { Project, ProjectStatus, ProjectType } from '../types';
import { 
  Search, Plus, Calendar, Database, Sun, Moon, LogOut, 
  TrendingUp, MapPin, Zap, MoveVertical, Ruler,
  LayoutGrid
} from 'lucide-react';
import GlobalAssistant from './GlobalAssistant';

// Icono personalizado de Aladelta para Válida
const HangGlider = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M22 10L12 2L2 10" />
    <path d="M12 2v12" />
    <path d="M12 14l-5 4" />
    <path d="M12 14l5 4" />
    <path d="M2 10l5 8" />
    <path d="M22 10l-5 8" />
  </svg>
);

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (id: string) => void;
  onAddProject: (project: Project) => void;
  onUpdateProject: (project: Project) => void;
  onOpenGlobalFinance: () => void;
  onOpenPriceDb: () => void;
  onOpenCalendar: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  currentUserName: string;
}

const ProjectList: React.FC<ProjectListProps> = ({ 
  projects, onSelectProject, onAddProject, onOpenGlobalFinance, 
  onOpenPriceDb, onOpenCalendar, isDarkMode, onToggleDarkMode, 
  onLogout, currentUserName 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [modalType, setModalType] = useState<ProjectType>('General');

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.client.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const newProject: Project = {
        id: crypto.randomUUID(),
        type: modalType,
        name: formData.get('name') as string,
        client: formData.get('client') as string,
        location: formData.get('location') as string,
        description: formData.get('description') as string,
        status: ProjectStatus.PLANNING,
        progress: 0,
        startDate: formData.get('startDate') as string,
        endDate: formData.get('endDate') as string,
        budget: Number(formData.get('budget')),
        transactions: [],
        materials: [],
        incidents: [],
        documents: []
    };

    if (modalType === 'Photovoltaic') {
        newProject.pvData = {
            peakPower: Number(formData.get('peakPower')),
            modulesCount: Number(formData.get('modulesCount')),
            inverterModel: formData.get('inverterModel') as string,
            hasBattery: formData.get('hasBattery') === 'on',
            batteryCapacity: Number(formData.get('batteryCapacity')),
            installationType: formData.get('installationType') as any
        };
    } else if (modalType === 'Elevator') {
        newProject.elevatorData = {
            solutionType: formData.get('solutionType') as any,
            location: formData.get('elevatorLocation') as any,
            floors: Number(formData.get('floors')),
            stairWidth: Number(formData.get('stairWidth')),
            stairMaterial: formData.get('stairMaterial') as any,
            parkingSide: formData.get('parkingSide') as any
        };
    }

    onAddProject(newProject);
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 shadow-sm px-6 py-4 flex flex-col md:flex-row justify-between items-center sticky top-0 z-30 border-b border-slate-100 dark:border-slate-700">
         <div className="flex items-center gap-4 mb-4 md:mb-0 w-full md:w-auto">
             <div className="w-10 h-10 bg-[#0047AB] rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                 <Zap className="text-white w-6 h-6" />
             </div>
             <div>
                 <h1 className="text-xl font-extrabold text-slate-900 dark:text-white leading-tight">Oniluz Manager</h1>
                 <p className="text-xs text-slate-500 dark:text-slate-400">Bienvenido, {currentUserName}</p>
             </div>
         </div>

         <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
             <button onClick={onOpenGlobalFinance} className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors whitespace-nowrap">
                 <TrendingUp className="w-4 h-4" /> Finanzas
             </button>
             <button onClick={onOpenPriceDb} className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors whitespace-nowrap">
                 <Database className="w-4 h-4" /> Precios
             </button>
             <button onClick={onOpenCalendar} className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors whitespace-nowrap">
                 <Calendar className="w-4 h-4" /> Calendario
             </button>
             <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-1"></div>
             <button onClick={onToggleDarkMode} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                 {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
             </button>
             <button onClick={onLogout} className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors">
                 <LogOut className="w-5 h-5" />
             </button>
         </div>
      </div>

      <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
         {/* Controls */}
         <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
             <div className="relative w-full md:w-96">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                 <input 
                    type="text" 
                    placeholder="Buscar obras..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#0047AB] outline-none shadow-sm transition-all text-slate-900 dark:text-white placeholder-slate-400"
                 />
             </div>
             <button 
                onClick={() => setIsModalOpen(true)}
                className="w-full md:w-auto bg-[#0047AB] text-white px-6 py-3 rounded-xl hover:bg-[#003380] transition-colors flex items-center justify-center gap-2 font-bold shadow-lg shadow-blue-900/20"
             >
                 <Plus className="w-5 h-5" /> Nuevo Proyecto
             </button>
         </div>

         {/* Grid */}
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
             {filteredProjects.map(project => (
                 <div 
                    key={project.id} 
                    onClick={() => onSelectProject(project.id)}
                    className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group"
                 >
                     <div className="flex justify-between items-start mb-4">
                         <div className={`p-3 rounded-xl ${
                             project.type === 'Photovoltaic' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                             project.type === 'Elevator' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' :
                             'bg-blue-100 text-[#0047AB] dark:bg-blue-900/30 dark:text-blue-400'
                         }`}>
                             {project.type === 'Photovoltaic' ? <Sun className="w-6 h-6" /> : 
                              project.type === 'Elevator' ? <HangGlider className="w-6 h-6" /> : 
                              <LayoutGrid className="w-6 h-6" />}
                         </div>
                         <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                            project.status === ProjectStatus.IN_PROGRESS ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            project.status === ProjectStatus.PLANNING ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            project.status === ProjectStatus.COMPLETED ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                            'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                         }`}>
                             {project.status}
                         </span>
                     </div>
                     
                     <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 group-hover:text-[#0047AB] transition-colors line-clamp-1">{project.name}</h3>
                     <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-4">
                         <MapPin className="w-3.5 h-3.5" /> {project.location}
                     </p>
                     
                     <div className="space-y-3">
                         <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                             <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                    project.progress === 100 ? 'bg-green-500' : 'bg-[#0047AB]'
                                }`} 
                                style={{ width: `${project.progress}%` }}
                             ></div>
                         </div>
                         <div className="flex justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                             <span>Progreso: {project.progress}%</span>
                             <span>{project.endDate || 'Sin fecha fin'}</span>
                         </div>
                     </div>
                 </div>
             ))}
             
             {filteredProjects.length === 0 && (
                 <div className="col-span-full py-20 text-center text-slate-400 dark:text-slate-500">
                     <p>No se encontraron proyectos.</p>
                 </div>
             )}
         </div>
      </div>

      {/* Global Assistant Button */}
      <div className="fixed bottom-6 right-6 z-40">
        <button 
          onClick={() => setIsAssistantOpen(true)}
          className="w-14 h-14 bg-[#0047AB] rounded-full shadow-xl shadow-blue-900/30 flex items-center justify-center text-white hover:scale-110 transition-transform hover:bg-[#003380] group"
        >
            <Zap className="w-7 h-7 fill-yellow-400 text-yellow-400 group-hover:animate-pulse" />
        </button>
      </div>
      <GlobalAssistant isOpen={isAssistantOpen} onClose={() => setIsAssistantOpen(false)} />

      {/* Add Project Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 dark:border-slate-700">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-800 z-10">
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white">Nuevo Proyecto</h2>
                      <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors">
                          <LogOut className="w-5 h-5 rotate-180" /> 
                      </button>
                  </div>
                  
                  <form onSubmit={handleCreate} className="p-6 space-y-6">
                      <div className="flex gap-4 mb-4">
                          {(['General', 'Photovoltaic', 'Elevator'] as ProjectType[]).map(type => (
                              <button
                                type="button"
                                key={type}
                                onClick={() => setModalType(type)}
                                className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                                    modalType === type 
                                    ? 'border-[#0047AB] bg-blue-50 text-[#0047AB] dark:bg-blue-900/20 dark:text-blue-400' 
                                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                                }`}
                              >
                                  {type === 'Photovoltaic' ? 'Fotovoltaica' : type === 'Elevator' ? 'Elevador' : 'General'}
                              </button>
                          ))}
                      </div>

                      <div className="space-y-4">
                          <div>
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Nombre del Proyecto</label>
                              <input name="name" required className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white" />
                          </div>
                          <div className="flex gap-4">
                              <div className="w-1/2">
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cliente</label>
                                  <input name="client" required className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white" />
                              </div>
                              <div className="w-1/2">
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Ubicación</label>
                                  <input name="location" required className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white" />
                              </div>
                          </div>
                          
                          {/* Specific Photovoltaic Fields */}
                          {modalType === 'Photovoltaic' && (
                              <div className="bg-orange-50 dark:bg-orange-900/20 p-5 rounded-2xl border border-orange-100 dark:border-orange-800 space-y-4">
                                  <h3 className="text-sm font-bold text-orange-700 dark:text-orange-500 uppercase tracking-wide flex items-center gap-2">
                                      <Sun className="w-4 h-4" /> Configuración Solar
                                  </h3>
                                  <div className="flex gap-4">
                                      <div className="w-1/2">
                                          <label className="text-[10px] font-bold text-orange-700/70 dark:text-orange-400 uppercase">Potencia Pico (kWp)</label>
                                          <input name="peakPower" type="number" step="0.1" required className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                                      </div>
                                      <div className="w-1/2">
                                          <label className="text-[10px] font-bold text-orange-700/70 dark:text-orange-400 uppercase">Nº Módulos</label>
                                          <input name="modulesCount" type="number" required className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                                      </div>
                                  </div>
                                  <div>
                                      <label className="text-[10px] font-bold text-orange-700/70 dark:text-orange-400 uppercase">Inversor</label>
                                      <input name="inverterModel" placeholder="Modelo del inversor" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                                  </div>
                                  <div className="flex items-center gap-4">
                                      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 font-bold cursor-pointer">
                                          <input name="hasBattery" type="checkbox" className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500" />
                                          Incluye Batería
                                      </label>
                                      <input name="batteryCapacity" type="number" placeholder="Capacidad (kWh)" className="flex-1 p-2 bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                                  </div>
                              </div>
                          )}

                          {/* Specific Elevator Fields (Válida) */}
                          {modalType === 'Elevator' && (
                              <div className="bg-rose-50 dark:bg-rose-900/20 p-5 rounded-2xl border border-rose-100 dark:border-rose-800 space-y-4">
                                  <h3 className="text-sm font-bold text-rose-700 dark:text-rose-500 uppercase tracking-wide flex items-center gap-2">
                                      <HangGlider className="w-4 h-4" /> Configuración Elevador
                                  </h3>
                                  <div>
                                       <label className="text-[10px] font-bold text-rose-700/70 dark:text-rose-400 uppercase">Tipo de Solución</label>
                                       <select name="solutionType" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0047AB] outline-none">
                                           <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="Silla Recta">Silla Salvaescaleras Recta</option>
                                           <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="Silla Curva">Silla Salvaescaleras Curva</option>
                                           <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="Plataforma">Plataforma Salvaescaleras</option>
                                           <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="Elevador Vertical">Elevador Vertical (Corto Recorrido)</option>
                                       </select>
                                  </div>
                                  <div className="flex gap-4">
                                      <div className="w-1/2">
                                          <label className="text-[10px] font-bold text-rose-700/70 dark:text-rose-400 uppercase">Nº Plantas/Paradas</label>
                                          <input name="floors" type="number" min="1" required className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0047AB] outline-none" />
                                      </div>
                                      <div className="w-1/2">
                                          <label className="text-[10px] font-bold text-rose-700/70 dark:text-rose-400 uppercase">Ubicación</label>
                                          <select name="elevatorLocation" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0047AB] outline-none">
                                              <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="Interior">Interior</option>
                                              <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="Intemperie">Intemperie (Exterior)</option>
                                          </select>
                                      </div>
                                  </div>
                                  <div className="flex gap-4">
                                      <div className="w-1/2">
                                          <label className="text-[10px] font-bold text-rose-700/70 dark:text-rose-400 uppercase">Ancho Escalera (cm)</label>
                                          <div className="relative">
                                              <Ruler className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                              <input name="stairWidth" type="number" placeholder="Ej: 80" className="w-full mt-1 pl-7 p-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0047AB] outline-none" />
                                          </div>
                                      </div>
                                       <div className="w-1/2">
                                          <label className="text-[10px] font-bold text-rose-700/70 dark:text-rose-400 uppercase">Lado Aparcamiento</label>
                                          <select name="parkingSide" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0047AB] outline-none">
                                              <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="Derecha">Derecha</option>
                                              <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="Izquierda">Izquierda</option>
                                          </select>
                                      </div>
                                  </div>
                                  <div>
                                       <label className="text-[10px] font-bold text-rose-700/70 dark:text-rose-400 uppercase">Material Escalera (Fijación)</label>
                                       <select name="stairMaterial" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0047AB] outline-none">
                                           <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="Hormigón">Hormigón / Obra</option>
                                           <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="Madera">Madera</option>
                                           <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="Metal">Metálica</option>
                                           <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="Mármol">Mármol / Granito</option>
                                       </select>
                                  </div>
                              </div>
                          )}

                          <div className="flex gap-4">
                              <div className="w-1/2">
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Fecha Inicio</label>
                                  <input name="startDate" type="date" required className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white" />
                              </div>
                              <div className="w-1/2">
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Fecha Fin (Est)</label>
                                  <input name="endDate" type="date" className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white" />
                              </div>
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Presupuesto Inicial (€)</label>
                              <input name="budget" type="number" step="0.01" required className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white font-mono" />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Descripción</label>
                              <textarea name="description" rows={3} required className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white resize-none" />
                          </div>
                      </div>

                      <button type="submit" className="w-full bg-[#0047AB] text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-900/20 hover:bg-[#003380] transition-transform active:scale-[0.98]">
                          Crear Proyecto
                      </button>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default ProjectList;