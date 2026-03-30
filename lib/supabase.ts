import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const isSupabaseConfigured = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY && !import.meta.env.VITE_SUPABASE_URL.includes('placeholder');

if (!isSupabaseConfigured) {
  console.warn("ADVERTENCIA: Faltan credenciales de Supabase. La base de datos no conectará.");
}

// Custom storage adapter to handle iframe/incognito localStorage restrictions
const memoryStorage: Record<string, string> = {};
const customStorage = {
  getItem: (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      console.warn('localStorage is not available, falling back to memory');
      return memoryStorage[key] || null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      memoryStorage[key] = value;
    }
  },
  removeItem: (key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      delete memoryStorage[key];
    }
  }
};

// Inicializamos el cliente con configuración explícita de persistencia
export const supabase = createClient(
  supabaseUrl, 
  supabaseAnonKey,
  {
    auth: {
      storage: customStorage, // Use robust custom storage
      persistSession: true, // Forzar persistencia
      autoRefreshToken: true, // Renovar tokens automáticamente
      detectSessionInUrl: true // Detectar enlaces de login mágicos
    }
  }
);