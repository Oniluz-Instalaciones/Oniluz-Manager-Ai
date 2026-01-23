import { createClient } from '@supabase/supabase-js';

// Función auxiliar para obtener variables de entorno de forma segura
// Evita el error "Cannot read properties of undefined" si import.meta.env no existe
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
  console.warn("Para arreglar esto, edita lib/supabase.ts y coloca tus claves reales en las variables por defecto.");
}

// Inicializamos el cliente con valores placeholder si faltan las claves.
// Esto permite que la UI cargue sin errores fatales, aunque las operaciones de DB fallarán hasta que se configure.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co', 
  supabaseAnonKey || 'placeholder-anon-key'
);