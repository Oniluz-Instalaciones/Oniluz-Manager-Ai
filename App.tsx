import React, { useState, useEffect } from 'react';
import { Project, PriceItem } from './types';
import { INITIAL_PROJECTS, PRICE_DATABASE } from './constants';
import ProjectList from './components/ProjectList';
import ProjectDetail from './components/ProjectDetail';
import GlobalFinance from './components/GlobalFinance';
import PriceDatabase from './components/PriceDatabase';
import ProjectCalendar from './components/ProjectCalendar';

const App: React.FC = () => {
  // Application State
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('voltmanager_projects');
    return saved ? JSON.parse(saved) : INITIAL_PROJECTS;
  });

  const [priceDatabase, setPriceDatabase] = useState<PriceItem[]>(() => {
    const saved = localStorage.getItem('voltmanager_pricedb');
    // Transform constant PRICE_DATABASE to match PriceItem interface with IDs if needed
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

  // Persistence & Effects
  useEffect(() => {
    localStorage.setItem('voltmanager_projects', JSON.stringify(projects));
  }, [projects]);

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

  // Handlers
  const handleAddProject = (newProject: Project) => {
    setProjects([newProject, ...projects]);
  };

  const handleUpdateProject = (updatedProject: Project) => {
    setProjects(projects.map(p => p.id === updatedProject.id ? updatedProject : p));
  };

  const handleDeleteProject = (id: string) => {
    if (window.confirm("¿Estás seguro de que quieres eliminar este proyecto?")) {
        setProjects(projects.filter(p => p.id !== id));
        setSelectedProjectId(null);
    }
  };

  const handleUpdatePriceDb = (newItems: PriceItem[]) => {
      setPriceDatabase(newItems);
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // View Routing
  
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
        onBack={() => setSelectedProjectId(null)}
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