import React, { useState, useRef, useEffect } from 'react';
import { Project, ProjectStatus, Transaction, ProjectDocument, ProjectType, PvData, Material, ElevatorData } from '../types';
import { Plus, Search, Building2, MapPin, Camera, PieChart, Database, Upload, FileText, Menu, Moon, Sun, ChevronRight, X, Zap, Sun as SunIcon, Battery, Calendar, HardHat, Sparkles, LogOut, Ruler, Layers, Navigation } from 'lucide-react';
import ScannerModal from './ScannerModal';
import GlobalAssistant from './GlobalAssistant';
import { calculateDrivingDistance } from '../services/geminiService';

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
  onAddProject: (p: Project) => void;
  onUpdateProject: (p: Project) => void;
  onOpenGlobalFinance: () => void;
  onOpenPriceDb: () => void;
  onOpenCalendar: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  currentUserName: string;
}

const ProjectList: React.FC<ProjectListProps> = ({ 
  projects, onSelectProject, onAddProject, onUpdateProject, 
  onOpenGlobalFinance, onOpenPriceDb, onOpenCalendar, isDarkMode, onToggleDarkMode, onLogout, currentUserName
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<ProjectType>('General'); // Track which type we are creating
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<ProjectType | 'ALL'>('ALL'); // NEW: Type Filter State
  const [showIncidentsOnly, setShowIncidentsOnly] = useState(false);
  const [initialFiles, setInitialFiles] = useState<ProjectDocument[]>([]);
  const [calculatedDistance, setCalculatedDistance] = useState<number | null>(null);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
  const [locationInput, setLocationInput] = useState(''); // Track location input for distance calculation

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter Logic: Filter by Search, Status AND Type
  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.client.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    const matchesIncidents = !showIncidentsOnly || p.incidents.some(i => i.status === 'Open');
    const matchesType = typeFilter === 'ALL' || p.type === typeFilter; // NEW: Type check
    return matchesSearch && matchesStatus && matchesIncidents && matchesType;
  });

  // Calculate stats based on FILTERED view
  // NOTE: We update totalBudget calculation here to also be robust (sum accepted budgets if project budget is 0)
  const totalProjects = filteredProjects.length;
  const inProgressCount = filteredProjects.filter(p => p.status === ProjectStatus.IN_PROGRESS).length;
  
  const totalBudget = filteredProjects.reduce((sum, p) => {
      const activeBudgets = p.budgets?.filter(b => b.status === 'Accepted').reduce((s, b) => s + b.total, 0) || 0;
      const effectiveBudget = p.budget > 0 ? p.budget : activeBudgets;
      return sum + effectiveBudget;
  }, 0);

  const activeIncidents = filteredProjects.reduce((sum, p) => sum + p.incidents.filter(i => i.status === 'Open').length, 0);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          Array.from(e.target.files).forEach((file: File) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                  const base64String = reader.result as string;
                  const type = file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other';
                  const newDoc: ProjectDocument = {
                      id: Date.now().toString() + Math.random(),
                      projectId: '', // Will assign when creating project
                      name: file.name,
                      type: type as any,
                      date: new Date().toISOString().split('T')[0],
                      data: base64String
                  };
                  setInitialFiles(prev => [...prev, newDoc]);
              };
              reader.readAsDataURL(file);
          });
      }
  };

  const handleOpenCreateModal = (type: ProjectType) => {
      setModalType(type);
      setCalculatedDistance(null);
      setLocationInput('');
      setIsModalOpen(true);
  };

  const handleCalculateDistance = async () => {
      if (!locationInput) return;
      setIsCalculatingDistance(true);
      try {
          const dist = await calculateDrivingDistance(locationInput);
          setCalculatedDistance(dist);
      } catch (error) {
          console.error("Error distance:", error);
      } finally {
          setIsCalculatingDistance(false);
      }
  };

  const handleCreateProject = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const projectId = Date.now().toString();
    
    // Assign project ID to uploaded docs
    const documents = initialFiles.map(doc => ({ ...doc, projectId }));

    // PV Specific Data extraction
    let pvData: PvData | undefined;
    if (modalType === 'Photovoltaic') {
        pvData = {
            peakPower: Number(formData.get('peakPower')),
            modulesCount: Number(formData.get('modulesCount')),
            inverterModel: formData.get('inverterModel') as string,
            hasBattery: formData.get('hasBattery') === 'on',
            batteryCapacity: Number(formData.get('batteryCapacity')) || 0,
            installationType: formData.get('installationType') as any
        };
    }

    // Elevator Specific Data extraction
    let elevatorData: ElevatorData | undefined;
    if (modalType === 'Elevator') {
        elevatorData = {
            solutionType: formData.get('solutionType') as any,
            location: formData.get('elevatorLocation') as any,
            floors: Number(formData.get('floors')),
            stairWidth: Number(formData.get('stairWidth')),
            stairMaterial: formData.get('stairMaterial') as any,
            parkingSide: formData.get('parkingSide') as any,
            distanceFromBase: calculatedDistance || undefined
        };
    }

    const newProject: Project = {
      id: projectId,
      type: modalType,
      pvData: pvData,
      elevatorData: elevatorData,
      name: formData.get('name') as string,
      client: formData.get('client') as string,
      clientPhone: formData.get('clientPhone') as string,
      clientEmail: formData.get('clientEmail') as string,
      location: formData.get('location') as string,
      status: ProjectStatus.PLANNING,
      progress: 0,
      startDate: formData.get('startDate') as string,
      endDate: formData.get('endDate') as string || '',
      budget: 0, // Initial budget is 0, to be defined in details
      description: formData.get('description') as string,
      transactions: [],
      materials: [],
      incidents: [],
      budgets: [],
      documents: documents
    };
    onAddProject(newProject);
    setIsModalOpen(false);
    setInitialFiles([]);
  };

  const handleScanSave = (projectId: string, transaction: Transaction, newMaterials: Material[], newDocument?: ProjectDocument) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
        const updatedProject = {
            ...project,
            transactions: [transaction, ...project.transactions],
            materials: [...project.materials, ...newMaterials],
            documents: newDocument ? [...project.documents, newDocument] : project.documents
        };
        onUpdateProject(updatedProject);
        setIsScannerOpen(false);
        alert(`Guardado correctamente: Gasto registrado${newMaterials.length > 0 ? `, ${newMaterials.length} nuevos materiales` : ''}${newDocument ? ' y documento adjuntado' : ''}.`);
    }
  };

  return (
    <>
      <div className="p-6 max-w-7xl mx-auto pb-24 bg-slate-100 dark:bg-slate-900 min-h-screen transition-colors duration-300">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white flex items-center gap-4 tracking-tight">
              <div className="w-14 h-14 bg-[#0047AB] rounded-full text-white shadow-lg shadow-blue-900/30 flex items-center justify-center shrink-0 relative overflow-hidden ring-4 ring-white dark:ring-slate-800">
                  <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2C8.13 2 5 5.13 5 9C5 11.38 6.19 13.47 8 14.74V17C8 17.55 8.45 18 9 18H15C15.55 18 16 17.55 16 17V14.74C17.81 13.47 19 11.38 19 9C19 5.13 15.87 2 12 2ZM9 19H15V20C15 20.55 14.55 21 14 21H10C9.45 21 9 20.55 9 20V19Z" fill="currentColor" fillOpacity="0.2"/>
                      <path d="M12 6V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M12 12L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M12 12L15 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M12 22H12.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
              </div>
              Oniluz AI
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg font-medium">Gestión integral de obras</p>
          </div>
          
          <div className="flex items-center gap-3">
              {/* AI Assistant Button */}
              <button 
                  onClick={() => setIsAssistantOpen(true)}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#0047AB] dark:text-blue-400 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2 group"
                  title="Asistente Oniluz"
              >
                  <Sparkles className="w-5 h-5" />
                  <span className="font-bold text-sm hidden sm:inline group-hover:text-[#003380] dark:group-hover:text-blue-300">Asistente</span>
              </button>

              {/* New Project Buttons */}
              <button 
                  onClick={() => handleOpenCreateModal('General')}
                  className="bg-[#0047AB] text-white px-5 py-3 rounded-xl hover:bg-[#003380] transition-all flex items-center font-semibold shadow-lg shadow-blue-900/20 transform hover:-translate-y-0.5"
              >
                  <Plus className="w-5 h-5 mr-2" /> <span className="hidden sm:inline">Nuevo Proyecto</span>
              </button>
              <button 
                  onClick={() => handleOpenCreateModal('Photovoltaic')}
                  className="bg-amber-500 text-white px-5 py-3 rounded-xl hover:bg-amber-600 transition-all flex items-center font-semibold shadow-lg shadow-amber-500/20 transform hover:-translate-y-0.5"
              >
                  <SunIcon className="w-5 h-5 mr-2" /> <span className="hidden sm:inline">Nuevo FV</span>
              </button>
              <button 
                  onClick={() => handleOpenCreateModal('Elevator')}
                  className="bg-rose-600 text-white px-5 py-3 rounded-xl hover:bg-rose-700 transition-all flex items-center font-semibold shadow-lg shadow-rose-600/20 transform hover:-translate-y-0.5"
              >
                  <HangGlider className="w-5 h-5 mr-2" /> <span className="hidden sm:inline">Válida</span>
              </button>

              {/* Menu Dropdown */}
              <div className="relative" ref={menuRef}>
                  <button 
                      onClick={() => setIsMenuOpen(!isMenuOpen)}
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm hover:shadow-md"
                  >
                      <Menu className="w-6 h-6" />
                  </button>

                  {isMenuOpen && (
                      <div className="absolute right-0 top-full mt-3 w-72 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 z-50 overflow-hidden transform origin-top-right transition-all animate-in fade-in zoom-in-95 duration-200">
                          <div className="p-4 border-b border-slate-100 dark:border-slate-700">
                              <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Herramientas</div>
                              <div className="space-y-1">
                                  <button 
                                      onClick={() => { onOpenCalendar(); setIsMenuOpen(false); }}
                                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200 transition-colors group"
                                  >
                                      <div className="flex items-center gap-3">
                                          <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                                              <Calendar className="w-5 h-5" />
                                          </div>
                                          <span className="font-semibold">Calendario Obras</span>
                                      </div>
                                      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500" />
                                  </button>
                                  <button 
                                      onClick={() => { onOpenGlobalFinance(); setIsMenuOpen(false); }}
                                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200 transition-colors group"
                                  >
                                      <div className="flex items-center gap-3">
                                          <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg text-green-600 dark:text-green-400">
                                              <PieChart className="w-5 h-5" />
                                          </div>
                                          <span className="font-semibold">Finanzas Globales</span>
                                      </div>
                                      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500" />
                                  </button>
                                  <button 
                                      onClick={() => { onOpenPriceDb(); setIsMenuOpen(false); }}
                                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200 transition-colors group"
                                  >
                                      <div className="flex items-center gap-3">
                                          <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg text-blue-600 dark:text-blue-400">
                                              <Database className="w-5 h-5" />
                                          </div>
                                          <span className="font-semibold">Base de Precios</span>
                                      </div>
                                      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500" />
                                  </button>
                              </div>
                          </div>
                          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 space-y-4">
                              <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                      {isDarkMode ? <Moon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
                                      Modo Oscuro
                                  </span>
                                  <button 
                                      onClick={onToggleDarkMode}
                                      className={`w-12 h-6 rounded-full transition-colors relative ${isDarkMode ? 'bg-[#0047AB]' : 'bg-slate-300'}`}
                                  >
                                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-sm ${isDarkMode ? 'left-7' : 'left-1'}`}></div>
                                  </button>
                              </div>
                              <button 
                                  onClick={onLogout}
                                  className="w-full flex items-center justify-center p-2.5 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-100 transition-all font-semibold text-sm gap-2"
                              >
                                  <LogOut className="w-4 h-4" /> Cerrar Sesión
                              </button>
                          </div>
                      </div>
                  )}
              </div>
          </div>
        </div>

        {/* ... (Business Unit Tabs and Filters remain unchanged) ... */}
        
        {/* Business Unit Tabs (New Feature) */}
        <div className="flex p-1 space-x-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl mb-8 overflow-x-auto border border-slate-200 dark:border-slate-700">
           {/* All */}
           <button
             onClick={() => setTypeFilter('ALL')}
             className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all whitespace-nowrap px-4 ${
               typeFilter === 'ALL'
                 ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                 : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
             }`}
           >
             Todos
           </button>
           {/* General */}
           <button
             onClick={() => setTypeFilter('General')}
             className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4 ${
               typeFilter === 'General'
                 ? 'bg-white dark:bg-slate-700 text-[#0047AB] dark:text-blue-400 shadow-sm'
                 : 'text-slate-500 dark:text-slate-400 hover:text-[#0047AB] dark:hover:text-blue-400'
             }`}
           >
             <Zap className="w-4 h-4" /> Eléctrico
           </button>
           {/* PV */}
           <button
             onClick={() => setTypeFilter('Photovoltaic')}
             className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4 ${
               typeFilter === 'Photovoltaic'
                 ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm'
                 : 'text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400'
             }`}
           >
             <SunIcon className="w-4 h-4" /> Fotovoltaica
           </button>
           {/* Elevator */}
           <button
             onClick={() => setTypeFilter('Elevator')}
             className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4 ${
               typeFilter === 'Elevator'
                 ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-sm'
                 : 'text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400'
             }`}
           >
             <HangGlider className="w-4 h-4" /> Válida
           </button>
        </div>

        {/* ... (rest of search and filters) ... */}
        
        {/* Interactive Filters (Cards with Depth) - Context Aware based on Type Filter */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
          <button 
            onClick={() => { setStatusFilter('ALL'); setShowIncidentsOnly(false); }}
            className={`p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border transition-all text-left group ${
                statusFilter === 'ALL' && !showIncidentsOnly 
                ? 'bg-white dark:bg-slate-800 border-[#0047AB] ring-1 ring-[#0047AB]/20' 
                : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500'
            }`}
          >
              <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Total {typeFilter !== 'ALL' ? (typeFilter === 'General' ? 'Elec' : typeFilter === 'Photovoltaic' ? 'FV' : 'Válida') : ''}</div>
              <div className="text-3xl font-bold text-slate-800 dark:text-white group-hover:text-[#0047AB] transition-colors">{totalProjects}</div>
          </button>
          
          <button 
              onClick={() => { setStatusFilter(ProjectStatus.IN_PROGRESS); setShowIncidentsOnly(false); }}
              className={`p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border transition-all text-left group ${
                  statusFilter === ProjectStatus.IN_PROGRESS 
                  ? 'bg-white dark:bg-slate-800 border-[#0047AB] ring-1 ring-[#0047AB]/20' 
                  : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500'
              }`}
          >
              <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">En Curso</div>
              <div className="text-3xl font-bold text-[#0047AB]">{inProgressCount}</div>
          </button>
          
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 dark:border-slate-700 cursor-default">
              <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Presupuesto {typeFilter !== 'ALL' ? 'Dpto.' : 'Total'}</div>
              <div className="text-3xl font-bold text-slate-800 dark:text-white">
                {(totalBudget/1000).toFixed(1)}k€
              </div>
          </div>
          
          <button 
              onClick={() => { setStatusFilter('ALL'); setShowIncidentsOnly(true); }}
              className={`p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border transition-all text-left group ${
                  showIncidentsOnly 
                  ? 'bg-white dark:bg-slate-800 border-red-500 ring-1 ring-red-200' 
                  : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500'
              }`}
          >
              <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Incidencias Activas</div>
              <div className="text-3xl font-bold text-red-500">
                {activeIncidents}
              </div>
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder={`Buscar en proyectos ${typeFilter !== 'ALL' ? (typeFilter === 'General' ? 'eléctricos' : typeFilter === 'Photovoltaic' ? 'fotovoltaicos' : 'válida') : 'todos'}...`}
            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-[#0047AB] focus:border-[#0047AB] outline-none transition-all shadow-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredProjects.map((project) => {
             // Logic to find description: Prioritize AI Prompt from latest budget, else use manual description
             const latestBudgetWithPrompt = project.budgets?.filter(b => b.aiPrompt).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
             const displayDescription = latestBudgetWithPrompt?.aiPrompt || project.description;
             const isAiDescription = !!latestBudgetWithPrompt?.aiPrompt;

             // Calculate Total Collected (Adelanto) based on all Income transactions
             const totalCollected = project.transactions
                .filter(t => t.type === 'income')
                .reduce((sum, t) => sum + t.amount, 0);

             // --- CRITICAL FIX: DYNAMIC BUDGET DISPLAY ---
             // Fallback to sum of accepted budgets if project.budget is 0. 
             // Ensures older projects or those not yet synced display the correct total.
             const activeBudgetsTotal = project.budgets?.filter(b => b.status === 'Accepted').reduce((sum, b) => sum + b.total, 0) || 0;
             const displayBudget = project.budget > 0 ? project.budget : activeBudgetsTotal;

             // Budget Execution percentage
             const expenses = project.transactions.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
             const budgetProgress = displayBudget > 0 ? (expenses / displayBudget) * 100 : 0;

             return (
            <div 
              key={project.id} 
              onClick={() => onSelectProject(project.id)}
              className="group bg-white dark:bg-slate-800 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.03)] border border-slate-100 dark:border-slate-700 hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] hover:border-[#0047AB]/30 dark:hover:border-[#0047AB]/50 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col h-full transform hover:-translate-y-1"
            >
              <div className="p-7 flex-1">
                <div className="flex justify-between items-start mb-5">
                  <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${
                    project.status === ProjectStatus.IN_PROGRESS ? 'bg-green-50 text-green-700 border border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' :
                    project.status === ProjectStatus.COMPLETED ? 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800' :
                    'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
                  }`}>
                    {project.status}
                  </span>
                  
                  {/* Project Type Badge */}
                  {project.type === 'Photovoltaic' ? (
                      <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-lg border border-amber-100 dark:border-amber-800">
                          <SunIcon className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase">FV</span>
                      </div>
                  ) : project.type === 'Elevator' ? (
                      <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-2.5 py-1 rounded-lg border border-rose-100 dark:border-rose-800">
                          <HangGlider className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase">Válida</span>
                      </div>
                  ) : (
                      <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 text-[#0047AB] dark:text-blue-400 px-2.5 py-1 rounded-lg border border-blue-100 dark:border-blue-800">
                          <Zap className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase">Elec</span>
                      </div>
                  )}
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2 group-hover:text-[#0047AB] transition-colors line-clamp-2">{project.name}</h3>
                <div className="flex items-center text-sm text-slate-500 dark:text-slate-400 mb-4">
                  <Building2 className="w-4 h-4 mr-1.5" /> {project.client}
                </div>

                {/* Specific PV Info Card */}
                {project.type === 'Photovoltaic' && project.pvData && (
                    <div className="mb-4 grid grid-cols-2 gap-2">
                          <div className="bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg text-center">
                              <span className="block text-[10px] text-amber-700 dark:text-amber-400 font-bold uppercase">Potencia</span>
                              <span className="block font-bold text-slate-800 dark:text-slate-200">{project.pvData.peakPower} kWp</span>
                          </div>
                          <div className="bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg text-center">
                              <span className="block text-[10px] text-amber-700 dark:text-amber-400 font-bold uppercase">Módulos</span>
                              <span className="block font-bold text-slate-800 dark:text-slate-200">{project.pvData.modulesCount}</span>
                          </div>
                    </div>
                )}

                {/* Specific Elevator Info Card */}
                {project.type === 'Elevator' && project.elevatorData && (
                    <div className="mb-4 grid grid-cols-2 gap-2">
                          <div className="bg-rose-50 dark:bg-rose-900/20 p-2 rounded-lg text-center col-span-2 flex justify-between px-4 items-center">
                              <span className="block text-[10px] text-rose-700 dark:text-rose-400 font-bold uppercase">Tipo</span>
                              <span className="block font-bold text-slate-800 dark:text-slate-200 text-sm">{project.elevatorData.solutionType}</span>
                          </div>
                          <div className="bg-rose-50 dark:bg-rose-900/20 p-2 rounded-lg text-center">
                              <span className="block text-[10px] text-rose-700 dark:text-rose-400 font-bold uppercase">Plantas</span>
                              <span className="block font-bold text-slate-800 dark:text-slate-200">{project.elevatorData.floors}</span>
                          </div>
                          <div className="bg-rose-50 dark:bg-rose-900/20 p-2 rounded-lg text-center">
                              <span className="block text-[10px] text-rose-700 dark:text-rose-400 font-bold uppercase">Ubicación</span>
                              <span className="block font-bold text-slate-800 dark:text-slate-200 text-xs mt-1">{project.elevatorData.location}</span>
                          </div>
                    </div>
                )}

                {/* PROJECT DESCRIPTION (AI Prompt or Manual) */}
                <div className="mb-4 min-h-[2.5rem]">
                    <p className={`text-xs leading-relaxed line-clamp-3 ${isAiDescription ? 'text-indigo-600 dark:text-indigo-400 font-medium italic' : 'text-slate-600 dark:text-slate-400'}`}>
                        {isAiDescription && <Sparkles className="w-3 h-3 inline mr-1.5 -mt-0.5 fill-current" />}
                        {displayDescription || "Sin descripción definida."}
                    </p>
                </div>
                
                <div className="space-y-4 pt-5 border-t border-slate-50 dark:border-slate-700">
                  <div className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                      <MapPin className="w-3.5 h-3.5 mr-2 text-slate-400 dark:text-slate-500" /> {project.location}
                  </div>

                  {/* Work Progress Bar */}
                  <div>
                      <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                            <HardHat className="w-3.5 h-3.5" /> Avance de Obra
                          </span>
                          <span className="font-bold text-[#0047AB] dark:text-blue-400">{project.progress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                        <div 
                          className="h-2 rounded-full bg-gradient-to-r from-[#0047AB] to-blue-400 transition-all duration-1000 ease-out"
                          style={{ width: `${project.progress}%` }}
                        ></div>
                      </div>
                  </div>

                  {/* Budget Execution Bar */}
                  <div>
                      <div className="flex justify-between items-center text-xs mb-1.5">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Ejecución Presupuestaria</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                          {budgetProgress.toFixed(0)}%
                          </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                          <div 
                          className={`h-2 rounded-full transition-all duration-500 ${project.type === 'Photovoltaic' ? 'bg-amber-500' : project.type === 'Elevator' ? 'bg-rose-500' : 'bg-[#0047AB]'}`}
                          style={{ width: `${Math.min(budgetProgress, 100)}%` }}
                          ></div>
                      </div>
                  </div>
                </div>
              </div>
              
              {/* Footer with Budget & Collected (Advance) */}
              <div className="bg-slate-50/50 dark:bg-slate-700/30 px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center backdrop-blur-sm">
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Cobrado (Adelanto)</span>
                    <span className="text-sm font-extrabold text-green-600 dark:text-green-400">
                        {totalCollected.toLocaleString()}€
                    </span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Total Presupuesto</span>
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                        {displayBudget.toLocaleString()}€
                    </span>
                </div>
              </div>
            </div>
             );
          })}
          {filteredProjects.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 shadow-sm">
                  <p>No se encontraron proyectos con los filtros actuales.</p>
                  {(statusFilter !== 'ALL' || showIncidentsOnly || typeFilter !== 'ALL') && (
                      <button onClick={() => { setStatusFilter('ALL'); setShowIncidentsOnly(false); setTypeFilter('ALL'); }} className="text-[#0047AB] text-sm mt-3 hover:underline font-medium">
                          Limpiar Todos los Filtros
                      </button>
                  )}
              </div>
          )}
        </div>

        {/* Create Project Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-md transition-all">
            <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-lg shadow-2xl p-8 transform transition-all max-h-[90vh] overflow-y-auto border border-slate-100 dark:border-slate-700">
              <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {modalType === 'Photovoltaic' && <SunIcon className="w-6 h-6 text-amber-500" />}
                      {modalType === 'Elevator' && <HangGlider className="w-6 h-6 text-rose-500" />}
                      {modalType === 'Photovoltaic' ? 'Nuevo Proyecto FV' : modalType === 'Elevator' ? 'Nueva Instalación Válida' : 'Nuevo Proyecto'}
                  </h2>
                  <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="w-5 h-5"/></button>
              </div>
              <form onSubmit={handleCreateProject} className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Nombre del Proyecto</label>
                  <input name="name" required className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] focus:border-[#0047AB] text-slate-900 dark:text-white transition-all" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cliente</label>
                  <input name="client" required className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] focus:border-[#0047AB] text-slate-900 dark:text-white transition-all" />
                </div>
                
                {/* Contact Info */}
                <div className="flex gap-4">
                    <div className="w-1/2">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Teléfono</label>
                        <input name="clientPhone" type="tel" placeholder="Opcional" className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] focus:border-[#0047AB] text-slate-900 dark:text-white transition-all" />
                    </div>
                    <div className="w-1/2">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Email</label>
                        <input name="clientEmail" type="email" placeholder="Opcional" className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] focus:border-[#0047AB] text-slate-900 dark:text-white transition-all" />
                    </div>
                </div>

                <div className="flex gap-5">
                  <div className="w-1/2">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Fecha de Inicio</label>
                    <input name="startDate" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] focus:border-[#0047AB] text-slate-900 dark:text-white transition-all" />
                  </div>
                  <div className="w-1/2">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Fecha Fin (Estimada)</label>
                    <input name="endDate" type="date" className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] focus:border-[#0047AB] text-slate-900 dark:text-white transition-all" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Ubicación</label>
                  <div className="flex gap-2">
                      <input 
                        name="location" 
                        required 
                        value={locationInput}
                        onChange={(e) => setLocationInput(e.target.value)}
                        className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] focus:border-[#0047AB] text-slate-900 dark:text-white transition-all" 
                      />
                      {modalType === 'Elevator' && (
                          <button 
                            type="button" 
                            onClick={handleCalculateDistance}
                            disabled={!locationInput || isCalculatingDistance}
                            className="mt-2 p-3 bg-blue-50 dark:bg-slate-700 text-[#0047AB] dark:text-blue-400 border border-blue-100 dark:border-slate-600 rounded-xl hover:bg-blue-100 dark:hover:bg-slate-600 transition-colors"
                            title="Calcular distancia desde base"
                          >
                              <Navigation className={`w-5 h-5 ${isCalculatingDistance ? 'animate-pulse' : ''}`} />
                          </button>
                      )}
                  </div>
                  {modalType === 'Elevator' && calculatedDistance !== null && (
                      <div className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/50 p-2 rounded-lg border border-slate-200 dark:border-slate-600">
                          <MapPin className="w-3.5 h-3.5 text-[#0047AB] dark:text-blue-400" />
                          <span>📍 Distancia desde base (Oropesa): <span className="text-[#0047AB] dark:text-blue-400 font-extrabold">{calculatedDistance} km</span></span>
                      </div>
                  )}
                </div>

                {/* Specific PV Fields */}
                {modalType === 'Photovoltaic' && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 p-5 rounded-2xl border border-amber-100 dark:border-amber-800 space-y-4">
                        <h3 className="text-sm font-bold text-amber-700 dark:text-amber-500 uppercase tracking-wide flex items-center gap-2">
                            <SunIcon className="w-4 h-4" /> Datos Técnicos FV
                        </h3>
                        <div className="flex gap-4">
                            <div className="w-1/2">
                              <label className="text-[10px] font-bold text-amber-700/70 dark:text-amber-400 uppercase">Potencia Pico (kWp)</label>
                              <input name="peakPower" type="number" step="0.1" required className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-lg text-sm" />
                            </div>
                            <div className="w-1/2">
                              <label className="text-[10px] font-bold text-amber-700/70 dark:text-amber-400 uppercase">Nº Módulos</label>
                              <input name="modulesCount" type="number" required className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-lg text-sm" />
                            </div>
                        </div>
                        <div>
                              <label className="text-[10px] font-bold text-amber-700/70 dark:text-amber-400 uppercase">Modelo Inversor</label>
                              <input name="inverterModel" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-lg text-sm" />
                        </div>
                        <div className="flex gap-4 items-center">
                            <div className="w-1/2">
                              <label className="text-[10px] font-bold text-amber-700/70 dark:text-amber-400 uppercase">Tipo Instalación</label>
                              <select name="installationType" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-lg text-sm">
                                  <option value="Residential">Residencial</option>
                                  <option value="Industrial">Industrial</option>
                                  <option value="Solar Farm">Huerto Solar</option>
                              </select>
                            </div>
                            <div className="w-1/2 pt-4">
                              <label className="flex items-center gap-2 cursor-pointer">
                                  <input name="hasBattery" type="checkbox" className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500" />
                                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Incluye Batería</span>
                              </label>
                            </div>
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
                             <select name="solutionType" className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700 rounded-lg text-sm text-slate-900 dark:text-white">
                                 <option value="Nexus">Nexus</option>
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

                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Descripción</label>
                  <textarea name="description" rows={3} className="w-full mt-2 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#0047AB] focus:border-[#0047AB] text-slate-900 dark:text-white transition-all"></textarea>
                </div>

                {/* File Upload Section */}
                <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3 block">Documentos Iniciales (Planos, Fotos)</label>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Sube archivos aquí para que la IA los use al generar presupuestos.</p>
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        multiple
                        accept="image/*,application/pdf"
                        className="hidden" 
                    />
                    {/* Camera Input (Hidden) */}
                    <input
                        type="file"
                        ref={cameraInputRef}
                        onChange={handleFileSelect}
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                    />
                    <div className="flex gap-3 items-center">
                      <button 
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="bg-blue-50 dark:bg-slate-700 text-[#0047AB] dark:text-blue-400 px-5 py-2.5 rounded-xl border border-blue-100 dark:border-slate-600 hover:bg-blue-100 dark:hover:bg-slate-600 transition-colors text-sm font-semibold flex items-center"
                      >
                          <Upload className="w-4 h-4 mr-2" /> Subir Archivos
                      </button>
                      <button 
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="bg-blue-50 dark:bg-slate-700 text-[#0047AB] dark:text-blue-400 px-5 py-2.5 rounded-xl border border-blue-100 dark:border-slate-600 hover:bg-blue-100 dark:hover:bg-slate-600 transition-colors text-sm font-semibold flex items-center"
                      >
                          <Camera className="w-4 h-4 mr-2" /> Tomar Foto
                      </button>
                      
                    </div>
                    {initialFiles.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {initialFiles.map((file, idx) => (
                                <div key={idx} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs px-3 py-1.5 rounded-lg flex items-center border border-slate-200 dark:border-slate-600">
                                    <FileText className="w-3 h-3 mr-1.5 text-slate-400" /> {file.name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex gap-4 mt-8">
                  <button type="button" onClick={() => { setIsModalOpen(false); setInitialFiles([]); }} className="flex-1 py-3 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-semibold">Cancelar</button>
                  <button type="submit" className={`flex-1 py-3 text-white rounded-xl font-semibold shadow-lg transition-colors ${modalType === 'Photovoltaic' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20' : modalType === 'Elevator' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20' : 'bg-[#0047AB] hover:bg-[#003380] shadow-blue-900/20'}`}>
                      Crear Proyecto
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Scanner Modal */}
        {isScannerOpen && (
            <ScannerModal 
              projects={projects}
              onClose={() => setIsScannerOpen(false)}
              onSave={handleScanSave}
              currentUserName={currentUserName}
            />
        )}

        {/* Global Assistant Modal */}
        <GlobalAssistant 
          isOpen={isAssistantOpen}
          onClose={() => setIsAssistantOpen(false)}
        />

      </div>

      {/* Floating Action Button for Scanner - Fixed position and high Z-index */}
      <button 
        onClick={() => setIsScannerOpen(true)}
        className="fixed bottom-8 right-8 w-16 h-16 bg-[#0047AB] text-white rounded-full shadow-[0_10px_40px_-10px_rgba(0,71,171,0.5)] flex items-center justify-center hover:bg-[#003380] hover:scale-105 transition-all z-[9999] ring-4 ring-white dark:ring-slate-800"
        title="Escanear Ticket/QR"
      >
        <Camera className="w-7 h-7" />
      </button>
    </>
  );
};

export default ProjectList;