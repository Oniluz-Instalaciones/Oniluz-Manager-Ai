import { GoogleGenAI } from "@google/genai";
import { Project, PriceItem } from '../types';

// --- Configuration & Initialization ---

const getClientApiKey = (): string | undefined => {
  try {
    // 1. Vite env vars
    // @ts-ignore
    if (import.meta?.env?.VITE_API_KEY) return import.meta.env.VITE_API_KEY;
    // 2. Standard process.env (often replaced by bundlers)
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env?.API_KEY) return process.env.API_KEY;
  } catch (e) {
    // ignore error
  }
  // 3. Hardcoded fallback provided by user
  return 'AIzaSyAPt-4D6bA9qLK-BrijbJBcmnBU1ojXOA8';
};

const apiKey = getClientApiKey();
// Inicializamos cliente local solo si hay key, sino usaremos fallback
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// CAMBIO CRÍTICO: Usamos gemini-3-flash-preview para evitar el límite de 20 req/día del 2.5
// Si este falla, se podría probar 'gemini-2.0-flash'
const MODEL_FLASH = 'gemini-3-flash-preview';

// --- Unified Request Handler ---

/**
 * Intenta generar contenido usando el SDK cliente.
 * Si no hay API Key cliente, hace fallback al endpoint servidor /api/generate.
 */
const callGenAI = async (model: string, contents: any, config: any = {}) => {
    // A. Opción Cliente (Rápida, directa)
    if (ai) {
        try {
            const response = await ai.models.generateContent({
                model,
                contents,
                config
            });
            return { text: response.text };
        } catch (error: any) {
            // Si falla por cuota (429) o servidor (500), lanzamos para que el retry lo capture
            throw error;
        }
    }

    // B. Opción Servidor (Fallback seguro)
    // Si no hay key local, llamamos a nuestra propia API que sí debería tener la key en el servidor
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, contents, config })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server Error: ${response.status}`);
        }

        const data = await response.json();
        return { text: data.text };
    } catch (error) {
        console.error("AI Service Error:", error);
        throw error;
    }
};

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
    if (!text) return [];
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
        if (cleanText.trim().startsWith('{')) {
             const obj = JSON.parse(cleanText);
             return [obj];
        }
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("Failed to parse JSON response:", text);
        return [];
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
        const msg = error.message || '';
        const isQuotaError = msg.includes('429') || error.status === 429;
        const isServerError = msg.includes('500') || msg.includes('503') || error.status >= 500;

        // Detectar tiempo de espera sugerido por Google (ej: "Please retry in 56.25s")
        const waitMatch = msg.match(/retry in ([0-9.]+)s/);
        let waitTime = delay;
        
        if (waitMatch && waitMatch[1]) {
            const seconds = parseFloat(waitMatch[1]);
            // Si Google pide esperar más de 10 segundos, no reintentamos automáticamente para no bloquear la UI
            if (seconds > 10) {
                 throw new Error(`Cuota excedida. Google pide esperar ${Math.ceil(seconds)} segundos. Inténtalo más tarde.`);
            }
            waitTime = seconds * 1000 + 1000; // Esperar lo que dice + 1s buffer
        }

        if (retries > 0 && (isQuotaError || isServerError)) {
            console.warn(`Reintentando IA (${error.status})... Esperando ${waitTime}ms. Quedan ${retries}`);
            await new Promise(r => setTimeout(r, waitTime));
            return retryOperation(operation, retries - 1, waitTime * 2); // Backoff exponencial si no hay tiempo específico
        }
        throw error;
    }
};

// --- Exports ---

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    return apiQueue.add(async () => {
        try {
            const priceContext = currentPrices.slice(0, 80).map(p => `- ${p.name}: ${p.price}€/${p.unit}`).join('\n');
            
            const prompt = `Actúa como INGENIERO ELÉCTRICO (REBT España). Genera partidas para: "${description}".
            
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

            const response = await retryOperation(() => callGenAI(
                MODEL_FLASH,
                { parts },
                { 
                    temperature: 0.2, 
                    responseMimeType: "application/json",
                    maxOutputTokens: 2000 
                }
            ));
            
            if (!response.text) throw new Error("Respuesta vacía de IA");
            
            const result = cleanAndParseJSON(response.text);
            return Array.isArray(result) ? result : [];
            
        } catch (e: any) {
            console.error("Error generating budget:", e);
            throw e; 
        }
    });
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
    return apiQueue.add(async () => {
         try {
             const prompt = `Analiza proyecto: ${project.name}. Presupuesto: ${project.budget}. Gastado: ${project.transactions.reduce((s,t) => t.type==='expense'?s+t.amount:s, 0)}. Progreso: ${project.progress}%. Resumen ejecutivo y riesgos (3 frases).`;

             const response = await retryOperation(() => callGenAI(
                 MODEL_FLASH,
                 prompt,
                 { temperature: 0.5 }
             ));
             return response.text || "No se pudo generar análisis.";
         } catch (e: any) {
             if (e.message.includes('Cuota excedida')) return "Límite de IA alcanzado. Espera un minuto.";
             return "Servicio no disponible temporalmente.";
         }
    });
};

export const analyzeDocument = async (base64Data: string, mimeType: string) => {
     return apiQueue.add(async () => {
        try {
            const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
            const optimizedBase64 = mimeType.startsWith('image') ? await optimizeImage(base64Data) : cleanBase64;
            
            const prompt = `Analiza documento (factura/albarán). JSON con: comercio, total (number), iva (number), fecha (YYYY-MM-DD), categoria, items array {name, quantity, price, unit}.`;

            const response = await retryOperation(() => callGenAI(
                MODEL_FLASH,
                {
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: mimeType.startsWith('image') ? 'image/jpeg' : mimeType, data: optimizedBase64 } }
                    ]
                },
                { responseMimeType: "application/json" }
            ));
            
            return cleanAndParseJSON(response.text || "{}");
        } catch (e: any) {
            if (e.message.includes('Cuota')) return { errorType: 'QUOTA', description: e.message };
            return { errorType: 'GENERIC', description: e.message };
        }
     });
};

export const parseMaterialsFromInput = async (text: string): Promise<PriceItem[]> => {
     return apiQueue.add(async () => {
         try {
             const prompt = `Extrae materiales de: "${text}". JSON array: {name, unit, price, category}.`;
             const response = await retryOperation(() => callGenAI(
                 MODEL_FLASH,
                 prompt,
                 { responseMimeType: "application/json" }
             ));
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
            if (base64Data.startsWith('http')) return [];
            const optimized = await optimizeImage(base64Data);
            const prompt = `Extrae materiales de imagen. JSON array: {name, unit, price, category}.`;
            
            const response = await retryOperation(() => callGenAI(
                MODEL_FLASH,
                {
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: 'image/jpeg', data: optimized } }
                    ]
                },
                { responseMimeType: "application/json" }
            ));
            
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
            const response = await retryOperation(() => callGenAI(
                MODEL_FLASH,
                `${context}\n\nUsuario: ${message}`
            ));
            return response.text || "Sin respuesta.";
        } catch (e: any) {
            if (e.message.includes('Cuota')) return "He alcanzado mi límite de respuestas por minuto. Por favor, pregúntame de nuevo en unos segundos.";
            return "Error de conexión con el servicio inteligente.";
        }
    });
};