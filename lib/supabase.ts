import { createClient } from '@supabase/supabase-js';

// Función auxiliar para obtener variables de entorno de forma segura
const getEnv = (key: string): string => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
      // @ts-ignore
      return import.meta.env[key] || '';
    }
  } catch (e) {
    console.debug('Entorno sin soporte para import.meta.env');
  }
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("ADVERTENCIA: Faltan credenciales de Supabase. La base de datos no conectará.");
}

// Inicializamos el cliente con configuración explícita de persistencia
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co', 
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true, // Forzar persistencia en localStorage
      autoRefreshToken: true, // Renovar tokens automáticamente
      detectSessionInUrl: true // Detectar enlaces de login mágicos
    }
  }
);