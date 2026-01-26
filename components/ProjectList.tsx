import React, { useState } from 'react';
import { Project, ProjectStatus, ProjectType, PvData, ElevatorData } from '../types';
import { 
  Search, Plus, Filter, Calendar, BarChart3, Database, 
  Sun, Moon, LogOut, Zap, Building2, ArrowUpFromLine, Ruler,
  MapPin, User, ChevronRight, X, Briefcase
} from 'lucide-react';

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
  projects,
  onSelectProject,
  onAddProject,
  onUpdateProject,
  onOpenGlobalFinance,
  onOpenPriceDb,
  onOpenCalendar,
  isDarkMode,
  onToggleDarkMode,
  onLogout,
  currentUserName
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<ProjectType>('General');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'ALL'>('ALL');

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.client.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateProject = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const baseProject = {
      id: crypto.randomUUID(), // Will be overwritten by DB ID usually
      type: modalType,
      name: formData.get('name') as string,
      client: formData.get('client') as string,
      location: formData.get('location') as string,
      status: ProjectStatus.PLANNING,
      progress: 0,
      startDate: formData.get('startDate') as string,
      description: formData.get('description') as string,
      budget: Number(formData.get('budget')),
      transactions: [],
      materials: [],
      incidents: [],
      documents: [],
      budgets: []
    };

    let newProject: Project = { ...baseProject };

    if (modalType === 'Photovoltaic') {
        const pvData: PvData = {
            peakPower: Number(formData.get('peakPower')),
            modulesCount: Number(formData.get('modulesCount')),
            inverterModel: formData.get('inverterModel') as string,
            hasBattery: formData.get('hasBattery') === 'on',
            batteryCapacity: Number(formData.get('batteryCapacity')) || 0,
            installationType: formData.get('installationType') as any
        };
        newProject.pvData = pvData;
    } else if (modalType === 'Elevator') {
        const elevatorData: ElevatorData = {
            solutionType: formData.get('solutionType') as any,
            location: formData.get('elevatorLocation') as any, // Mapped from form name
            floors: Number(formData.get('floors')),
            stairWidth: Number(formData.get('stairWidth')),
            stairMaterial: formData.get('stairMaterial') as any,
            parkingSide: formData.get('parkingSide') as any
        };
        newProject.elevatorData = elevatorData;
    }

    onAddProject(newProject);
    setIsModalOpen(false);
    e.currentTarget.reset();
  };

  const getStatusColor = (status: ProjectStatus) => {
      switch (status) {
          case ProjectStatus.IN_PROGRESS: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
          case ProjectStatus.PLANNING: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
          case ProjectStatus.COMPLETED: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
          case ProjectStatus.PAUSED: return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
          default: return 'bg-slate-100 text-slate-700';
      }
  };

  const getTypeIcon = (type: ProjectType) => {
      switch (type) {
          case 'Photovoltaic': return <Zap className="w-5 h-5 text-yellow-500" />;
          case 'Elevator': return <ArrowUpFromLine className="w-5 h-5 text-rose-500" />;
          default: return <Building2 className="w-5 h-5 text-blue-500" />;
      }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col font-sans transition-colors duration-300">
      
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 shadow-sm px-8 py-5 flex justify-between items-center sticky top-0 z-10 border-b border-slate-100 dark:border-slate-700 transition-colors">
        <div>
           <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Oniluz Manager</h1>
           <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Bienvenido, {currentUserName}</p>
        </div>
        <div className="flex items-center gap-4">
            <button onClick={onOpenCalendar} className="p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Calendario">
                <Calendar className="w-5 h-5" />
            </button>
            <button onClick={onOpenPriceDb} className="p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Base de Precios">
                <Database className="w-5 h-5" />
            </button>
            <button onClick={onOpenGlobalFinance} className="p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Finanzas Globales">
                <BarChart3 className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <button onClick={onToggleDarkMode} className="p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 rounded-lg transition-colors">
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={onLogout} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 px-4 py-2 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors">
                <LogOut className="w-4 h-4" /> Salir
            </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 max-w-[1600px] mx-auto w-full">
         
         {/* Controls Bar */}
         <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 mb-8">
             <div className="flex items-center gap-4 w-full md:w-auto">
                 <div className="relative flex-1 md:w-96">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                     <input 
                        type="text" 
                        placeholder="Buscar obras..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#0047AB] outline-none shadow-sm text-slate-900 dark:text-white placeholder-slate-400 transition-colors"
                     />
                 </div>
                 <div className="relative">
                     <select 
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-10 pr-8 py-3 rounded-xl focus:ring-2 focus:ring-[#0047AB] outline-none shadow-sm text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
                     >
                         <option value="ALL">Todos los Estados</option>
                         <option value={ProjectStatus.PLANNING}>En Planificación</option>
                         <option value={ProjectStatus.IN_PROGRESS}>En Curso</option>
                         <option value={ProjectStatus.PAUSED}>Pausado</option>
                         <option value={ProjectStatus.COMPLETED}>Completado</option>
                     </select>
                     <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                 </div>
             </div>
             
             <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-[#0047AB] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#003380] transition-colors shadow-lg shadow-blue-900/20 flex items-center gap-2 transform active:scale-95 duration-150"
             >
                 <Plus className="w-5 h-5" /> Nueva Obra
             </button>
         </div>

         {/* Projects Grid */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
             {filteredProjects.map(project => (
                 <div 
                    key={project.id} 
                    onClick={() => onSelectProject(project.id)}
                    className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group flex flex-col h-full"
                 >
                     <div className="flex justify-between items-start mb-4">
                         <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl group-hover:bg-[#0047AB]/10 dark:group-hover:bg-blue-900/20 transition-colors">
                             {getTypeIcon(project.type)}
                         </div>
                         <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full ${getStatusColor(project.status)}`}>
                             {project.status}
                         </span>
                     </div>
                     
                     <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-1 line-clamp-1">{project.name}</h3>
                     <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center mb-4 line-clamp-1">
                         <MapPin className="w-3.5 h-3.5 mr-1" /> {project.location}
                     </p>
                     
                     <div className="mt-auto pt-4 border-t border-slate-50 dark:border-slate-700 space-y-3">
                         <div className="flex justify-between items-center text-sm">
                             <span className="text-slate-400 font-medium">Progreso</span>
                             <span className="font-bold text-slate-700 dark:text-slate-200">{project.progress}%</span>
                         </div>
                         <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                             <div 
                                className="bg-[#0047AB] h-full rounded-full transition-all duration-500" 
                                style={{width: `${project.progress}%`}}
                             ></div>
                         </div>
                         <div className="flex justify-between items-center text-sm pt-1">
                             <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                                <User className="w-3.5 h-3.5" />
                                <span className="text-xs font-semibold truncate max-w-[100px]">{project.client}</span>
                             </div>
                             <span className="font-bold text-slate-900 dark:text-white">{project.budget.toLocaleString()}€</span>
                         </div>
                     </div>
                 </div>
             ))}
             
             {/* Empty State */}
             {filteredProjects.length === 0 && (
                 <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
                     <Briefcase className="w-16 h-16 mb-4 opacity-20" />
                     <p className="text-lg font-medium">No se encontraron proyectos</p>
                     <p className="text-sm">Prueba con otros filtros o crea uno nuevo</p>
                 </div>
             )}
         </div>
      </div>

      {/* Create Project Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
              <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center sticky top-0 z-10">
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white">Nueva Obra</h2>
                      <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                          <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                      </button>
                  </div>
                  
                  <div className="overflow-y-auto p-8">
                      <form onSubmit={handleCreateProject} className="space-y-6">
                          
                          {/* Project Type Selector */}
                          <div>
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-3">Tipo de Proyecto</label>
                              <div className="flex gap-3">
                                  {(['General', 'Photovoltaic', 'Elevator'] as ProjectType[]).map(type => (
                                      <button
                                          key={type}
                                          type="button"
                                          onClick={() => setModalType(type)}
                                          className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-bold transition-all flex flex-col items-center justify-center gap-2 ${
                                              modalType === type 
                                              ? 'border-[#0047AB] bg-blue-50 dark:bg-blue-900/20 text-[#0047AB] dark:text-blue-400' 
                                              : 'border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-600'
                                          }`}
                                      >
                                          {getTypeIcon(type)}
                                          {type === 'Photovoltaic' ? 'Fotovoltaica' : type === 'Elevator' ? 'Elevador' : 'General'}
                                      </button>
                                  ))}
                              </div>
                          </div>

                          {/* Common Fields */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Nombre del Proyecto</label>
                                  <input name="name" required className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Cliente</label>
                                  <input name="client" required className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Ubicación</label>
                                  <input name="location" required className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Presupuesto (€)</label>
                                  <input name="budget" type="number" required className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                              </div>
                              <div className="md:col-span-2">
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Descripción</label>
                                  <textarea name="description" rows={3} required className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white resize-none transition-colors"></textarea>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Fecha Inicio</label>
                                  <input name="startDate" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                              </div>
                          </div>

                          {/* Specific Photovoltaic Fields */}
                          {modalType === 'Photovoltaic' && (
                              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-5 rounded-2xl border border-yellow-100 dark:border-yellow-800 space-y-4">
                                  <h3 className="text-sm font-bold text-yellow-700 dark:text-yellow-500 uppercase tracking-wide flex items-center gap-2">
                                      <Zap className="w-4 h-4" /> Configuración Solar
                                  </h3>
                                  <div className="flex gap-4">
                                      <div className="w-1/2">
                                          <label className="text-[10px] font-bold text-yellow-700/70 dark:text-yellow-400 uppercase">Potencia Pico (kWp)</label>
                                          <input name="peakPower" type="number" step="0.1" required className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                                      </div>
                                      <div className="w-1/2">
                                          <label className="text-[10px] font-bold text-yellow-700/70 dark:text-yellow-400 uppercase">Nº Módulos</label>
                                          <input name="modulesCount" type="number" required className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                                      </div>
                                  </div>
                                  <div>
                                      <label className="text-[10px] font-bold text-yellow-700/70 dark:text-yellow-400 uppercase">Modelo Inversor</label>
                                      <input name="inverterModel" required className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                                  </div>
                                  <div className="flex items-center gap-4">
                                      <div className="flex items-center">
                                          <input name="hasBattery" type="checkbox" className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500" />
                                          <label className="ml-2 text-sm font-bold text-yellow-900 dark:text-yellow-100">Incluye Batería</label>
                                      </div>
                                      <div className="flex-1">
                                          <input name="batteryCapacity" type="number" placeholder="Capacidad (kWh)" className="w-full p-2 bg-white dark:bg-slate-800 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                                      </div>
                                  </div>
                                  <div>
                                      <label className="text-[10px] font-bold text-yellow-700/70 dark:text-yellow-400 uppercase">Tipo Instalación</label>
                                      <select name="installationType" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-slate-900 dark:text-white">
                                          <option value="Residential">Residencial</option>
                                          <option value="Industrial">Industrial</option>
                                          <option value="Solar Farm">Huerto Solar</option>
                                      </select>
                                  </div>
                              </div>
                          )}

                          {/* Specific Elevator Fields (Válida) */}
                          {modalType === 'Elevator' && (
                            <div className="bg-rose-50 dark:bg-rose-900/20 p-5 rounded-2xl border border-rose-100 dark:border-rose-800 space-y-4">
                                <h3 className="text-sm font-bold text-rose-700 dark:text-rose-500 uppercase tracking-wide flex items-center gap-2">
                                    <ArrowUpFromLine className="w-4 h-4" /> Configuración Elevador
                                </h3>
                                <div>
                                     <label className="text-[10px] font-bold text-rose-700/70 dark:text-rose-400 uppercase">Tipo de Solución</label>
                                     <select name="solutionType" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 rounded-lg text-sm text-slate-900 dark:text-white">
                                         <option value="Silla Recta">Silla Salvaescaleras Recta</option>
                                         <option value="Silla Curva">Silla Salvaescaleras Curva</option>
                                         <option value="Plataforma">Plataforma Salvaescaleras</option>
                                         <option value="Elevador Vertical">Elevador Vertical (Corto Recorrido)</option>
                                     </select>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-1/2">
                                        <label className="text-[10px] font-bold text-rose-700/70 dark:text-rose-400 uppercase">Nº Plantas/Paradas</label>
                                        <input name="floors" type="number" min="1" required className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                                    </div>
                                    <div className="w-1/2">
                                        <label className="text-[10px] font-bold text-rose-700/70 dark:text-rose-400 uppercase">Ubicación</label>
                                        <select name="elevatorLocation" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 rounded-lg text-sm text-slate-900 dark:text-white">
                                            <option value="Interior">Interior</option>
                                            <option value="Intemperie">Intemperie (Exterior)</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-1/2">
                                        <label className="text-[10px] font-bold text-rose-700/70 dark:text-rose-400 uppercase">Ancho Escalera (cm)</label>
                                        <div className="relative">
                                            <Ruler className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                            <input name="stairWidth" type="number" placeholder="Ej: 80" className="w-full mt-1 pl-7 p-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                                        </div>
                                    </div>
                                     <div className="w-1/2">
                                        <label className="text-[10px] font-bold text-rose-700/70 dark:text-rose-400 uppercase">Lado Aparcamiento</label>
                                        <select name="parkingSide" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 rounded-lg text-sm text-slate-900 dark:text-white">
                                            <option value="Derecha">Derecha</option>
                                            <option value="Izquierda">Izquierda</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                     <label className="text-[10px] font-bold text-rose-700/70 dark:text-rose-400 uppercase">Material Escalera (Fijación)</label>
                                     <select name="stairMaterial" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 rounded-lg text-sm text-slate-900 dark:text-white">
                                         <option value="Hormigón">Hormigón / Obra</option>
                                         <option value="Madera">Madera</option>
                                         <option value="Metal">Metálica</option>
                                         <option value="Mármol">Mármol / Granito</option>
                                     </select>
                                </div>
                            </div>
                          )}

                          <button type="submit" className="w-full bg-[#0047AB] text-white py-4 rounded-xl font-bold hover:bg-[#003380] transition-colors shadow-lg shadow-blue-900/20 text-lg flex items-center justify-center gap-2">
                              <Plus className="w-5 h-5" /> Crear Proyecto
                          </button>
                      </form>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default ProjectList;
