import React, { useState } from 'react';
import { Project, ProjectStatus, ProjectType } from '../types';
import { 
  Plus, Search, Calendar, Database, BarChart3, Sun, Moon, LogOut, 
  MapPin, Briefcase, Zap, ArrowRight, Filter, X,
  MoveVertical, Ruler, Sun as SunIcon
} from 'lucide-react';
import GlobalAssistant from './GlobalAssistant';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'ALL'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<ProjectType>('General');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.client.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateProject = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    // Construct basic project
    const newProject: Project = {
        id: '', // Will be set by App/DB
        type: modalType,
        name: formData.get('name') as string,
        client: formData.get('client') as string,
        location: formData.get('location') as string,
        status: ProjectStatus.PLANNING,
        progress: 0,
        startDate: formData.get('startDate') as string,
        endDate: formData.get('endDate') as string,
        description: formData.get('description') as string,
        budget: Number(formData.get('budget')),
        transactions: [],
        materials: [],
        incidents: [],
        documents: [],
        // Specific data
        pvData: modalType === 'Photovoltaic' ? {
            peakPower: Number(formData.get('peakPower')),
            modulesCount: Number(formData.get('modulesCount')),
            inverterModel: formData.get('inverterModel') as string,
            hasBattery: formData.get('hasBattery') === 'on',
            batteryCapacity: Number(formData.get('batteryCapacity')),
            installationType: formData.get('installationType') as any
        } : undefined,
        elevatorData: modalType === 'Elevator' ? {
            solutionType: formData.get('solutionType') as any,
            location: formData.get('elevatorLocation') as any,
            floors: Number(formData.get('floors')),
            stairWidth: Number(formData.get('stairWidth')),
            stairMaterial: formData.get('stairMaterial') as any,
            parkingSide: formData.get('parkingSide') as any
        } : undefined
    };

    onAddProject(newProject);
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      {/* Navbar */}
      <nav className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 sticky top-0 z-30 px-6 py-4 flex justify-between items-center shadow-sm transition-colors">
         <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0047AB] rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Oniluz Manager</h1>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Panel de Control</p>
            </div>
         </div>
         
         <div className="flex items-center gap-4">
             <div className="hidden md:flex flex-col items-end mr-2">
                 <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{currentUserName}</span>
                 <span className="text-[10px] text-green-500 font-bold bg-green-50 dark:bg-green-900/20 px-2 rounded-full">Online</span>
             </div>
             
             <button onClick={onToggleDarkMode} className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                 {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
             </button>
             
             <button onClick={onLogout} className="p-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors" title="Cerrar Sesión">
                 <LogOut className="w-5 h-5" />
             </button>
         </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto p-4 sm:p-8">
         
         {/* Action Bar */}
         <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-10">
             <div>
                 <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Mis Proyectos</h2>
                 <p className="text-slate-500 dark:text-slate-400">Gestiona tus obras, presupuestos e incidencias en tiempo real.</p>
             </div>
             
             <div className="flex flex-wrap gap-3 w-full xl:w-auto">
                 <button onClick={onOpenGlobalFinance} className="flex-1 xl:flex-none items-center justify-center flex gap-2 px-5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors">
                     <BarChart3 className="w-5 h-5 text-[#0047AB] dark:text-blue-400" /> Finanzas
                 </button>
                 <button onClick={onOpenPriceDb} className="flex-1 xl:flex-none items-center justify-center flex gap-2 px-5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors">
                     <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" /> Precios
                 </button>
                 <button onClick={onOpenCalendar} className="flex-1 xl:flex-none items-center justify-center flex gap-2 px-5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors">
                     <Calendar className="w-5 h-5 text-orange-500 dark:text-orange-400" /> Calendario
                 </button>
                 <button onClick={() => setIsModalOpen(true)} className="flex-1 xl:flex-none items-center justify-center flex gap-2 px-6 py-3 bg-[#0047AB] text-white rounded-xl font-bold hover:bg-[#003380] shadow-lg shadow-blue-900/20 transition-all transform hover:scale-[1.02]">
                     <Plus className="w-5 h-5" /> Nuevo Proyecto
                 </button>
             </div>
         </div>

         {/* Filters */}
         <div className="flex flex-col sm:flex-row gap-4 mb-8 bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
             <div className="relative flex-1">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                 <input 
                    type="text" 
                    placeholder="Buscar por nombre, cliente..." 
                    className="w-full pl-12 pr-4 py-3 bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white placeholder-slate-400"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                 />
             </div>
             <div className="flex items-center gap-2 px-2 overflow-x-auto no-scrollbar">
                 <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                 {['ALL', ...Object.values(ProjectStatus)].map(status => (
                     <button 
                        key={status}
                        onClick={() => setStatusFilter(status as any)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                            statusFilter === status 
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md' 
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                     >
                         {status === 'ALL' ? 'Todos' : status}
                     </button>
                 ))}
             </div>
         </div>

         {/* Grid */}
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
             {filteredProjects.map(project => (
                 <div 
                    key={project.id} 
                    onClick={() => onSelectProject(project.id)}
                    className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700 cursor-pointer hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-800 transition-all group relative overflow-hidden"
                 >
                     <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-[#0047AB] to-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                     
                     <div className="flex justify-between items-start mb-4">
                         <div className={`p-3 rounded-xl ${
                             project.type === 'Photovoltaic' ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400' :
                             project.type === 'Elevator' ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400' :
                             'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                         }`}>
                             {project.type === 'Photovoltaic' ? <SunIcon className="w-6 h-6" /> : 
                              project.type === 'Elevator' ? <MoveVertical className="w-6 h-6" /> : 
                              <Briefcase className="w-6 h-6" />}
                         </div>
                         <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                             project.status === 'En Curso' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                             project.status === 'Completado' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                             'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                         }`}>
                             {project.status}
                         </span>
                     </div>

                     <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 group-hover:text-[#0047AB] dark:group-hover:text-blue-400 transition-colors line-clamp-1">{project.name}</h3>
                     <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 flex items-center gap-1">
                         <MapPin className="w-3.5 h-3.5" /> {project.location}
                     </p>

                     <div className="grid grid-cols-2 gap-4 mb-6">
                         <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl">
                             <span className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase block mb-1">Presupuesto</span>
                             <span className="text-slate-900 dark:text-white font-bold">{project.budget.toLocaleString()}€</span>
                         </div>
                         <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl">
                             <span className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase block mb-1">Cliente</span>
                             <span className="text-slate-900 dark:text-white font-bold truncate block" title={project.client}>{project.client}</span>
                         </div>
                     </div>

                     <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100 dark:border-slate-700">
                         <div className="w-24">
                             <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
                                 <span>Progreso</span>
                                 <span>{project.progress}%</span>
                             </div>
                             <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                 <div className="h-full bg-[#0047AB] dark:bg-blue-500 rounded-full" style={{width: `${project.progress}%`}}></div>
                             </div>
                         </div>
                         <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-slate-400 group-hover:bg-[#0047AB] group-hover:text-white transition-colors">
                             <ArrowRight className="w-4 h-4" />
                         </div>
                     </div>
                 </div>
             ))}

             {filteredProjects.length === 0 && (
                 <div className="col-span-full py-20 text-center">
                     <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300 dark:text-slate-600">
                         <Search className="w-8 h-8" />
                     </div>
                     <h3 className="text-slate-900 dark:text-white font-bold text-lg">No se encontraron proyectos</h3>
                     <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Prueba con otros términos de búsqueda o crea un nuevo proyecto.</p>
                 </div>
             )}
         </div>
      </main>

      {/* Create Project Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 flex flex-col transition-colors">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/30">
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white">Nuevo Proyecto</h2>
                      <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-600 rounded-full transition-colors text-slate-500">
                          <X className="w-5 h-5" />
                      </button>
                  </div>
                  
                  <form onSubmit={handleCreateProject} className="p-8 space-y-6">
                      
                      {/* Project Type Selector */}
                      <div className="grid grid-cols-3 gap-4 mb-6">
                          {[
                              { id: 'General', label: 'General', icon: Briefcase },
                              { id: 'Photovoltaic', label: 'Fotovoltaica', icon: SunIcon },
                              { id: 'Elevator', label: 'Ascensor', icon: MoveVertical }
                          ].map(type => (
                              <button
                                type="button"
                                key={type.id}
                                onClick={() => setModalType(type.id as ProjectType)}
                                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                                    modalType === type.id 
                                    ? 'border-[#0047AB] bg-blue-50 dark:bg-blue-900/20 text-[#0047AB] dark:text-blue-400 font-bold' 
                                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600'
                                }`}
                              >
                                  <type.icon className="w-6 h-6" />
                                  <span className="text-xs uppercase">{type.label}</span>
                              </button>
                          ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Nombre del Proyecto</label>
                              <input name="name" required className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" placeholder="Ej: Reforma Eléctrica..." />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cliente</label>
                              <input name="client" required className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" placeholder="Ej: Comunidad Propietarios..." />
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div>
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Ubicación</label>
                              <div className="relative">
                                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                  <input name="location" required className="w-full mt-2 pl-10 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" placeholder="Dirección completa" />
                              </div>
                           </div>
                           <div>
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Presupuesto Inicial (€)</label>
                              <input name="budget" type="number" step="0.01" required className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" placeholder="0.00" />
                           </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div>
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Fecha Inicio</label>
                              <input name="startDate" type="date" required className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                           </div>
                           <div>
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Fecha Fin (Estimada)</label>
                              <input name="endDate" type="date" className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors" />
                           </div>
                      </div>

                      <div>
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Descripción</label>
                          <textarea name="description" className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white h-24 resize-none transition-colors" placeholder="Detalles importantes del proyecto..."></textarea>
                      </div>

                      {/* PV Specifics */}
                      {modalType === 'Photovoltaic' && (
                          <div className="bg-orange-50 dark:bg-orange-900/20 p-5 rounded-2xl border border-orange-100 dark:border-orange-800 space-y-4">
                              <h3 className="text-sm font-bold text-orange-700 dark:text-orange-500 uppercase tracking-wide flex items-center gap-2">
                                  <SunIcon className="w-4 h-4" /> Configuración Solar
                              </h3>
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="text-[10px] font-bold text-orange-700/70 dark:text-orange-400 uppercase">Potencia Pico (kWp)</label>
                                      <input name="peakPower" type="number" step="0.1" required className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                                  </div>
                                  <div>
                                      <label className="text-[10px] font-bold text-orange-700/70 dark:text-orange-400 uppercase">Nº Módulos</label>
                                      <input name="modulesCount" type="number" required className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                                  </div>
                              </div>
                              <div>
                                  <label className="text-[10px] font-bold text-orange-700/70 dark:text-orange-400 uppercase">Inversor (Modelo)</label>
                                  <input name="inverterModel" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                              </div>
                              <div className="flex items-center gap-3">
                                  <input type="checkbox" name="hasBattery" id="hasBattery" className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500" />
                                  <label htmlFor="hasBattery" className="text-sm font-bold text-slate-700 dark:text-slate-300">Incluye Baterías</label>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="text-[10px] font-bold text-orange-700/70 dark:text-orange-400 uppercase">Capacidad Batería (kWh)</label>
                                      <input name="batteryCapacity" type="number" step="0.1" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-700 rounded-lg text-sm text-slate-900 dark:text-white" />
                                  </div>
                                  <div>
                                      <label className="text-[10px] font-bold text-orange-700/70 dark:text-orange-400 uppercase">Tipo Instalación</label>
                                      <select name="installationType" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-700 rounded-lg text-sm text-slate-900 dark:text-white">
                                          <option value="Residential">Residencial</option>
                                          <option value="Industrial">Industrial</option>
                                          <option value="Solar Farm">Huerto Solar</option>
                                      </select>
                                  </div>
                              </div>
                          </div>
                      )}

                      {/* Elevator Specifics */}
                      {modalType === 'Elevator' && (
                        <div className="bg-rose-50 dark:bg-rose-900/20 p-5 rounded-2xl border border-rose-100 dark:border-rose-800 space-y-4">
                            <h3 className="text-sm font-bold text-rose-700 dark:text-rose-500 uppercase tracking-wide flex items-center gap-2">
                                <MoveVertical className="w-4 h-4" /> Configuración Elevador
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

                      <div className="pt-4 flex gap-4">
                          <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">Cancelar</button>
                          <button type="submit" className="flex-1 py-3.5 bg-[#0047AB] text-white font-bold rounded-xl hover:bg-[#003380] shadow-lg shadow-blue-900/20 transition-colors">Crear Proyecto</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      <GlobalAssistant isOpen={isAssistantOpen} onClose={() => setIsAssistantOpen(false)} />
      
      {/* Floating Assistant Button */}
      <button 
        onClick={() => setIsAssistantOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#0047AB] text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform z-40"
        title="Asistente REBT"
      >
        <Zap className="w-7 h-7 fill-current" />
      </button>

    </div>
  );
};

export default ProjectList;