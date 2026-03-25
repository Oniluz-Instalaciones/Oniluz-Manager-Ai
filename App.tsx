import React, { useState, useEffect, useCallback } from 'react';
import { Project, PriceItem, ProjectStatus } from './types';
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
  const fetchProjects = useCallback(async (retryCount = 0) => {
    if (!session) return;
    
    // Reset error state before fetching ONLY on first attempt
    if (retryCount === 0) setFetchError(null);
    
    try {
      if (retryCount === 0) setIsLoading(true);

      if (!navigator.onLine) {
          throw new Error("No hay conexión a internet. Comprueba tu red.");
      }

      if (!isSupabaseConfigured) {
          throw new Error("La conexión a Supabase no está configurada. Faltan las variables de entorno.");
      }

      // OPTIMIZATION: Removed 'documents(*)' from main fetch to prevent "Failed to fetch" (payload too large)
      // Documents are now lazy-loaded when a project is selected.
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          transactions(*),
          materials(*),
          incidents(*),
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
                projectId: t.project_id,
                userName: t.user_name, // Map database snake_case to app camelCase
                relatedDocumentId: t.related_document_id
            })) || [],
            materials: p.materials?.map((m: any) => ({
                ...m,
                projectId: m.project_id,
                pricePerUnit: m.price_per_unit,
                minStock: m.min_stock,
                packageSize: m.package_size
            })) || [],
            incidents: p.incidents?.map((i: any) => ({
                ...i,
                projectId: i.project_id,
                resolvedAt: i.resolved_at
            })) || [],
            documents: [], // Placeholder, will be merged below
            budgets: p.budgets?.map((b: any) => ({
               ...b,
               projectId: b.project_id,
               items: b.items?.map((i: any) => ({
                   ...i,
                   budgetId: i.budget_id,
                   pricePerUnit: i.price_per_unit
               })) || [],
               aiPrompt: b.ai_prompt
            })) || []
          };
        });

        // CRITICAL FIX: Preserve existing documents when refreshing project list
        // Since we lazy-load documents, a full fetchProjects() (which returns documents=[]) 
        // would wipe out currently loaded documents if we simply replaced the state.
        setProjects(currentProjects => {
            return formattedProjects.map(newP => {
                const existingP = currentProjects.find(p => p.id === newP.id);
                // If we have existing documents in memory for this project, keep them
                if (existingP && existingP.documents && existingP.documents.length > 0) {
                    return { ...newP, documents: existingP.documents };
                }
                return newP;
            });
        });

        setFetchError(null); // Clear any previous errors on success
      }
    } catch (err: any) {
      console.error(`Error fetching projects from Supabase (Attempt ${retryCount + 1}):`, err);
      
      const isNetworkError = err.message?.includes('Failed to fetch') || err.message?.includes('Network request failed');
      const MAX_RETRIES = 3;

      if (isNetworkError && retryCount < MAX_RETRIES) {
          const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
          console.log(`Retrying in ${delay}ms...`);
          setTimeout(() => fetchProjects(retryCount + 1), delay);
          return;
      }

      // Set user-friendly error message
      setFetchError(err.message || "Error de conexión con la base de datos.");
    } finally {
      // Only stop loading if we are not retrying or if we hit max retries
      if (retryCount === 0 || retryCount >= 3) setIsLoading(false);
    }
  }, [session]);

  // Lazy load documents for a specific project
  const fetchProjectDocuments = async (projectId: string) => {
      try {
          const { data, error } = await supabase
            .from('documents')
            .select('*')
            .eq('project_id', projectId);
            
          if (error) throw error;

          if (data) {
              const formattedDocs = data.map((d: any) => ({
                  ...d,
                  projectId: d.project_id,
                  uploadedBy: d.uploaded_by,
                  emissionDate: d.emission_date,
                  amount: d.amount
              }));

              setProjects(prev => prev.map(p => {
                  if (p.id === projectId) {
                      return { ...p, documents: formattedDocs };
                  }
                  return p;
              }));
          }
      } catch (err) {
          console.error("Error fetching documents:", err);
      }
  };

  // Trigger document fetch when a project is selected
  useEffect(() => {
      if (selectedProjectId) {
          fetchProjectDocuments(selectedProjectId);
      }
  }, [selectedProjectId]);

  const fetchPrices = useCallback(async () => {
      if (!session) return;
      // We assume table 'price_items' exists. 
      const { data, error } = await supabase.from('price_items').select('*').order('name');
      if (error) {
          console.warn("Could not fetch prices from Supabase (maybe table missing?).", error);
      } else {
          setPriceDatabase(data || []);
      }
  }, [session]);

  useEffect(() => {
    if (session) {
      fetchProjects();
      fetchPrices();
    }
  }, [session, fetchProjects, fetchPrices]);

  // Auto-retry on network reconnection
  useEffect(() => {
    const handleOnline = () => {
        console.log("Network back online, refetching...");
        if (session) fetchProjects();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [session, fetchProjects]);

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

     // --- SMART STATUS LOGIC ---
     // Only apply if the user hasn't manually changed the status in this update
     // We compare with the *previous* version of the project in state
     const currentProject = projects.find(p => p.id === updatedProject.id);
     let finalStatus = updatedProject.status;

     if (currentProject && currentProject.status === updatedProject.status) {
         // User didn't manually change status, so we check for automatic updates
         const hasPaidInvoices = updatedProject.invoices?.some(i => i.status === 'Paid');
         const hasSentInvoices = updatedProject.invoices?.some(i => i.status === 'Sent');
         const hasAcceptedBudgets = updatedProject.budgets?.some(b => b.status === 'Accepted');
         const isProgress100 = updatedProject.progress === 100;

         if (hasPaidInvoices || isProgress100) {
             finalStatus = ProjectStatus.COMPLETED;
         } else if (hasSentInvoices || hasAcceptedBudgets) {
             finalStatus = ProjectStatus.IN_PROGRESS;
         }
         // If none of the above, keep existing (likely Planning)
     }
     
     // Update the payload with the potentially new smart status
     const updatePayload = {
         name: updatedProject.name,
         client: updatedProject.client,
         location: updatedProject.location,
         status: finalStatus, // Use calculated status
         progress: updatedProject.progress,
         start_date: updatedProject.startDate,
         end_date: updatedProject.endDate || null,
         description: baseDesc,
         budget: updatedProject.budget || 0,
         pv_data: updatedProject.pvData || null,
         elevator_data: updatedProject.elevatorData || null
     };

     // Update local state again if status changed automatically
     if (finalStatus !== updatedProject.status) {
         const autoUpdatedProject = { ...updatedProject, status: finalStatus };
         setProjects(projects.map(p => p.id === updatedProject.id ? autoUpdatedProject : p));
     }

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
  }, [projects, handleUpdateProject]);

  // --- ONE-TIME DATA FIX: Correct Years to 2026 ---
  const hasFixedYears = React.useRef(false);

  useEffect(() => {
    const fixYears = async () => {
        if (hasFixedYears.current || !session) return;
        
        console.log("Running Year Correction Fix (Deep Clean)...");
        hasFixedYears.current = true;

        try {
            // 1. Fix Documents (Emission Date + Upload Date + Name)
            const { data: docs } = await supabase
                .from('documents')
                .select('id, emission_date, date, name');

            if (docs) {
                const updates = [];
                for (const d of docs) {
                    let needsUpdate = false;
                    let newEmissionDate = d.emission_date;
                    let newDate = d.date;
                    let newName = d.name;

                    // Fix Emission Date
                    if (newEmissionDate) {
                        const year = parseInt(newEmissionDate.split('-')[0]);
                        if (year !== 2026) {
                            const parts = newEmissionDate.split('-');
                            parts[0] = '2026';
                            newEmissionDate = parts.join('-');
                            needsUpdate = true;
                        }
                    }

                    // Fix Upload Date
                    if (newDate) {
                        const year = parseInt(newDate.split('-')[0]);
                        if (year !== 2026) {
                            const parts = newDate.split('-');
                            parts[0] = '2026';
                            newDate = parts.join('-');
                            needsUpdate = true;
                        }
                    }

                    // Fix Name (e.g. "Factura 03-03-2028" -> "Factura 03-03-2026")
                    if (newName) {
                        // Regex to find years like 2020-2030 but not 2026
                        const yearRegex = /(20[2-3][0-9])/g;
                        const match = newName.match(yearRegex);
                        if (match) {
                            for (const m of match) {
                                if (m !== '2026') {
                                    newName = newName.replace(m, '2026');
                                    needsUpdate = true;
                                }
                            }
                        }
                    }

                    if (needsUpdate) {
                        updates.push({ 
                            id: d.id, 
                            emission_date: newEmissionDate, 
                            date: newDate,
                            name: newName
                        });
                    }
                }

                if (updates.length > 0) {
                    console.log(`Fixing ${updates.length} documents (dates/names) to year 2026...`);
                    for (const update of updates) {
                        await supabase.from('documents').update({ 
                            emission_date: update.emission_date,
                            date: update.date,
                            name: update.name
                        }).eq('id', update.id);
                    }
                }
            }

            // 2. Fix Transactions
            const { data: txs } = await supabase
                .from('transactions')
                .select('id, date')
                .not('date', 'is', null);

            if (txs) {
                const txUpdates = txs
                    .filter((t: any) => {
                        if (!t.date) return false;
                        const year = parseInt(t.date.split('-')[0]);
                        return year !== 2026;
                    })
                    .map((t: any) => {
                        const parts = t.date.split('-');
                        parts[0] = '2026';
                        return { id: t.id, date: parts.join('-') };
                    });

                if (txUpdates.length > 0) {
                    console.log(`Fixing ${txUpdates.length} transactions to year 2026...`);
                    for (const update of txUpdates) {
                        await supabase.from('transactions').update({ date: update.date }).eq('id', update.id);
                    }
                }
            }
            
            // Refresh data after fix
            fetchProjects();

        } catch (err) {
            console.error("Error running year fix:", err);
        }
    };

    fixYears();
  }, [session]);

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
            projects={projects}
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
        projects={projects}
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