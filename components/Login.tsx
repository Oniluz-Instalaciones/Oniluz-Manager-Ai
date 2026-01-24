import React, { useState } from 'react';
import { signInWithEmail } from '../services/authService';
import { Loader2, Mail, Lock, LogIn, AlertCircle } from 'lucide-react';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await signInWithEmail(email, password);

      if (error) throw error;
      // Login successful: App.tsx will detect session change via onAuthStateChange
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión. Verifica tus credenciales.');
      setIsLoading(false); // Only stop loading on error, otherwise wait for app redirect
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col justify-center items-center p-4 transition-colors duration-300">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700">
        
        {/* Header Section */}
        <div className="bg-[#0047AB] p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-12 -mb-12 blur-xl"></div>
          
          <div className="relative z-10 flex justify-center mb-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg ring-4 ring-blue-400/30">
                <svg viewBox="0 0 24 24" className="w-8 h-8 text-[#0047AB]" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C8.13 2 5 5.13 5 9C5 11.38 6.19 13.47 8 14.74V17C8 17.55 8.45 18 9 18H15C15.55 18 16 17.55 16 17V14.74C17.81 13.47 19 11.38 19 9C19 5.13 15.87 2 12 2ZM9 19H15V20C15 20.55 14.55 21 14 21H10C9.45 21 9 20.55 9 20V19Z" fill="currentColor" fillOpacity="0.2"/>
                    <path d="M12 6V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M12 12L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M12 12L15 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M12 22H12.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white relative z-10">Oniluz Manager</h1>
          <p className="text-blue-100 text-sm mt-2 relative z-10">Accede a tu panel de gestión</p>
        </div>

        {/* Form Section */}
        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 p-4 rounded-xl text-sm flex items-start gap-3 border border-red-100 dark:border-red-800">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1">Email Corporativo</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@oniluz.com"
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#0047AB] focus:border-[#0047AB] outline-none transition-all text-slate-900 dark:text-white placeholder-slate-400"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#0047AB] focus:border-[#0047AB] outline-none transition-all text-slate-900 dark:text-white placeholder-slate-400"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#0047AB] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#003380] transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transform active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Entrando...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Iniciar Sesión</span>
                </>
              )}
            </button>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Oniluz AI &copy; {new Date().getFullYear()} - Gestión Integral
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;