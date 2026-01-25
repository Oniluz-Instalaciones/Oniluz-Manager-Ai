import { GoogleGenAI, Type } from "@google/genai";
import { Project, PriceItem } from '../types';

// --- Configuration & Initialization ---

const getClientApiKey = (): string | undefined => {
  try {
    // @ts-ignore
    if (import.meta?.env?.VITE_API_KEY) return import.meta.env.VITE_API_KEY;
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env?.API_KEY) return process.env.API_KEY;
  } catch (e) {}
  // Fallback key provided by user - crucial for functionality if env vars fail
  return 'AIzaSyAPt-4D6bA9qLK-BrijbJBcmnBU1ojXOA8';
};

const apiKey = getClientApiKey();
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Use a stable preview model
const MODEL_FLASH = 'gemini-2.5-flash-preview'; 

// --- Helpers ---

// Robust JSON Cleaner: Extracts JSON array/object from markdown or messy text
const cleanAndParseJSON = (text: string): any => {
    if (!text) return [];
    try {
        // 1. Try direct parse
        return JSON.parse(text);
    } catch (e) {
        // 2. Remove Markdown code blocks
        let cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
        try {
            return JSON.parse(cleaned);
        } catch (e2) {
            // 3. Find array brackets [] or object braces {}
            const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                try { return JSON.parse(arrayMatch[0]); } catch (e3) {}
            }
            const objectMatch = cleaned.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                try { return JSON.parse(objectMatch[0]); } catch (e4) {}
            }
            console.error("Failed to parse AI response:", text);
            return [];
        }
    }
};

const optimizeImage = async (base64Str: string, maxWidth = 512): Promise<string> => {
    return new Promise((resolve) => {
        if (typeof Image === 'undefined' || base64Str.startsWith('http')) {
            resolve(base64Str); // Can't optimize URLs or server-side easily without sharp
            return;
        }

        // Remove prefix if present for processing
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
                // Return Raw Base64 without prefix for Gemini API
                resolve(canvas.toDataURL('image/jpeg', 0.6).split(',')[1]);
            } else {
                resolve(cleanStr);
            }
        };
        img.onerror = () => resolve(cleanStr);
    });
};

// Queue system to prevent rate limiting issues
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

// --- Main AI Function ---

const callGenAI = async (model: string, contents: any, config: any = {}) => {
    if (!ai) throw new Error("API Key Missing");
    
    try {
        const response = await ai.models.generateContent({
            model,
            contents,
            config
        });
        return { text: response.text };
    } catch (error: any) {
        console.error("Gemini API Error:", error);
        throw error;
    }
};

// --- Exports ---

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    return apiQueue.add(async () => {
        const priceContext = currentPrices.slice(0, 50).map(p => `- ${p.name}: ${p.price}€/${p.unit}`).join('\n');
        
        // Parts construction
        const parts: any[] = [];
        
        // Add Images first (best practice)
        if (images.length > 0) {
             try {
                 const rawImg = images[0];
                 const optimizedImg = await optimizeImage(rawImg);
                 if (!optimizedImg.startsWith('http')) {
                    parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedImg } });
                 }
             } catch (e) { console.warn("Image processing failed, skipping image"); }
        }

        const prompt = `Eres un INGENIERO ELÉCTRICO experto en REBT.
        Tarea: Generar partidas presupuestarias para: "${description}".
        
        Usa estos precios si aplican:
        ${priceContext}
        
        Devuelve SOLO un JSON Array. Ejemplo: [{"name":"Cable","quantity":10,"unit":"m","pricePerUnit":1.5,"category":"Material"}]`;
        
        parts.push({ text: prompt });

        // STRATEGY 1: Strict Schema (Best Quality)
        try {
            const response = await callGenAI(
                MODEL_FLASH,
                { parts },
                { 
                    temperature: 0.2, 
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                name: { type: Type.STRING },
                                quantity: { type: Type.NUMBER },
                                unit: { type: Type.STRING },
                                pricePerUnit: { type: Type.NUMBER },
                                category: { type: Type.STRING }
                            },
                            required: ["name", "quantity", "unit", "pricePerUnit", "category"]
                        }
                    }
                }
            );
            
            if (response.text) return JSON.parse(response.text);
        } catch (error) {
            console.warn("Schema strategy failed, trying text fallback...", error);
        }

        // STRATEGY 2: Text Fallback (Aggressive cleaning)
        try {
            const response = await callGenAI(
                MODEL_FLASH,
                { parts },
                { temperature: 0.3 } // No schema, just text
            );
            const items = cleanAndParseJSON(response.text || "[]");
            if (Array.isArray(items) && items.length > 0) return items;
        } catch (error) {
            console.error("Text fallback failed", error);
        }

        // FALLBACK MANUAL (Last Resort)
        return [{
            name: "Partida generada manualmente (IA no disponible)",
            quantity: 1,
            unit: "ud",
            pricePerUnit: 0,
            category: "Otros"
        }];
    });
};

export const analyzeDocument = async (base64Data: string, mimeType: string) => {
     return apiQueue.add(async () => {
        try {
            const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
            const optimizedBase64 = mimeType.startsWith('image') ? await optimizeImage(base64Data) : cleanBase64;
            
            const prompt = `Analiza este documento (factura/albarán). Extrae fecha, total, IVA, proveedor y lista de materiales en JSON.`;

            // Try with schema first
            const response = await callGenAI(
                MODEL_FLASH,
                {
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: mimeType.startsWith('image') ? 'image/jpeg' : mimeType, data: optimizedBase64 } }
                    ]
                },
                { 
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            comercio: { type: Type.STRING },
                            total: { type: Type.NUMBER },
                            iva: { type: Type.NUMBER },
                            fecha: { type: Type.STRING },
                            categoria: { type: Type.STRING },
                            items: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING },
                                        quantity: { type: Type.NUMBER },
                                        price: { type: Type.NUMBER },
                                        unit: { type: Type.STRING }
                                    }
                                }
                            }
                        }
                    }
                }
            );
            
            return JSON.parse(response.text || "{}");
        } catch (e: any) {
            return { errorType: 'GENERIC', description: e.message };
        }
     });
};

export const parseMaterialsFromInput = async (text: string): Promise<PriceItem[]> => {
     return apiQueue.add(async () => {
         try {
             const response = await callGenAI(
                 MODEL_FLASH,
                 `Extrae lista de materiales de: "${text}". JSON Array format.`,
                 { responseMimeType: "application/json" }
             );
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
            const response = await callGenAI(
                MODEL_FLASH,
                {
                    parts: [
                        { text: "Extrae materiales de la imagen a JSON Array (nombre, precio, unidad)." },
                        { inlineData: { mimeType: 'image/jpeg', data: optimized } }
                    ]
                },
                { responseMimeType: "application/json" }
            );
            const res = cleanAndParseJSON(response.text || "[]");
            return Array.isArray(res) ? res.map((i: any) => ({...i, id: Date.now().toString() + Math.random()})) : [];
        } catch (e) {
            return [];
        }
    });
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
    return apiQueue.add(async () => {
         try {
             const prompt = `Analiza proyecto: ${project.name}. Presupuesto: ${project.budget}. Estado: ${project.status}. Resumen ejecutivo breve.`;
             const response = await callGenAI(MODEL_FLASH, prompt, { maxOutputTokens: 500 });
             return response.text || "No se pudo generar análisis.";
         } catch (e) {
             return "Servicio no disponible.";
         }
    });
};

export const chatWithAssistant = async (message: string, context: string): Promise<string> => {
    return apiQueue.add(async () => {
        try {
            const response = await callGenAI(MODEL_FLASH, `${context}\n\nUsuario: ${message}`);
            return response.text || "Sin respuesta.";
        } catch (e) {
            return "Error de conexión con el asistente.";
        }
    });
};
