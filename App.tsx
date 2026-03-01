import React, { useState, useEffect } from 'react';
import { Project, PriceItem } from './types';
import { PRICE_DATABASE } from './constants';
import ProjectList from './components/ProjectList';
import ProjectDetail from './components/ProjectDetail';
import GlobalFinance from './components/GlobalFinance';
import InternalFinance from './components/InternalFinance';
import StockManager from './components/StockManager';
import PriceDatabase from './components/PriceDatabase';
import ProjectCalendar from './components/ProjectCalendar';
import Login from './components/Login';
import { supabase, isSupabaseConfigured } from './lib/supabase'; // Kept for direct DB calls, auth moved to service
import { getCurrentSession, onAuthStateChange, signOut } from './services/authService';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

// --- Helpers for Schema Compatibility ---
// Tags to identify embedded data in description
const EMBED_TAG = '[Contacto:';
const ELEVATOR_TAG_OPEN = '[ELEVATOR_JSON]';
const ELEVATOR_TAG_CLOSE = '[/ELEVATOR_JSON]';
const PV_TAG_OPEN = '[PV_JSON]';
const PV_TAG_CLOSE = '[/PV_JSON]';
const INVOICE_TAG_OPEN = '[INVOICE_JSON]';
const INVOICE_TAG_CLOSE = '[/INVOICE_JSON]';

// Embed contact info legacy helper
const embedContactInfo = (desc: string, phone?: string, email?: string) => {
    const cleanDesc = desc ? desc.split(EMBED_TAG)[0].trim() : '';
    if (!phone && !email) return cleanDesc;
    return `${cleanDesc}\n\n${EMBED_TAG} ${phone || ''} | ${email || ''}]`;
};

// Robust extractor for all embedded data types
const extractProjectData = (rawDesc: string, rawPhone: string, rawEmail: string, rawElevator: any, rawPv: any) => {
    let description = rawDesc || '';
    let phone = rawPhone;
    let email = rawEmail;
    let elevatorData = rawElevator;
    let pvData = rawPv;
    let invoiceData = null;

    // 1. Extract Contact Info (if column was empty)
    if (!phone && !email && description.includes(EMBED_TAG)) {
        const parts = description.split(EMBED_TAG);
        // We take the part before the tag as the potential description, 
        // but wait until other tags are stripped to finalize
        const contactContent = parts[1].split(']')[0];
        const [p, e] = contactContent.split('|').map(s => s.trim());
        phone = p;
        email = e;
        description = description.replace(`${EMBED_TAG} ${contactContent}]`, '');
    }

    // 2. Extract Elevator Data (Fallback if column is null)
    if (!elevatorData && description.includes(ELEVATOR_TAG_OPEN)) {
        try {
            const startIndex = description.indexOf(ELEVATOR_TAG_OPEN);
            const endIndex = description.indexOf(ELEVATOR_TAG_CLOSE);
            if (startIndex !== -1 && endIndex !== -1) {
                const jsonStr = description.substring(startIndex + ELEVATOR_TAG_OPEN.length, endIndex);
                elevatorData = JSON.parse(jsonStr);
                // Remove from description for display
                description = description.substring(0, startIndex) + description.substring(endIndex + ELEVATOR_TAG_CLOSE.length);
            }
        } catch (e) { console.error("Error parsing embedded elevator data", e); }
    }

    // 3. Extract PV Data (Fallback if column is null)
    if (!pvData && description.includes(PV_TAG_OPEN)) {
        try {
            const startIndex = description.indexOf(PV_TAG_OPEN);
            const endIndex = description.indexOf(PV_TAG_CLOSE);
            if (startIndex !== -1 && endIndex !== -1) {
                const jsonStr = description.substring(startIndex + PV_TAG_OPEN.length, endIndex);
                pvData = JSON.parse(jsonStr);
                // Remove from description
                description = description.substring(0, startIndex) + description.substring(endIndex + PV_TAG_CLOSE.length);
            }
        } catch (e) { console.error("Error parsing embedded pv data", e); }
    }

    // 4. Extract Invoice Data (Always embedded as we don't have a column)
    if (description.includes(INVOICE_TAG_OPEN)) {
        try {
            const startIndex = description.indexOf(INVOICE_TAG_OPEN);
            const endIndex = description.indexOf(INVOICE_TAG_CLOSE);
            if (startIndex !== -1 && endIndex !== -1) {
                const jsonStr = description.substring(startIndex + INVOICE_TAG_OPEN.length, endIndex);
                invoiceData = JSON.parse(jsonStr);
                // Remove from description
                description = description.substring(0, startIndex) + description.substring(endIndex + INVOICE_TAG_CLOSE.length);
            }
        } catch (e) { console.error("Error parsing embedded invoice data", e); }
    }

    return {
        description: description.trim(),
        phone,
        email,
        elevatorData,
        pvData,
        invoiceData
    };
};

const App: React.FC = () => {
  // Auth State
  const [session, setSession] = useState<any | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Application State
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Price Database is now fetched from Supabase, not local storage
  const [priceDatabase, setPriceDatabase] = useState<PriceItem[]>([]);

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('voltmanager_theme') === 'dark';
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showGlobalFinance, setShowGlobalFinance] = useState(false);
  const [showInternalFinance, setShowInternalFinance] = useState(false);
  const [showStockManager, setShowStockManager] = useState(false);
  const [showPriceDb, setShowPriceDb] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // Derive current user name safely
  const currentUserName = session?.user?.user_metadata?.full_name || session?.user?.email || 'Usuario';

  // --- Auth & Initial Load ---
  useEffect(() => {
    console.log("Oniluz App v2.2 - System Ready"); // Debug flag to ensure new code is loaded
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
          setShowInternalFinance(false);
          setShowStockManager(false);
          setShowPriceDb(false);
          setShowCalendar(false);
          setProjects([]); 
          setPriceDatabase([]);
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
    
    // Reset error state before fetching
    setFetchError(null);
    
    try {
      setIsLoading(true);

      if (!isSupabaseConfigured) {
          throw new Error("La conexión a Supabase no está configurada. Faltan las variables de entorno.");
      }

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
        const formattedProjects: Project[] = data.map((p: any) => {
          // Robust extraction: Checks DB columns first, falls back to description embedding
          const { description, phone, email, elevatorData, pvData, invoiceData } = extractProjectData(
              p.description, 
              p.client_phone, 
              p.client_email, 
              p.elevator_data, 
              p.pv_data
          );
          
          return {
            id: p.id,
            type: p.type as any,
            name: p.name,
            client: p.client,
            clientPhone: phone, 
            clientEmail: email,
            location: p.location,
            status: p.status,
            progress: Number(p.progress),
            startDate: p.start_date,
            endDate: p.end_date,
            budget: Number(p.budget),
            description: description, // Clean description without JSON blobs
            pvData: pvData, 
            elevatorData: elevatorData, 
            invoiceData: invoiceData, 
            invoices: invoiceData || [], // Sync invoices from embedded data
            transactions: p.transactions?.map((t: any) => ({
                ...t,
                userName: t.user_name // Map database snake_case to app camelCase
            })) || [],
            materials: p.materials || [],
            incidents: p.incidents || [],
            documents: p.documents || [],
            budgets: p.budgets?.map((b: any) => ({
               ...b,
               items: b.items?.map((i: any) => ({
                   ...i,
                   pricePerUnit: i.price_per_unit
               })) || [],
               aiPrompt: b.ai_prompt
            })) || []
          };
        });
        setProjects(formattedProjects);
      }
    } catch (err: any) {
      console.error("Error fetching projects from Supabase:", err);
      // Set user-friendly error message
      setFetchError(err.message || "Error de conexión con la base de datos.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPrices = async () => {
      if (!session) return;
      // We assume table 'price_items' exists. 
      const { data, error } = await supabase.from('price_items').select('*').order('name');
      if (error) {
          console.warn("Could not fetch prices from Supabase (maybe table missing?).", error);
      } else {
          setPriceDatabase(data || []);
      }
  };

  useEffect(() => {
    if (session) {
      fetchProjects();
      fetchPrices();
    }
  }, [session]);

  // --- Effects ---

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
  };

  const handleAddProject = async (newProject: Project) => {
    try {
      // 1. Prepare Base Payload (Standard Attempt)
      let baseDescription = embedContactInfo(
          newProject.description || '', 
          newProject.clientPhone, 
          newProject.clientEmail
      );

      const invoiceDataToSave = newProject.invoices || newProject.invoiceData;
      if (invoiceDataToSave) {
          baseDescription += `\n\n${INVOICE_TAG_OPEN}${JSON.stringify(invoiceDataToSave)}${INVOICE_TAG_CLOSE}`;
      }

      const payload = {
           type: newProject.type,
           name: newProject.name,
           client: newProject.client,
           location: newProject.location,
           status: newProject.status || 'Planning', // Default to Planning
           progress: newProject.progress || 25,     // Default to 25%
           start_date: newProject.startDate || null, 
           end_date: newProject.endDate || null,   
           description: baseDescription,
           budget: newProject.budget || 0,
           pv_data: newProject.pvData || null,
           elevator_data: newProject.elevatorData || null
      };

      // 2. Try Insert
      let { data, error } = await supabase
        .from('projects')
        .insert(payload)
        .select()
        .single();

      // 3. FALLBACK: Handle Missing Columns Schema Mismatch (PGRST204, 42703, 400 Bad Request)
      // Expanded conditions to catch more potential DB errors
      if (error) {
          const errCode = error.code;
          const errMsg = error.message.toLowerCase();
          
          if (
              errCode === 'PGRST204' || 
              errCode === '42703' || // Undefined column
              errMsg.includes('could not find the') || 
              errMsg.includes('column') ||
              errMsg.includes('does not exist')
          ) {
              console.warn(`[Oniluz System] ⚠️ Schema mismatch detected (${errCode}). Engaging Compatibility Mode.`);
              
              // Create fallback payload by removing missing columns and embedding data in description
              const fallbackPayload = { ...payload };
              
              // Remove keys that might cause errors
              delete (fallbackPayload as any).elevator_data;
              delete (fallbackPayload as any).pv_data;
              
              // Embed data into description
              let embeddedDesc = baseDescription;
              
              if (newProject.elevatorData) {
                  embeddedDesc += `\n\n${ELEVATOR_TAG_OPEN}${JSON.stringify(newProject.elevatorData)}${ELEVATOR_TAG_CLOSE}`;
              }
              if (newProject.pvData) {
                  embeddedDesc += `\n\n${PV_TAG_OPEN}${JSON.stringify(newProject.pvData)}${PV_TAG_CLOSE}`;
              }
              
              fallbackPayload.description = embeddedDesc;

              // Retry insert with safe payload
              const retry = await supabase.from('projects').insert(fallbackPayload).select().single();
              
              data = retry.data;
              error = retry.error; // Update error with retry result
          }
      }

      if (error) throw error;

      const realId = data.id;
      const finalProject: Project = { ...newProject, id: realId };
      
      setProjects([finalProject, ...projects]);

      // Handle Documents separately to avoid blocking project creation if they fail
      if (newProject.documents.length > 0) {
          try {
              const docsToInsert = newProject.documents.map(d => ({
                  project_id: realId, 
                  name: d.name,
                  type: d.type,
                  date: d.date,
                  data: d.data
              }));
              const { error: docError } = await supabase.from('documents').insert(docsToInsert);
              if (docError) console.error("Error saving initial documents:", docError);
          } catch (docErr) {
              console.error("Critical error saving documents:", docErr);
          }
      }

    } catch (err: any) {
      console.error("Error creating project in DB:", err);
      // Show descriptive error to user
      alert(`Error al guardar en la nube: ${err.message || 'Error desconocido'}`);
      fetchProjects(); 
    }
  };

  const handleUpdateProject = async (updatedProject: Project) => {
     // Optimistic UI update
     setProjects(projects.map(p => p.id === updatedProject.id ? updatedProject : p));

     let baseDesc = embedContactInfo(
        updatedProject.description || '', 
        updatedProject.clientPhone, 
        updatedProject.clientEmail
     );

     const invoiceDataToSave = updatedProject.invoices || updatedProject.invoiceData;
     if (invoiceDataToSave) {
         baseDesc += `\n\n${INVOICE_TAG_OPEN}${JSON.stringify(invoiceDataToSave)}${INVOICE_TAG_CLOSE}`;
     }

     const updatePayload = {
         name: updatedProject.name,
         client: updatedProject.client,
         location: updatedProject.location,
         status: updatedProject.status,
         progress: updatedProject.progress,
         start_date: updatedProject.startDate,
         end_date: updatedProject.endDate || null,
         description: baseDesc,
         budget: updatedProject.budget || 0,
         pv_data: updatedProject.pvData || null, // Try standard
         elevator_data: updatedProject.elevatorData || null // Try standard
     };

     // Try Update
     let { error } = await supabase.from('projects').update(updatePayload).eq('id', updatedProject.id);

     // Fallback on Update Error
     if (error) {
         const errCode = error.code;
         const errMsg = error.message.toLowerCase();

         if (
             errCode === 'PGRST204' || 
             errCode === '42703' ||
             errMsg.includes('could not find the') || 
             errMsg.includes('column')
         ) {
             const fallbackPayload = { ...updatePayload };
             delete (fallbackPayload as any).pv_data;
             delete (fallbackPayload as any).elevator_data;

             let embeddedDesc = baseDesc;
             if (updatedProject.elevatorData) {
                 embeddedDesc += `\n\n${ELEVATOR_TAG_OPEN}${JSON.stringify(updatedProject.elevatorData)}${ELEVATOR_TAG_CLOSE}`;
             }
             if (updatedProject.pvData) {
                 embeddedDesc += `\n\n${PV_TAG_OPEN}${JSON.stringify(updatedProject.pvData)}${PV_TAG_CLOSE}`;
             }
             fallbackPayload.description = embeddedDesc;

             const retry = await supabase.from('projects').update(fallbackPayload).eq('id', updatedProject.id);
             error = retry.error;
         }
     }

     if (error) {
         console.error("Error updating project root:", error);
         alert("Error al actualizar proyecto: " + error.message);
         fetchProjects(); // Revert
     }
  };

  const handleDeleteProject = async (id: string) => {
    if (window.confirm("¿Estás seguro de que quieres eliminar este proyecto? Se borrarán todos los datos asociados.")) {
        setProjects(projects.filter(p => p.id !== id));
        setSelectedProjectId(null);

        const { error } = await supabase.from('projects').delete().eq('id', id);
        if (error) {
            console.error("Error deleting project:", error);
            alert("Error al eliminar el proyecto: " + error.message);
            fetchProjects();
        }
    }
  };

  // --- Price Database Handlers (Supabase) ---

  const handleAddPrice = async (item: PriceItem) => {
      // Optimistic update
      setPriceDatabase(prev => [...prev, item]);
      
      const { error } = await supabase.from('price_items').insert({
          id: item.id,
          name: item.name,
          unit: item.unit,
          price: item.price,
          category: item.category,
          discount: item.discount
      });
      
      if (error) {
          console.error("Error adding price:", error);
          alert("No se pudo guardar en la nube.");
          fetchPrices(); // Revert
      }
  };

  const handleEditPrice = async (item: PriceItem) => {
      setPriceDatabase(prev => prev.map(p => p.id === item.id ? item : p));

      const { error } = await supabase.from('price_items').update({
          name: item.name,
          unit: item.unit,
          price: item.price,
          category: item.category,
          discount: item.discount
      }).eq('id', item.id);

      if (error) {
          console.error("Error updating price:", error);
          fetchPrices();
      }
  };

  const handleDeletePrice = async (id: string) => {
      setPriceDatabase(prev => prev.filter(p => p.id !== id));
      
      const { error } = await supabase.from('price_items').delete().eq('id', id);
      if (error) {
          console.error("Error deleting price:", error);
          fetchPrices();
      }
  };

  const handleBulkAddPrices = async (items: PriceItem[]) => {
      const existingIds = new Set(priceDatabase.map(p => p.id));
      const newItems = items.filter(i => !existingIds.has(i.id));
      
      if (newItems.length === 0) return;

      setPriceDatabase(prev => [...prev, ...newItems]);

      const dbItems = newItems.map(item => ({
          id: item.id,
          name: item.name,
          unit: item.unit,
          price: item.price,
          category: item.category,
          discount: item.discount
      }));

      const { error } = await supabase.from('price_items').insert(dbItems);
      if (error) {
          console.error("Error bulk adding prices:", error);
          fetchPrices();
      }
  };

  const handleBackToMenu = () => {
      setSelectedProjectId(null);
      fetchProjects(); 
  };

  // --- ONE-TIME DATA FIX: Fuenlabrada Invoice Number ---
  const hasFixedFuenlabrada = React.useRef(false);

  useEffect(() => {
    if (projects.length > 0 && !hasFixedFuenlabrada.current) {
      const fuenlabradaProject = projects.find(p => p.name.toLowerCase().includes('fuenlabrada'));
      
      if (fuenlabradaProject && fuenlabradaProject.invoices && fuenlabradaProject.invoices.length > 0) {
        const targetInvoice = fuenlabradaProject.invoices[0];
        const targetNumber = 'INV-2026-002';

        // Check if it needs update (and avoid infinite loop if already correct)
        if (targetInvoice.number !== targetNumber) {
          console.log("Applying fix: Updating Fuenlabrada invoice number to", targetNumber);
          
          const updatedInvoices = fuenlabradaProject.invoices.map((inv, index) => 
            index === 0 ? { ...inv, number: targetNumber } : inv
          );
          
          const updatedProject = { ...fuenlabradaProject, invoices: updatedInvoices };
          handleUpdateProject(updatedProject);
          hasFixedFuenlabrada.current = true;
        }
      }
    }
  }, [projects]);

  // --- Render ---

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

  // --- ERROR STATE ---
  if (fetchError) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-red-100 dark:border-red-900/30">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600 dark:text-red-400">
                      <AlertCircle className="w-8 h-8" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Error de Conexión</h2>
                  <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm leading-relaxed">
                      {fetchError}
                  </p>
                  <button 
                      onClick={() => fetchProjects()}
                      className="w-full py-3 bg-[#0047AB] hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                  >
                      <RefreshCw className="w-4 h-4" /> Reintentar
                  </button>
              </div>
          </div>
      );
  }

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
            onAdd={handleAddPrice}
            onEdit={handleEditPrice}
            onDelete={handleDeletePrice}
            onBulkAdd={handleBulkAddPrices}
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

  if (showInternalFinance) {
      return (
          <InternalFinance 
            projects={projects}
            onBack={() => setShowInternalFinance(false)}
          />
      );
  }

  if (showStockManager) {
      return (
          <StockManager 
            projects={projects}
            onBack={() => setShowStockManager(false)}
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

  if (selectedProjectId && projects.find(p => p.id === selectedProjectId)) {
    return (
      <ProjectDetail 
        project={projects.find(p => p.id === selectedProjectId)!} 
        onBack={handleBackToMenu}
        onUpdate={handleUpdateProject}
        onDelete={handleDeleteProject}
        priceDatabase={priceDatabase}
        currentUserName={currentUserName}
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
      onOpenInternalFinance={() => setShowInternalFinance(true)}
      onOpenStockManager={() => setShowStockManager(true)}
      onOpenPriceDb={() => setShowPriceDb(true)}
      onOpenCalendar={() => setShowCalendar(true)}
      isDarkMode={darkMode}
      onToggleDarkMode={() => setDarkMode(!darkMode)}
      onLogout={handleLogout}
      currentUserName={currentUserName}
    />
  );
};

export default App;