import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Project, PriceItem } from "../types";

// --- CONFIGURACIÓN DE API ---
const apiKey = process.env.API_KEY || 'AIzaSyAPt-4D6bA9qLK-BrijbJBcmnBU1ojXOA8'; 
const genAI = new GoogleGenAI({ apiKey });

// --- ESTRATEGIA DE MODELOS (FALLBACK) ---
// Actualización: Usamos Gemini 3.0 Flash como motor principal por su mayor inteligencia.
// Gemini 2.5 Flash queda como respaldo robusto.
const MODEL_PRIMARY = 'gemini-3-flash-preview';
const MODEL_FALLBACK = 'gemini-2.5-flash'; 

// --- SISTEMA DE CACHÉ ---
const responseCache = new Map<string, { timestamp: number, data: any }>();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutos de validez

// --- SISTEMA DE COLA INTELIGENTE (Circuit Breaker) ---
class RequestQueue {
    private queue: (() => Promise<void>)[] = [];
    private processing = false;
    private pausedUntil = 0; // Timestamp hasta cuando detener la cola

    async add<T>(operation: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await operation();
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            });
            this.process();
        });
    }

    public pause(ms: number) {
        const resumeTime = Date.now() + ms;
        console.warn(`[Oniluz AI] 🛑 Cola pausada por ${Math.ceil(ms/1000)}s debido a límites de API.`);
        // Solo extendemos la pausa si el nuevo tiempo es mayor al actual
        if (resumeTime > this.pausedUntil) {
            this.pausedUntil = resumeTime;
        }
    }

    private async process() {
        if (this.processing) return;
        this.processing = true;
        
        while (this.queue.length > 0) {
            // 1. Verificar Circuit Breaker
            const timeLeft = this.pausedUntil - Date.now();
            if (timeLeft > 0) {
                // Esperar el tiempo restante antes de procesar el siguiente
                await new Promise(r => setTimeout(r, timeLeft + 100));
                this.pausedUntil = 0; // Resetear tras espera
            }

            const op = this.queue.shift();
            if (op) {
                await op();
                // Ritmo base para no saturar (1.5s entre llamadas exitosas)
                await new Promise(r => setTimeout(r, 1500)); 
            }
        }
        
        this.processing = false;
    }
}

const apiQueue = new RequestQueue();

// --- UTILIDADES ---

const cleanAndParseJSON = (text: string): any => {
    try {
        if (!text) return null;
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstOpenBrace = cleanText.indexOf('{');
        const firstOpenBracket = cleanText.indexOf('[');
        let start = -1;
        let end = -1;
        if (firstOpenBrace !== -1 && (firstOpenBracket === -1 || firstOpenBrace < firstOpenBracket)) {
            start = firstOpenBrace;
            end = cleanText.lastIndexOf('}');
        } else if (firstOpenBracket !== -1) {
            start = firstOpenBracket;
            end = cleanText.lastIndexOf(']');
        }
        if (start !== -1 && end !== -1) {
            cleanText = cleanText.substring(start, end + 1);
        }
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("Error parseando JSON de Gemini. Texto recibido:", text);
        return null;
    }
};

const sanitizeNumber = (value: any): number => {
    if (typeof value === 'number' && !isNaN(value)) return value;
    if (!value) return 0;
    const cleanStr = String(value).replace(',', '.').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleanStr);
    return isNaN(parsed) ? 0 : parsed;
};

const optimizeImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        if (!base64Str.startsWith('data:image')) {
             return resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
        }
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const MAX_SIZE = 1024; 
            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.6);
            resolve(optimizedBase64.split(',')[1]); 
        };
        img.onerror = () => resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
    });
};

// --- GESTOR DE REINTENTOS ROBUSTO ---
// Ejecuta la operación pasando el modelo a usar. Gestiona Fallback y 429.
const robustGenerate = async <T>(
    operationBuilder: (model: string) => Promise<T>, 
    allowFallback: boolean = true
): Promise<T> => {
    let currentModel = MODEL_PRIMARY;
    let attempt = 0;
    const maxRetries = 3;

    while (attempt < maxRetries) {
        try {
            return await operationBuilder(currentModel);
        } catch (error: any) {
            attempt++;
            const errStr = error.toString();
            
            // Detección precisa de error de cuota (429)
            const isQuotaError = errStr.includes('429') || error.status === 429 || error.code === 429 || errStr.includes('RESOURCE_EXHAUSTED');

            if (!isQuotaError) {
                if (attempt >= maxRetries) throw error;
                // Error genérico, espera exponencial breve
                await new Promise(r => setTimeout(r, 1000 * attempt));
                continue;
            }

            console.warn(`[Oniluz AI] ⚠️ Cuota excedida en ${currentModel}.`);

            // 1. ESTRATEGIA FALLBACK: Cambiar de modelo si es posible
            if (allowFallback && currentModel === MODEL_PRIMARY) {
                console.log(`[Oniluz AI] 🔄 Cambiando a modelo de respaldo: ${MODEL_FALLBACK}`);
                currentModel = MODEL_FALLBACK;
                // Reiniciamos intentos para el nuevo modelo
                attempt = 0; 
                continue;
            }

            // 2. ESTRATEGIA DE ESPERA INTELIGENTE
            // Si ya estamos en fallback o no se permite cambio, analizamos el tiempo de espera real
            let waitMs = 5000; // Default 5s
            
            // Extraer "retry in X s" del mensaje de error
            const match = errStr.match(/retry in ([\d\.]+)s/);
            if (match && match[1]) {
                const seconds = parseFloat(match[1]);
                waitMs = Math.ceil(seconds * 1000) + 1500; // Buffer de 1.5s
                console.log(`[Oniluz AI] ⏳ Google solicita espera de: ${seconds}s`);
            }

            // Si la espera es muy larga (> 10s), pausamos toda la cola para no quemar intentos
            if (waitMs > 10000) {
                apiQueue.pause(waitMs);
            }

            // Si es el último intento, lanzamos error, si no, esperamos
            if (attempt >= maxRetries) throw error;
            
            await new Promise(r => setTimeout(r, waitMs));
        }
    }
    throw new Error("Servicio IA no disponible tras reintentos.");
};

// --- FUNCIONES PÚBLICAS ---

export const analyzeDocument = async (base64String: string, mimeType: string = 'image/jpeg'): Promise<any> => {
  const fallbackData = { comercio: "", fecha: new Date().toISOString().split('T')[0], total: 0, iva: 0, categoria: "Material", isStockable: false, description: "Introducir datos manualmente", items: [] };
  
  return apiQueue.add(async () => {
      try {
        let cleanBase64;
        if (mimeType.startsWith('image/')) {
            cleanBase64 = await optimizeImage(base64String);
        } else {
            cleanBase64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
        }

        const prompt = `Actúa como el CONTABLE experto. Analiza documento.
        OBJETIVO: Extraer datos y DECIDIR SI LOS ITEMS VAN AL ALMACÉN (Stock).
        CRITERIOS 'isStockable': TRUE para materiales físicos (cables, mecanismos). FALSE para servicios, comida, gasolina, herramientas.
        CATEGORIAS: Material, Dietas, Transporte, Combustible, Herramienta, Varios.
        Extrae items línea por línea.`;
        
        const documentSchema = {
            type: Type.OBJECT,
            properties: {
                comercio: { type: Type.STRING },
                fecha: { type: Type.STRING },
                total: { type: Type.NUMBER },
                iva: { type: Type.NUMBER },
                categoria: { type: Type.STRING, enum: ['Material', 'Dietas', 'Transporte', 'Combustible', 'Herramienta', 'Varios'] },
                isStockable: { type: Type.BOOLEAN },
                items: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            quantity: { type: Type.NUMBER },
                            unit: { type: Type.STRING },
                            price: { type: Type.NUMBER }
                        }
                    }
                }
            },
            required: ["comercio", "total", "items", "categoria", "isStockable"]
        };

        const response = await robustGenerate(async (model) => {
            return genAI.models.generateContent({
                model: model,
                contents: { 
                    parts: [
                        { inlineData: { mimeType: mimeType, data: cleanBase64 } }, 
                        { text: prompt }
                    ] 
                },
                config: { temperature: 0.0, responseMimeType: 'application/json', responseSchema: documentSchema }
            });
        }, true); // Allow fallback

        let result;
        try { result = JSON.parse(response.text || "{}"); } catch { result = cleanAndParseJSON(response.text || "{}"); }
        
        if (result) return { ...fallbackData, ...result, total: sanitizeNumber(result.total), iva: sanitizeNumber(result.iva) };
        throw new Error("JSON inválido");
      } catch (error: any) {
        console.error("Gemini API Error:", error);
        const isQuotaError = error.toString().includes('429') || (error.status === 429);
        return { ...fallbackData, errorType: isQuotaError ? 'QUOTA' : 'GENERIC', description: isQuotaError ? "Límite de cuota alcanzado." : "Error al procesar" };
      }
  });
};

export const chatWithAssistant = async (message: string, context?: string): Promise<string> => {
  return apiQueue.add(async () => {
      try {
        const response = await robustGenerate(async (model) => {
            return genAI.models.generateContent({
                model: model,
                contents: message,
                config: { systemInstruction: context || 'Eres un asistente útil.' }
            });
        }, true); // Allow fallback for chat
        return response.text || "Sin respuesta.";
      } catch (error: any) {
        if (error.toString().includes('429')) return "⚠️ El asistente está durmiendo (429). Inténtalo en 1 minuto.";
        return "El asistente no está disponible.";
      }
  });
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
  const cacheKey = `status-${project.id}-${project.status}-${project.budget.toFixed(2)}`;
  const cached = responseCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) return cached.data;

  return apiQueue.add(async () => {
      try {
        const prompt = `Analiza: ${project.name}, Estado: ${project.status}, Presupuesto: ${project.budget}, Progreso: ${project.progress}%. Dame 3 consejos breves.`;
        const response = await robustGenerate(async (model) => {
            return genAI.models.generateContent({
                model: model,
                contents: prompt,
                config: { systemInstruction: "Consultor senior." }
            });
        }, true);
        
        const text = response.text || "";
        responseCache.set(cacheKey, { timestamp: Date.now(), data: text });
        return text;
      } catch (error: any) { return "Análisis no disponible por el momento."; }
  });
};

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    return apiQueue.add(async () => {
        const priceContext = currentPrices.slice(0, 150).map(p => `- ${p.name}: ${p.price}€/${p.unit}`).join('\n');
        
        const systemInstruction = `Eres un INGENIERO DE PRESUPUESTOS. Genera partidas JSON.
        REGLA: Usa PRECIOS_REFERENCIA si coinciden. Si no, estima precio mercado España.
        Devuelve array JSON.`;
        
        const budgetSchema = {
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
        };

        const parts: any[] = [
            { text: `PRECIOS_REFERENCIA:\n${priceContext}` },
            { text: `SOLICITUD:\n${description}` }
        ];
        
        if (images.length > 0) {
            const optimizedImg = await optimizeImage(images[0]);
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedImg } });
        }

        const response = await robustGenerate(async (model) => {
            return genAI.models.generateContent({
                model: model,
                contents: { parts },
                config: { 
                    temperature: 0.3, 
                    systemInstruction, 
                    responseMimeType: 'application/json', 
                    responseSchema: budgetSchema
                }
            });
        }, true);

        let result;
        try {
            result = JSON.parse(response.text || "[]");
        } catch (e) {
            result = cleanAndParseJSON(response.text || "[]");
        }
        
        const rawItems = Array.isArray(result) ? result : [];
        return rawItems.map((item: any) => ({
            ...item,
            quantity: sanitizeNumber(item.quantity),
            pricePerUnit: sanitizeNumber(item.pricePerUnit)
        }));
    });
};

export const parseMaterialsFromInput = async (textInput: string): Promise<PriceItem[]> => {
    return apiQueue.add(async () => {
        try {
            const prompt = `Analiza texto tarifa: "${textInput}". Extrae JSON array. 'price' es PVP lista. 'discount' es % (numérico).`;
            const materialsSchema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        unit: { type: Type.STRING },
                        price: { type: Type.NUMBER },
                        category: { type: Type.STRING },
                        discount: { type: Type.NUMBER }
                    },
                    required: ["name", "unit", "price", "category"]
                }
            };

            const response = await robustGenerate(async (model) => {
                return genAI.models.generateContent({ 
                    model: model, 
                    contents: prompt,
                    config: { responseMimeType: 'application/json', responseSchema: materialsSchema }
                });
            }, true);

            const result = JSON.parse(response.text || "[]");
            return (Array.isArray(result) ? result : []).map((item: any) => ({
                ...item,
                price: sanitizeNumber(item.price),
                discount: sanitizeNumber(item.discount)
            }));
        } catch (e) {
            console.error("Error parsing materials:", e);
            return [];
        }
    });
};

export const parseMaterialsFromImage = async (base64Image: string): Promise<PriceItem[]> => {
    return apiQueue.add(async () => {
        try {
            const cleanData = await optimizeImage(base64Image);
            const prompt = `Analiza imagen tarifa. Extrae JSON. price=PVP. discount=%.`;
            const materialsSchema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        unit: { type: Type.STRING },
                        price: { type: Type.NUMBER },
                        category: { type: Type.STRING },
                        discount: { type: Type.NUMBER }
                    },
                    required: ["name", "unit", "price", "category"]
                }
            };

            const response = await robustGenerate(async (model) => {
                return genAI.models.generateContent({
                    model: model,
                    contents: {
                        parts: [
                            { inlineData: { mimeType: 'image/jpeg', data: cleanData } },
                            { text: prompt }
                        ]
                    },
                    config: { responseMimeType: 'application/json', responseSchema: materialsSchema }
                });
            }, true);

            const result = JSON.parse(response.text || "[]");
            return (Array.isArray(result) ? result : []).map((item: any) => ({
                ...item,
                price: sanitizeNumber(item.price),
                discount: sanitizeNumber(item.discount)
            }));
        } catch (e) { return []; }
    });
};

export const calculateDrivingDistance = async (destination: string): Promise<number> => {
    return apiQueue.add(async () => {
        const origin = "Calle Don Eduardo Martín 27, 45560 Oropesa, Toledo";
        const prompt = `Calcula distancia conducción (km) entre '${origin}' y '${destination}'. Usa Google Search. Respuesta: solo distancia (ej: "145 km").`;

        try {
            // Nota: Tanto Gemini 3.0 como 2.5 Flash soportan herramientas.
            // Habilitamos el fallback dinámico (true) para que si el modelo principal (3.0) 
            // falla por cuota, se intente con el respaldo (2.5) automáticamente.
            const response = await robustGenerate(async (model) => {
                return genAI.models.generateContent({
                    model: model, 
                    contents: prompt,
                    config: { 
                        temperature: 0, 
                        tools: [{ googleSearch: {} }] 
                    }
                });
            }, true); // TRUE: Usar fallback si el principal falla

            let fullText = response.text || "";
            if (!fullText && response.candidates?.[0]?.content?.parts) {
                fullText = response.candidates[0].content.parts.map(p => p.text).filter(t => t).join(" ");
            }
            
            console.log(`[Oniluz AI] Distancia Raw: "${fullText}"`);
            const regex = /([\d]+[.,\d]*)\s*(?:km|kilómetros)/i;
            const match = fullText.match(regex);
            
            if (match && match[1]) {
                let numStr = match[1];
                if (numStr.includes('.') && numStr.includes(',')) numStr = numStr.replace(/\./g, '').replace(',', '.');
                else if (numStr.includes(',')) numStr = numStr.replace(',', '.');
                const distance = parseFloat(numStr);
                return !isNaN(distance) ? Math.round(distance) : 0;
            }
            return 0;
        } catch (error) {
            console.error("[Oniluz AI] Error calculating distance:", error);
            return 0;
        }
    });
};