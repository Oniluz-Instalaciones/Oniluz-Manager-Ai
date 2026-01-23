import React, { useState, useEffect } from 'react';
import { Project, PriceItem } from './types';
import { PRICE_DATABASE } from './constants';
import ProjectList from './components/ProjectList';
import ProjectDetail from './components/ProjectDetail';
import GlobalFinance from './components/GlobalFinance';
import PriceDatabase from './components/PriceDatabase';
import ProjectCalendar from './components/ProjectCalendar';
import { supabase } from './lib/supabase';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  // Application State
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  // --- Supabase Data Fetching ---
  const fetchProjects = async () => {
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
             items: b.items || []
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
    fetchProjects();
  }, []);

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

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  if (isLoading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
              <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-[#0047AB]" />
                  <p className="text-slate-500 font-medium">Cargando datos...</p>
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
    />
  );
};

export default App;