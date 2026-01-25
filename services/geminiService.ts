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
  
  return ''; 
};

const apiKey = getApiKey();
// Inicialización con clave o fallback seguro para no romper renderizado
const ai = new GoogleGenAI({ apiKey: apiKey || 'MISSING_KEY' });

// Usamos el modelo Flash por ser rápido y eficiente en costes
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
        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            const potentialJson = text.substring(firstBracket, lastBracket + 1);
            return JSON.parse(potentialJson);
        }

        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        if (cleanText.startsWith('```')) {
             cleanText = cleanText.split('\n').slice(1).join('\n').replace(/```$/, '');
        }
        // Intentar parsear objeto único y envolverlo en array
        if (cleanText.trim().startsWith('{')) {
             const obj = JSON.parse(cleanText);
             return [obj];
        }
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("Failed to parse JSON response:", text);
        throw new Error("La IA no devolvió un formato válido JSON.");
    }
};

const optimizeImage = async (base64Str: string, maxWidth = 512): Promise<string> => {
    return new Promise((resolve) => {
        if (typeof Image === 'undefined' || base64Str.startsWith('http')) {
            resolve(base64Str);
            return;
        }

        const cleanStr = base64Str.includes(',') ? base64Str.split(',')[1] : base64Str;

        const img = new Image();
        img.src = `data:image/jpeg;base64,${cleanStr}`;
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            // Reducimos tamaño para evitar payloads gigantes (Error 413/500)
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth) {
                height = height * (maxWidth / width);
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                // Compresión agresiva JPEG 0.6 para móviles
                resolve(canvas.toDataURL('image/jpeg', 0.6).split(',')[1]);
            } else {
                resolve(cleanStr);
            }
        };
        img.onerror = () => resolve(cleanStr);
    });
};

const retryOperation = async <T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        // Detectar errores de cuota o servidor
        const isQuotaError = error.message?.includes('429') || error.status === 429;
        const isServerError = error.message?.includes('500') || error.message?.includes('503') || error.status >= 500;

        if (retries > 0 && (isQuotaError || isServerError)) {
            console.warn(`Error IA (${error.status || 'unknown'}). Reintentando en ${delay}ms... Intentos restantes: ${retries}`);
            await new Promise(r => setTimeout(r, delay));
            // Backoff exponencial: espera más tiempo en cada reintento (1s -> 2s -> 4s)
            return retryOperation(operation, retries - 1, delay * 2);
        }
        throw error;
    }
};

// --- Exports ---

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    return apiQueue.add(async () => {
        try {
            if (!apiKey) throw new Error("Falta la API Key. Configure VITE_API_KEY.");

            const priceContext = currentPrices.slice(0, 80).map(p => `- ${p.name}: ${p.price}€/${p.unit}`).join('\n');
            
            const prompt = `Actúa como INGENIERO ELÉCTRICO (REBT España). Genera partidas de presupuesto para: "${description}".
            
            REGLAS:
            1. Desglosa cables por color (Azul, Marrón, Tierra) si aplica.
            2. Usa precios de la BD si existen, si no estima.
            3. Devuelve JSON Array: [{ "name": string, "quantity": number, "unit": string, "pricePerUnit": number, "category": "Material"|"Mano de Obra" }]
            
            BD PRECIOS:
            ${priceContext}`;

            const parts: any[] = [{ text: prompt }];
            
            if (images.length > 0) {
                 const rawImg = images[0];
                 const optimizedImg = await optimizeImage(rawImg);
                 if (!optimizedImg.startsWith('http')) {
                    parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedImg } });
                 }
            }

            const operation = () => ai.models.generateContent({
                model: MODEL_FLASH,
                contents: { parts },
                config: { 
                    temperature: 0.2, 
                    responseMimeType: "application/json",
                    // Limitar tokens de salida para evitar cortes en redes lentas
                    maxOutputTokens: 2000 
                }
            });

            const response = await retryOperation(operation);
            
            if (!response.text) throw new Error("La IA devolvió una respuesta vacía.");
            
            const result = cleanAndParseJSON(response.text);
            return Array.isArray(result) ? result : [];
            
        } catch (e: any) {
            console.error("Error generating budget:", e);
            throw e; // Relanzar error para que la UI lo muestre
        }
    });
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
    return apiQueue.add(async () => {
         try {
             if (!apiKey) return "Error: API Key no configurada.";

             const prompt = `Analiza proyecto construcción: ${project.name}. Presupuesto: ${project.budget}. Gastado: ${project.transactions.reduce((s,t) => t.type==='expense'?s+t.amount:s, 0)}. Progreso: ${project.progress}%. Breve resumen ejecutivo y riesgos (3 frases).`;

             const response = await retryOperation(() => ai.models.generateContent({
                 model: MODEL_FLASH,
                 contents: prompt,
                 config: { temperature: 0.5 }
             }));
             return response.text || "No se pudo generar análisis.";
         } catch (e) {
             return "El servicio de IA no está disponible en este momento.";
         }
    });
};

export const analyzeDocument = async (base64Data: string, mimeType: string) => {
     return apiQueue.add(async () => {
        try {
            if (!apiKey) return { errorType: 'GENERIC', description: 'API Key missing' };

            const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
            // Optimizar imagen para evitar timeout en escáner
            const optimizedBase64 = mimeType.startsWith('image') ? await optimizeImage(base64Data) : cleanBase64;
            
            const prompt = `Analiza documento (factura/albarán). JSON con: comercio, total (number), iva (number), fecha (YYYY-MM-DD), categoria, items array {name, quantity, price, unit}.`;

            const response = await retryOperation(() => ai.models.generateContent({
                model: MODEL_FLASH,
                contents: {
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: mimeType.startsWith('image') ? 'image/jpeg' : mimeType, data: optimizedBase64 } }
                    ]
                },
                config: { responseMimeType: "application/json" }
            }));
            
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
             const prompt = `Extrae materiales de: "${text}". JSON array: {name, unit, price, category}.`;
             const response = await retryOperation(() => ai.models.generateContent({
                 model: MODEL_FLASH,
                 contents: prompt,
                 config: { responseMimeType: "application/json" }
             }));
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
            if (base64Data.startsWith('http')) return [];

            const optimized = await optimizeImage(base64Data);
            const prompt = `Extrae materiales de imagen catálogo/tarifa. JSON array: {name, unit, price, category}.`;
            
            const response = await retryOperation(() => ai.models.generateContent({
                model: MODEL_FLASH,
                contents: {
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: 'image/jpeg', data: optimized } }
                    ]
                },
                config: { responseMimeType: "application/json" }
            }));
            
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
            if (!apiKey) return "Error de configuración (API Key).";
            const response = await retryOperation(() => ai.models.generateContent({
                model: MODEL_FLASH,
                contents: `${context}\n\nUsuario: ${message}`,
            }));
            return response.text || "Sin respuesta.";
        } catch (e) {
            return "El asistente está experimentando una alta carga de trabajo. Inténtalo de nuevo en unos segundos.";
        }
    });
};