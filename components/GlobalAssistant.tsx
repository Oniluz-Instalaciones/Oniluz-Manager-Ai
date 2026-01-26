import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, User, Bot, Loader2, Zap } from 'lucide-react';
import { chatWithAssistant } from '../services/geminiService';

interface GlobalAssistantProps {
  onClose: () => void;
  isOpen: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

const SYSTEM_INSTRUCTION = `Actúa como un INGENIERO ELECTRICISTA EXPERTO y especialista en el Reglamento Electrotécnico de Baja Tensión (REBT) de España.

TU OBJETIVO: Asistir al instalador con dudas técnicas, cálculos, normativas y resolución de problemas en obra.

REGLAS DE ACTUACIÓN OBLIGATORIAS:
1. CUMPLIMIENTO ESTRICTO REBT: Basa todas tus respuestas en el REBT vigente y sus Guías Técnicas de Aplicación. Cita la ITC-BT correspondiente siempre que sea posible (ej: "Según la ITC-BT-19...").
2. SEGURIDAD ANTE TODO: Prioriza siempre la seguridad de la instalación y las personas. Si una práctica es peligrosa o ilegal según el reglamento, adviértelo con firmeza.
3. PRECISIÓN TÉCNICA: Usa terminología técnica correcta (PIA, Diferencial, Poder de corte, Isc, Caída de tensión, etc.).
4. SOLUCIONES PRÁCTICAS: Además de la teoría, da consejos prácticos de montaje si se solicitan, siempre dentro de la norma.
5. CÁLCULOS: Si te piden cálculos (sección de cable, protecciones), realiza los cálculos justificándolos (fórmula de caída de tensión, criterio de intensidad admisible, etc.). Si faltan datos, pídelos.

Eres un compañero de trabajo senior: técnico, preciso y directo al grano.`;

const GlobalAssistant: React.FC<GlobalAssistantProps> = ({ onClose, isOpen }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      text: 'Hola. Soy tu consultor técnico experto en el REBT. ¿Tienes alguna duda normativa, problema de instalación o cálculo eléctrico que necesites resolver?',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    setInputValue('');
    setIsLoading(true);

    // Build context including the System Instruction and recent history
    const conversationHistory = messages.slice(-8).map(m => `${m.role === 'user' ? 'Usuario' : 'Experto REBT'}: ${m.text}`).join('\n');
    const fullContext = `${SYSTEM_INSTRUCTION}\n\nHistorial de conversación reciente:\n${conversationHistory}`;
    
    const responseText = await chatWithAssistant(newMessage.text, fullContext);

    const botResponse: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      text: responseText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, botResponse]);
    setIsLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm bg-slate-900/40">
      <div className="bg-white dark:bg-slate-800 w-full max-w-lg h-[600px] max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 bg-[#0047AB] text-white flex justify-between items-center shadow-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-full">
              <Zap className="w-5 h-5 text-yellow-300 fill-current" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Asistente Técnico</h3>
              <p className="text-[10px] text-blue-100 opacity-90 font-medium">Especialista REBT & Normativa</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900/50">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user' 
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' 
                  : 'bg-[#0047AB] text-white'
              }`}>
                {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>
              
              <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                msg.role === 'user'
                  ? 'bg-[#0047AB] text-white rounded-br-none'
                  : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-bl-none'
              }`}>
                 {msg.text.split('\n').map((line, i) => (
                    <p key={i} className={`min-h-[1em] ${i > 0 ? 'mt-1' : ''}`}>
                        {line}
                    </p>
                 ))}
              </div>
            </div>
          ))}
          {isLoading && (
             <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#0047AB] flex items-center justify-center shrink-0">
                   <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-bl-none border border-slate-100 dark:border-slate-700 flex items-center gap-2">
                   <Loader2 className="w-4 h-4 animate-spin text-[#0047AB]" />
                   <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Consultando normativa...</span>
                </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSendMessage} className="p-4 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex gap-2 shrink-0">
          <input 
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Pregunta sobre la ITC-BT-19, secciones, protecciones..."
            className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0047AB] text-slate-900 dark:text-white transition-colors"
          />
          <button 
            type="submit" 
            disabled={!inputValue.trim() || isLoading}
            className="bg-[#0047AB] text-white p-3 rounded-xl hover:bg-[#003380] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-900/20"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>

      </div>
    </div>
  );
};

export default GlobalAssistant;