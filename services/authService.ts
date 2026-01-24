import { supabase } from '../lib/supabase';

// Helper to cast auth to any to support v1 method calls despite v2 types if present in environment
const auth = supabase.auth as any;

/**
 * Obtiene la sesión actual almacenada localmente.
 * Útil para el chequeo inicial al cargar la app.
 */
export const getCurrentSession = async () => {
  try {
    // Check if session() exists (v1) or fallback to null (or maybe getSession if v2 was actually there)
    // The errors indicate getSession is missing, so we use session().
    const session = auth.session ? auth.session() : null;
    return session;
  } catch (error) {
    console.error('Error recuperando sesión:', error);
    return null;
  }
};

/**
 * Inicia sesión con email y contraseña.
 */
export const signInWithEmail = async (email: string, password: string) => {
  // Use v1 syntax: signIn instead of signInWithPassword
  const { user, session, error } = await auth.signIn({
    email,
    password,
  });
  // Return structure compatible with expected usage { data: { ... }, error }
  return { data: { user, session }, error };
};

/**
 * Cierra la sesión actual.
 */
export const signOut = async () => {
  const { error } = await auth.signOut();
  if (error) console.error('Error al cerrar sesión:', error);
};

/**
 * Suscribe a los cambios de estado de autenticación (Login, Logout, Token Refresh).
 * Retorna la suscripción para poder desuscribirse al desmontar componentes.
 */
export const onAuthStateChange = (callback: (session: any) => void) => {
  // v1 returns { data: Subscription, error }
  const { data } = auth.onAuthStateChange((_event: any, session: any) => {
    callback(session);
  });
  return data;
};
