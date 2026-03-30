import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

/**
 * Obtiene la sesión actual almacenada localmente.
 * Útil para el chequeo inicial al cargar la app.
 */
export const getCurrentSession = async () => {
  if (!isSupabaseConfigured) {
    console.warn("Supabase no configurado, omitiendo verificación de sesión.");
    return null;
  }
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
        console.warn("Error verificando sesión:", error.message);
        return null;
    }
    return data.session;
  } catch (error) {
    console.error('Error recuperando sesión:', error);
    return null;
  }
};

/**
 * Inicia sesión con email y contraseña.
 */
export const signInWithEmail = async (email: string, password: string) => {
  if (!isSupabaseConfigured) {
    return { data: { user: null, session: null }, error: { message: "Supabase no configurado. Revisa .env" } };
  }
  // Supabase v2 usa signInWithPassword
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

/**
 * Registra un nuevo usuario con email y contraseña.
 */
export const signUpWithEmail = async (email: string, password: string) => {
  if (!isSupabaseConfigured) {
    return { data: { user: null, session: null }, error: { message: "Supabase no configurado. Revisa .env" } };
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
};

/**
 * Cierra la sesión actual.
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('Error al cerrar sesión:', error);
};

/**
 * Suscribe a los cambios de estado de autenticación (Login, Logout, Token Refresh).
 * Retorna la suscripción para poder desuscribirse al desmontar componentes.
 */
export const onAuthStateChange = (callback: (session: Session | null) => void) => {
  if (!isSupabaseConfigured) {
    // Simulate initial auth state check completion (no session)
    setTimeout(() => callback(null), 0);
    return { unsubscribe: () => {} };
  }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  // En v2, onAuthStateChange devuelve un objeto con la propiedad 'subscription'
  return data.subscription;
};
