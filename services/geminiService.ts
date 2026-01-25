import { GoogleGenAI } from "@google/genai";
import { Project, PriceItem } from '../types';

// Función segura para obtener la API Key sin romper la ejecución en navegadores
const getApiKey = (): string => {
  try {
    // Intento 1: Vite (import.meta.env) - Estándar moderno
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
      // @ts-ignore
      return import.meta.env.VITE_API_KEY;
    }
    
    // Intento 2: process.env (si está definido mediante polyfill o config de bundler)
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
  } catch (e) {
    console.warn("No se pudo acceder a las variables de entorno de forma estándar.");
  }
  
  // Fallback: Evita el crash inicial, aunque las llamadas fallarán si no hay key.
  return ''; 
};

const apiKey = getApiKey();
// Inicialización segura: Si no hay key, se inicializa con string vacío para no romper la app al cargar,
// pero las llamadas fallarán controladamente.
const ai = new GoogleGenAI({ apiKey: apiKey || 'MISSING_KEY' });

// Models
// Utilizar un modelo rápido y estable para JSON. gemini-2.5-flash es excelente para esto.
const MODEL_FLASH = 'gemini-2.5-flash';

// --- Helpers ---

class RequestQueue {
    private queue: (() => Promise<any>)[] = [];
    private working = false;

    add<T>(task: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (e) {
                    reject(e);
                }
            });
            this.process();
        });
    }

    private async process() {
        if (this.working || this.queue.length === 0) return;
        this.working = true;
        const task = this.queue.shift();
        if (task) {
            try {
                await task();
            } finally {
                this.working = false;
                this.process();
            }
        }
    }
}
const apiQueue = new RequestQueue();

const cleanAndParseJSON = (text: string) => {
    try {
        // 1. Intentar encontrar el array JSON directamente buscando los corchetes
        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            const potentialJson = text.substring(firstBracket, lastBracket + 1);
            return JSON.parse(potentialJson);
        }

        // 2. Fallback: Limpieza estándar de markdown
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        if (cleanText.startsWith('```')) {
             cleanText = cleanText.split('\n').slice(1).join('\n').replace(/```$/, '');
        }
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("Failed to parse JSON response:", text);
        return [];
    }
};

const optimizeImage = async (base64Str: string, maxWidth = 800): Promise<string> => {
    return new Promise((resolve) => {
        // Si no estamos en navegador o la cadena parece una URL, la devolvemos tal cual (se filtrará luego si no es base64)
        if (typeof Image === 'undefined' || base64Str.startsWith('http')) {
            resolve(base64Str);
            return;
        }

        // Limpiar cabecera si existe para procesar
        const cleanStr = base64Str.includes(',') ? base64Str.split(',')[1] : base64Str;

        const img = new Image();
        img.src = `data:image/jpeg;base64,${cleanStr}`; // Asegurar prefijo para carga
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ratio = maxWidth / img.width;
            if (ratio >= 1) {
                // Si es pequeña, devolver original limpia
                resolve(cleanStr);
                return;
            }
            canvas.width = maxWidth;
            canvas.height = img.height * ratio;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
            // Devolver solo la parte base64
            resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
        };
        img.onerror = () => resolve(cleanStr); // Si falla carga, devolver original
    });
};

const retryOperation = async <T>(operation: () => Promise<T>, retries = 3): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        if (retries > 0) {
            await new Promise(r => setTimeout(r, 2000));
            return retryOperation(operation, retries - 1);
        }
        throw error;
    }
};

// --- Exports ---

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    return apiQueue.add(async () => {
        try {
            if (!apiKey) {
                console.error("API Key faltante");
                return [];
            }

            const priceContext = currentPrices.slice(0, 100).map(p => `- ${p.name} (Categoría: ${p.category}): ${p.price}€/${p.unit}`).join('\n');
            
            const prompt = `Actúa como un INGENIERO ELÉCTRICO EXPERTO EN EL REBT (Reglamento Electrotécnico para Baja Tensión de España).
            Tu tarea es generar un presupuesto técnico y detallado para: "${description}".

            ### REGLAS OBLIGATORIAS (REBT ESPAÑA):
            1. CLASIFICACIÓN: Determina si es Electrificación Básica (C1-C5) o Elevada (C1-C12, aire acondicionado, calefacción, etc.) según la descripción.
            2. CIRCUITOS Y CABLEADO: Debes calcular las secciones mínimas y protecciones:
               - Iluminación (C1): Cable 1.5mm², PIA 10A.
               - Tomas uso general (C2): Cable 2.5mm², PIA 16A.
               - Cocina/Horno (C3): Cable 6mm², PIA 25A.
               - Lavadora/Termo (C4): Cable 4mm², PIA 20A.
               - Baños/Cocina Humeda (C5): Cable 2.5mm², PIA 16A.
               
               *** REGLA DE ORO PARA CABLES (COLORES) ***:
               NO pongas una partida genérica como "Cable 2.5mm". Debes DESGLOSAR los cables unipolares (H07V-K) por su color reglamentario y cantidad individual:
               - Cable [Sección]mm² Azul (Neutro) -> Metros necesarios.
               - Cable [Sección]mm² Marrón/Negro/Gris (Fase) -> Metros necesarios.
               - Cable [Sección]mm² Amarillo/Verde (Tierra) -> Metros necesarios.
               (Ejemplo: Si hay 100m de tubo corrugado para enchufes, debes listar: 100m Cable 2.5 Azul, 100m Cable 2.5 Marrón, 100m Cable 2.5 Tierra).

            3. CUADRO GENERAL (CGMP): Incluye IGA, Diferenciales (30mA) y Sobretensiones si aplica.
            4. MECANISMOS: Calcula número aproximado de cajas universales, enchufes e interruptores.

            ### POLÍTICA DE PRECIOS (PRIORIDAD ESTRICTA):
            1. BUSCA EN LA BASE DE DATOS PROPIA (abajo). Si el material necesario existe (aunque el nombre varíe ligeramente), USA ESE NOMBRE EXACTO y SU PRECIO.
            2. Si NO existe en la base de datos: Estima un precio de mercado realista en España para 2024/2025.

            ### BASE DE DATOS PROPIA:
            ${priceContext}

            ### FORMATO DE SALIDA:
            Devuelve ÚNICAMENTE un Array JSON válido con objetos: 
            [{ "name": "Nombre técnico exacto", "quantity": numero_estimado, "unit": "m/ud/h", "pricePerUnit": precio, "category": "Material/Mano de Obra" }]
            
            No incluyas markdown, solo el JSON puro.`;

            const parts: any[] = [{ text: prompt }];
            
            if (images.length > 0) {
                 // Solo procesar la primera imagen para no exceder límites
                 const rawImg = images[0];
                 const optimizedImg = await optimizeImage(rawImg);
                 
                 // CRÍTICO: Verificar que es base64 y no una URL antes de enviar
                 // Si empieza por http, es una URL externa que la API de Gemini no acepta en inlineData
                 if (!optimizedImg.startsWith('http')) {
                    parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedImg } });
                 }
            }

            const operation = () => ai.models.generateContent({
                model: MODEL_FLASH,
                contents: { parts },
                config: { temperature: 0.2, responseMimeType: "application/json" }
            });

            const response = await retryOperation(operation);
            const result = cleanAndParseJSON(response.text || "[]");
            return Array.isArray(result) ? result : [];
        } catch (e) {
            console.error("Error generating budget:", e);
            return []; // Devolver array vacío en caso de error para que la UI lo maneje
        }
    });
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
    return apiQueue.add(async () => {
         try {
             if (!apiKey) return "API Key no configurada. No se puede realizar el análisis.";

             const prompt = `Analiza el estado de este proyecto de construcción/instalación:
             Proyecto: ${project.name}
             Cliente: ${project.client}
             Presupuesto: ${project.budget}
             Gastos Totales: ${project.transactions.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0)}
             Progreso: ${project.progress}%
             Incidencias Abiertas: ${project.incidents.filter(i => i.status === 'Open').length}
             
             Dame un resumen ejecutivo breve (3-4 frases) sobre la salud del proyecto, riesgos financieros y recomendaciones.`;

             const response = await ai.models.generateContent({
                 model: MODEL_FLASH,
                 contents: prompt,
                 config: { temperature: 0.5 }
             });
             return response.text || "No se pudo generar el análisis.";
         } catch (e) {
             return "Error al conectar con el asistente.";
         }
    });
};

export const analyzeDocument = async (base64Data: string, mimeType: string) => {
     return apiQueue.add(async () => {
        try {
            if (!apiKey) return { errorType: 'GENERIC', description: 'API Key missing' };

            const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
            
            const prompt = `Analiza este documento (factura o albarán).
            Extrae:
            - comercio (nombre proveedor)
            - total (importe total numérico)
            - iva (importe impuestos)
            - fecha (YYYY-MM-DD)
            - categoria (sugiere una categoría para el gasto: Material, Combustible, Dietas, Herramienta, Varios)
            - items: Array de objetos {name, quantity, price, unit} con los materiales detectados.
            
            Devuelve JSON.`;

            const response = await ai.models.generateContent({
                model: MODEL_FLASH,
                contents: {
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: mimeType, data: cleanBase64 } }
                    ]
                },
                config: { responseMimeType: "application/json" }
            });
            
            return cleanAndParseJSON(response.text || "{}");
        } catch (e: any) {
            return { errorType: 'GENERIC', description: e.message };
        }
     });
};

export const parseMaterialsFromInput = async (text: string): Promise<PriceItem[]> => {
     return apiQueue.add(async () => {
         try {
             if (!apiKey) return [];

             const prompt = `Extrae una lista de materiales de este texto.
             Texto: "${text}"
             
             Devuelve un array JSON de objetos: { "name": string, "unit": string, "price": number, "category": string }.
             Si no hay precio, estima uno de mercado.`;
             
             const response = await ai.models.generateContent({
                 model: MODEL_FLASH,
                 contents: prompt,
                 config: { responseMimeType: "application/json" }
             });
             
             const res = cleanAndParseJSON(response.text || "[]");
             return Array.isArray(res) ? res.map((i: any) => ({...i, id: Date.now().toString() + Math.random()})) : [];
         } catch (e) {
             return [];
         }
     });
};

export const parseMaterialsFromImage = async (base64Data: string): Promise<PriceItem[]> => {
    return apiQueue.add(async () => {
        try {
            if (!apiKey) return [];

            // Limpieza básica y verificación
            if (base64Data.startsWith('http')) return []; // No procesar URLs remotas en este endpoint

            const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
            const prompt = `Extrae una lista de materiales de esta imagen (tarifa de precios o catálogo).
            Devuelve un array JSON de objetos: { "name": string, "unit": string, "price": number, "category": string }.`;
            
            const response = await ai.models.generateContent({
                model: MODEL_FLASH,
                contents: {
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } }
                    ]
                },
                config: { responseMimeType: "application/json" }
            });
            
            const res = cleanAndParseJSON(response.text || "[]");
            return Array.isArray(res) ? res.map((i: any) => ({...i, id: Date.now().toString() + Math.random()})) : [];
        } catch (e) {
            return [];
        }
    });
};

export const chatWithAssistant = async (message: string, context: string): Promise<string> => {
    return apiQueue.add(async () => {
        try {
            if (!apiKey) return "Lo siento, no estoy configurado correctamente (Falta API Key).";

            const response = await ai.models.generateContent({
                model: MODEL_FLASH,
                contents: `${context}\n\nUsuario: ${message}`,
            });
            return response.text || "Lo siento, no puedo responder ahora.";
        } catch (e) {
            return "Error de conexión con el asistente.";
        }
    });
};