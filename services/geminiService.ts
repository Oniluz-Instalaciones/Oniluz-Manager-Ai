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
  // Fallback key provided by user
  return 'AIzaSyAPt-4D6bA9qLK-BrijbJBcmnBU1ojXOA8';
};

const apiKey = getClientApiKey();
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// List of models to try in order. If one fails (404/500), we try the next.
const MODELS_TO_TRY = ['gemini-3-flash-preview', 'gemini-2.0-flash-exp'];

// --- Helpers ---

// Robust JSON Cleaner: Extracts JSON array/object from markdown or messy text
const cleanAndParseJSON = (text: string): any => {
    if (!text) return null;
    try {
        // 1. Try direct parse
        return JSON.parse(text);
    } catch (e) {
        // 2. Remove Markdown code blocks (json, text, etc)
        let cleaned = text.replace(/```[a-z]*\n/g, "").replace(/```/g, "").trim();
        try {
            return JSON.parse(cleaned);
        } catch (e2) {
            // 3. Find array brackets [] or object braces {}
            const firstBracket = cleaned.indexOf('[');
            const lastBracket = cleaned.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1) {
                try { return JSON.parse(cleaned.substring(firstBracket, lastBracket + 1)); } catch (e3) {}
            }
            
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                try { return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)); } catch (e4) {}
            }
            
            console.error("Failed to parse AI response text:", text);
            return null;
        }
    }
};

const optimizeImage = async (base64Str: string, maxWidth = 512): Promise<string> => {
    return new Promise((resolve) => {
        if (typeof Image === 'undefined' || !base64Str || base64Str.startsWith('http')) {
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
            
            // Resize logic
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

// Queue system
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

// --- Main AI Function with Fallback Strategy ---

const callGenAIWithFallback = async (contents: any, config: any = {}, customSystemInstruction?: string) => {
    if (!ai) throw new Error("API Key Missing");
    
    let lastError;

    for (const modelName of MODELS_TO_TRY) {
        try {
            const finalConfig = { ...config };
            if (customSystemInstruction) {
                finalConfig.systemInstruction = customSystemInstruction;
            }

            const response = await ai.models.generateContent({
                model: modelName,
                contents,
                config: finalConfig
            });
            
            if (response.text) {
                return { text: response.text };
            }
        } catch (error: any) {
            console.warn(`Model ${modelName} failed:`, error.message);
            lastError = error;
            // If it's a quota error (429), waiting might help, but here we just try next model or fail
            // If 404 (model not found), definitely try next.
        }
    }
    
    throw lastError || new Error("All models failed");
};

// --- Exports ---

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    return apiQueue.add(async () => {
        const priceContext = currentPrices.slice(0, 60).map(p => `- ${p.name}: ${p.price}€/${p.unit} (${p.category})`).join('\n');
        
        const parts: any[] = [];
        
        if (images.length > 0) {
             try {
                 const rawImg = images[0];
                 const optimizedImg = await optimizeImage(rawImg);
                 if (!optimizedImg.startsWith('http')) {
                    parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedImg } });
                 }
             } catch (e) { console.warn("Image processing failed"); }
        }

        const prompt = `TAREA: Generar un presupuesto de obra eléctrica detallado para: "${description}".
        
        PRECIOS REFERENCIA (Usar si coinciden):
        ${priceContext}
        
        INSTRUCCIONES:
        1. Desglosa en partidas (Material, Mano de Obra, etc).
        2. Si no hay precio referencia, estima valor de mercado en España.
        3. Sé técnico y preciso.`;

        parts.push({ text: prompt });

        // STRATEGY: Wrapped Object Schema (More stable than root Array)
        try {
            const response = await callGenAIWithFallback(
                { parts },
                { 
                    temperature: 0.1, 
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            items: {
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
                    }
                }
            );
            
            if (response.text) {
                const parsed = JSON.parse(response.text);
                if (parsed.items && Array.isArray(parsed.items)) return parsed.items;
                // If model returns direct array despite schema
                if (Array.isArray(parsed)) return parsed; 
            }
        } catch (error) {
            console.warn("Schema strategy failed, trying text fallback...", error);
        }

        // FALLBACK: Pure Text Prompt
        try {
            const textResponse = await callGenAIWithFallback(
                { parts: [...parts, { text: "\n\nIMPORTANTE: Devuelve SOLAMENTE un JSON Array válido. Ejemplo: [{\"name\":\"Cable\",\"quantity\":10,\"unit\":\"m\",\"pricePerUnit\":1.5,\"category\":\"Material\"}]" }] },
                { temperature: 0.3 }
            );
            
            const items = cleanAndParseJSON(textResponse.text || "[]");
            // If parsed is object with items key
            if (items && items.items && Array.isArray(items.items)) return items.items;
            if (Array.isArray(items) && items.length > 0) return items;
        } catch (error) {
            console.error("Text fallback failed", error);
        }

        // EMERGENCY FALLBACK
        return [{
            name: "Partida Manual (Error de IA - Inténtelo de nuevo)",
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
            
            const prompt = `Analiza documento (factura/albarán). Extrae datos a JSON.`;

            const response = await callGenAIWithFallback(
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
             const response = await callGenAIWithFallback(
                 { parts: [{ text: `Extrae materiales de: "${text}". Formato JSON: { "items": [...] }` }] },
                 { responseMimeType: "application/json" }
             );
             const res = cleanAndParseJSON(response.text || "{}");
             const items = res.items || res || [];
             return Array.isArray(items) ? items.map((i: any) => ({...i, id: Date.now().toString() + Math.random()})) : [];
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
            const response = await callGenAIWithFallback(
                {
                    parts: [
                        { text: "Extrae materiales de la imagen a JSON Object { items: [] }" },
                        { inlineData: { mimeType: 'image/jpeg', data: optimized } }
                    ]
                },
                { responseMimeType: "application/json" }
            );
            const res = cleanAndParseJSON(response.text || "{}");
            const items = res.items || res || [];
            return Array.isArray(items) ? items.map((i: any) => ({...i, id: Date.now().toString() + Math.random()})) : [];
        } catch (e) {
            return [];
        }
    });
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
    return apiQueue.add(async () => {
         try {
             const prompt = `Analiza proyecto: ${project.name}. Presupuesto: ${project.budget}. Estado: ${project.status}. Breve resumen ejecutivo.`;
             const response = await callGenAIWithFallback({ parts: [{ text: prompt }] }, { maxOutputTokens: 500 });
             return response.text || "No se pudo generar análisis.";
         } catch (e) {
             return "Servicio no disponible.";
         }
    });
};

export const chatWithAssistant = async (message: string, context: string): Promise<string> => {
    return apiQueue.add(async () => {
        try {
            const response = await callGenAIWithFallback(
                { parts: [{ text: `${context}\n\nUsuario: ${message}` }] }
            );
            return response.text || "Sin respuesta.";
        } catch (e) {
            return "Error de conexión con el asistente.";
        }
    });
};
