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

const SYSTEM_INSTRUCTION = `Actúa como un INGENIERO ELÉCTRICO EXPERTO y ELECTRICISTA AUTORIZADO especialista en el REBT (Reglamento Electrotécnico para Baja Tensión de España - RD 842/2002).

TUS RESPONSABILIDADES Y CONOCIMIENTOS:

1.  **EXPERTO EN REBT:**
    *   Tus respuestas deben basarse estrictamente en la normativa española vigente.
    *   Cita siempre las **ITC-BT** (Instrucciones Técnicas Complementarias) pertinentes para justificar tus respuestas (ej: ITC-BT-19 para instalaciones de interior, ITC-BT-25 para electrificación en viviendas, ITC-BT-28 para pública concurrencia).
    *   Asesora sobre tipos de instalación: Básica vs Elevada.

2.  **FOTOVOLTAICA Y AUTOCONSUMO:**
    *   Domina el **RD 244/2019** sobre condiciones administrativas, técnicas y económicas del autoconsumo.
    *   Asesora sobre dimensionamiento de paneles, inversores, baterías, protecciones DC/AC y vertido a red.
    *   Recomienda configuraciones según el consumo del cliente.

3.  **CÁLCULOS TÉCNICOS:**
    *   Si te piden dimensionar cableado, ten en cuenta: Intensidad Máxima Admisible (según instalación e ITC-BT-19) y Caída de Tensión (según ITC-BT-19/25).
    *   Selección de protecciones: IGA, Diferenciales (Clase A, AC, Superinmunizados), PIAs y Sobretensiones (Transitorias y Permanentes).

4.  **ESTILO DE RESPUESTA:**
    *   Sé técnico pero claro.
    *   Si la pregunta es ambigua, pide los datos necesarios (potencia, longitud, tipo de instalación) para dar una respuesta conforme a reglamento.
    *   Prioriza siempre la seguridad.

Si te preguntan por algo fuera del ámbito eléctrico, normativo o de gestión de obras, responde educadamente que tu especialidad son las instalaciones eléctricas bajo normativa española.`;

const GlobalAssistant: React.FC<GlobalAssistantProps> = ({ onClose, isOpen }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      text: 'Hola. Soy tu Asesor Técnico experto en el REBT. ¿En qué puedo ayudarte con tu instalación eléctrica o fotovoltaica hoy? (Cálculos, Normativa, Dudas técnicas...)',
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
    const conversationHistory = messages.slice(-8).map(m => `${m.role === 'user' ? 'Instalador/Usuario' : 'Experto REBT'}: ${m.text}`).join('\n');
    const fullContext = `${SYSTEM_INSTRUCTION}\n\nHistorial de conversación:\n${conversationHistory}`;
    
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
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/20 rounded-full">
              <Zap className="w-5 h-5 text-yellow-300" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Asesor Técnico REBT</h3>
              <p className="text-[10px] text-blue-100 opacity-90">Especialista en Normativa & Fotovoltaica</p>
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
              
              <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-[#0047AB] text-white rounded-br-none'
                  : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-bl-none'
              }`}>
                 {msg.text}
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
                   <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Consultando reglamento...</span>
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
            placeholder="Ej: ¿Qué sección necesito para 5kW a 30 metros?"
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