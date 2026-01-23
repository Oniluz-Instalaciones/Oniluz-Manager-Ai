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
      // Fetch projects with all relations
      // Note: We map snake_case DB columns to camelCase manually or rely on JS flexibility. 
      // Ideally we use a transform, but for now we manually map in the .map below.
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
      // Fallback or alert user
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
      // Optimistic update
      setProjects([newProject, ...projects]);

      const { data, error } = await supabase
        .from('projects')
        .insert({
           id: newProject.id, // Using the ID generated in frontend (ensure it's UUID compatible)
           type: newProject.type,
           name: newProject.name,
           client: newProject.client,
           location: newProject.location,
           status: newProject.status,
           progress: newProject.progress,
           start_date: newProject.startDate || null, // Convert empty string to null
           end_date: newProject.endDate || null,     // Convert empty string to null
           description: newProject.description,
           budget: newProject.budget,
           pv_data: newProject.pvData
        })
        .select();

      if (error) throw error;
      
      // Upload initial documents if any exist in the new project
      if (newProject.documents.length > 0) {
          const docsToInsert = newProject.documents.map(d => ({
              project_id: newProject.id,
              name: d.name,
              type: d.type,
              date: d.date,
              data: d.data
          }));
          await supabase.from('documents').insert(docsToInsert);
      }

    } catch (err) {
      console.error("Error creating project in DB:", err);
      alert("Error al guardar en la nube. Los cambios pueden no persistir.");
      fetchProjects(); // Revert to server state
    }
  };

  const handleUpdateProject = (updatedProject: Project) => {
     // For simple root-level updates (like status, progress, edit details)
     // Complex nested updates (like adding a material) are handled in ProjectDetail directly against DB
     // But we update state here to reflect changes in UI instantly
     setProjects(projects.map(p => p.id === updatedProject.id ? updatedProject : p));

     // Debounce or direct update? Direct for now.
     supabase.from('projects').update({
         name: updatedProject.name,
         status: updatedProject.status,
         progress: updatedProject.progress,
         end_date: updatedProject.endDate || null, // Convert empty string to null
         description: updatedProject.description,
         // Add other root fields as needed
     }).eq('id', updatedProject.id).then(({ error }) => {
         if (error) console.error("Error updating project root:", error);
     });
  };

  const handleDeleteProject = async (id: string) => {
    if (window.confirm("¿Estás seguro de que quieres eliminar este proyecto? Se borrarán todos los datos asociados.")) {
        // Optimistic delete
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

  // Helper to refresh data when returning from detail view to ensure consistency
  const handleBackToMenu = () => {
      setSelectedProjectId(null);
      fetchProjects(); 
  }

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // View Routing
  
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