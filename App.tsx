import React, { useState, useEffect } from 'react';
import { Project, PriceItem } from './types';
import { PRICE_DATABASE } from './constants';
import ProjectList from './components/ProjectList';
import ProjectDetail from './components/ProjectDetail';
import GlobalFinance from './components/GlobalFinance';
import PriceDatabase from './components/PriceDatabase';
import ProjectCalendar from './components/ProjectCalendar';
import Login from './components/Login';
import { supabase } from './lib/supabase'; // Kept for direct DB calls, auth moved to service
import { getCurrentSession, onAuthStateChange, signOut } from './services/authService';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  // Auth State
  const [session, setSession] = useState<any | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Application State
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [priceDatabase, setPriceDatabase] = useState<PriceItem[]>(() => {
    const saved = localStorage.getItem('voltmanager_pricedb');
    if (saved) return JSON.parse(saved);
    return PRICE_DATABASE.map((p, i) => ({ ...p, id: `pd-${i}` }));
  });

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('voltmanager_theme') === 'dark';
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showGlobalFinance, setShowGlobalFinance] = useState(false);
  const [showPriceDb, setShowPriceDb] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // --- Auth & Initial Load ---
  useEffect(() => {
    let mounted = true;

    // 1. Check initial session from local storage immediately
    const initSession = async () => {
      const currentSession = await getCurrentSession();
      if (mounted) {
        setSession(currentSession);
        // Only turn off loading if we found a session, otherwise wait a tick for the listener
        if (currentSession) setIsAuthLoading(false);
      }
    };

    initSession();

    // 2. Listen for real-time auth changes (Token refresh, login, logout)
    const subscription = onAuthStateChange((newSession) => {
      if (mounted) {
        setSession(newSession);
        setIsAuthLoading(false); // Auth check is definitely done now
        
        // If user logs out, reset app states
        if (!newSession) {
          setSelectedProjectId(null);
          setShowGlobalFinance(false);
          setShowPriceDb(false);
          setShowCalendar(false);
          setProjects([]); // Clear sensitive data from memory
        }
      }
    });

    return () => {
      mounted = false;
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    };
  }, []);

  // --- Supabase Data Fetching (Only if authenticated) ---
  const fetchProjects = async () => {
    if (!session) return;
    
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          transactions(*),
          materials(*),
          incidents(*),
          documents(*),
          budgets(*, items:budget_items(*))
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const formattedProjects: Project[] = data.map((p: any) => ({
          id: p.id,
          type: p.type as any,
          name: p.name,
          client: p.client,
          location: p.location,
          status: p.status,
          progress: Number(p.progress),
          startDate: p.start_date,
          endDate: p.end_date,
          budget: Number(p.budget),
          description: p.description,
          pvData: p.pv_data, // JSONB column
          transactions: p.transactions || [],
          materials: p.materials || [],
          incidents: p.incidents || [],
          documents: p.documents || [],
          budgets: p.budgets?.map((b: any) => ({
             ...b,
             items: b.items || [],
             aiPrompt: b.ai_prompt
          })) || []
        }));
        setProjects(formattedProjects);
      }
    } catch (err) {
      console.error("Error fetching projects from Supabase:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchProjects();
    }
  }, [session]);

  // --- Persistence & Effects ---
  useEffect(() => {
    localStorage.setItem('voltmanager_pricedb', JSON.stringify(priceDatabase));
  }, [priceDatabase]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('voltmanager_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('voltmanager_theme', 'light');
    }
  }, [darkMode]);

  // --- Handlers ---

  const handleLogout = async () => {
    await signOut();
    // State reset is handled by the onAuthStateChange listener
  };

  const handleAddProject = async (newProject: Project) => {
    try {
      // 1. Insert Project into DB (Let Supabase generate ID)
      const { data, error } = await supabase
        .from('projects')
        .insert({
           // NO ID included here, DB generates UUID
           type: newProject.type,
           name: newProject.name,
           client: newProject.client,
           location: newProject.location,
           status: newProject.status,
           progress: newProject.progress,
           start_date: newProject.startDate || null, // Sanitize empty dates
           end_date: newProject.endDate || null,     // Sanitize empty dates
           description: newProject.description,
           budget: newProject.budget,
           pv_data: newProject.pvData
        })
        .select()
        .single();

      if (error) throw error;

      const createdProjectData = data;
      const realId = createdProjectData.id;
      
      // 2. Update local state with the returned real ID
      const finalProject: Project = {
          ...newProject,
          id: realId
      };
      
      setProjects([finalProject, ...projects]);

      // 3. Upload initial documents using real ID
      if (newProject.documents.length > 0) {
          const docsToInsert = newProject.documents.map(d => ({
              project_id: realId, // Use real generated ID
              name: d.name,
              type: d.type,
              date: d.date,
              data: d.data
          }));
          await supabase.from('documents').insert(docsToInsert);
      }

    } catch (err) {
      console.error("Error creating project in DB:", err);
      alert("Error al guardar en la nube. Inténtelo de nuevo.");
      fetchProjects(); // Revert to server state
    }
  };

  const handleUpdateProject = (updatedProject: Project) => {
     setProjects(projects.map(p => p.id === updatedProject.id ? updatedProject : p));

     supabase.from('projects').update({
         name: updatedProject.name,
         status: updatedProject.status,
         progress: updatedProject.progress,
         end_date: updatedProject.endDate || null,
         description: updatedProject.description,
     }).eq('id', updatedProject.id).then(({ error }) => {
         if (error) console.error("Error updating project root:", error);
     });
  };

  const handleDeleteProject = async (id: string) => {
    if (window.confirm("¿Estás seguro de que quieres eliminar este proyecto? Se borrarán todos los datos asociados.")) {
        setProjects(projects.filter(p => p.id !== id));
        setSelectedProjectId(null);

        const { error } = await supabase.from('projects').delete().eq('id', id);
        if (error) {
            console.error("Error deleting project:", error);
            alert("Error al eliminar el proyecto.");
            fetchProjects();
        }
    }
  };

  const handleUpdatePriceDb = (newItems: PriceItem[]) => {
      setPriceDatabase(newItems);
  };

  const handleBackToMenu = () => {
      setSelectedProjectId(null);
      fetchProjects(); 
  };

  // --- Conditional Rendering ---

  if (isAuthLoading) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 transition-colors">
             <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-[#0047AB] rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-blue-900/20">
                      <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 6V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          <path d="M12 12L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          <path d="M12 12L15 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                  </div>
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-[#0047AB]" />
                    <p className="text-slate-500 font-medium text-sm">Cargando sesión...</p>
                  </div>
             </div>
        </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  // --- Authenticated App Rendering ---

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  if (isLoading && projects.length === 0) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
              <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-[#0047AB]" />
                  <p className="text-slate-500 font-medium">Sincronizando proyectos...</p>
              </div>
          </div>
      );
  }

  if (showPriceDb) {
      return (
          <PriceDatabase 
            items={priceDatabase}
            onUpdate={handleUpdatePriceDb}
            onBack={() => setShowPriceDb(false)}
          />
      );
  }

  if (showGlobalFinance) {
      return (
          <GlobalFinance 
            projects={projects}
            onBack={() => setShowGlobalFinance(false)}
          />
      );
  }

  if (showCalendar) {
      return (
          <ProjectCalendar 
             projects={projects}
             onBack={() => setShowCalendar(false)}
          />
      );
  }

  if (selectedProjectId && selectedProject) {
    return (
      <ProjectDetail 
        project={selectedProject} 
        onBack={handleBackToMenu}
        onUpdate={handleUpdateProject}
        onDelete={handleDeleteProject}
        priceDatabase={priceDatabase}
      />
    );
  }

  return (
    <ProjectList 
      projects={projects} 
      onSelectProject={setSelectedProjectId}
      onAddProject={handleAddProject}
      onUpdateProject={handleUpdateProject}
      onOpenGlobalFinance={() => setShowGlobalFinance(true)}
      onOpenPriceDb={() => setShowPriceDb(true)}
      onOpenCalendar={() => setShowCalendar(true)}
      isDarkMode={darkMode}
      onToggleDarkMode={() => setDarkMode(!darkMode)}
      onLogout={handleLogout}
    />
  );
};

export default App;