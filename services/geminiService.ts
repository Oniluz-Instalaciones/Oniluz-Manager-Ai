import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Project, PriceItem } from "../types";

// --- CONFIGURACIÓN DE API ---
// Se utiliza la librería moderna @google/genai.
const apiKey = process.env.API_KEY || 'AIzaSyAPt-4D6bA9qLK-BrijbJBcmnBU1ojXOA8'; // Fallback for dev if env missing
const genAI = new GoogleGenAI({ apiKey });

// MODELO: Actualizado a Gemini 2.5 Flash.
const MODEL_NAME = 'gemini-2.5-flash';

// --- SISTEMA DE CACHÉ ---
const responseCache = new Map<string, { timestamp: number, data: any }>();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutos de validez

// --- SISTEMA DE COLA (Request Queue) ---
class RequestQueue {
    private queue: (() => Promise<void>)[] = [];
    private processing = false;

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

    private async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;
        
        while (this.queue.length > 0) {
            const op = this.queue.shift();
            if (op) {
                await op();
                await new Promise(r => setTimeout(r, 1000)); 
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

// Helper function to safely convert any potential number string to a valid float
const sanitizeNumber = (value: any): number => {
    if (typeof value === 'number' && !isNaN(value)) return value;
    if (!value) return 0;
    
    // Convert to string, replace commas with dots (European format), remove currency symbols and non-numeric chars except dot/minus
    const cleanStr = String(value)
        .replace(',', '.')
        .replace(/[^0-9.-]/g, '');
        
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
            console.log(`[Oniluz AI] Imagen optimizada para cuota: ${Math.round(width)}x${Math.round(height)}px`);
            resolve(optimizedBase64.split(',')[1]); 
        };
        img.onerror = () => {
            console.warn("[Oniluz AI] No se pudo optimizar la imagen, enviando original.");
            resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
        };
    });
};

const retryOperation = async <T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        const errorStr = error.toString();
        const isTransient = errorStr.includes('429') || errorStr.includes('503') || (error.status === 429) || (error.status === 503);
        if (retries > 0 && isTransient) {
            await new Promise(r => setTimeout(r, delay));
            return retryOperation(operation, retries - 1, delay * 2);
        }
        throw error;
    }
};

// --- FUNCIONES PÚBLICAS ---

export const analyzeDocument = async (base64String: string, mimeType: string = 'image/jpeg'): Promise<any> => {
  const fallbackData = { comercio: "", fecha: new Date().toISOString().split('T')[0], total: 0, iva: 0, categoria: "Material", isStockable: false, description: "Introducir datos manualmente", items: [] };
  return apiQueue.add(async () => {
      try {
        let cleanBase64;
        // Solo optimizamos si es imagen, si es PDF pasamos el base64 limpio directamente
        if (mimeType.startsWith('image/')) {
            cleanBase64 = await optimizeImage(base64String);
        } else {
            cleanBase64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
        }

        const prompt = `Actúa como el CONTABLE experto de una empresa de instalaciones eléctricas. Analiza esta imagen.
        
        OBJETIVO: Extraer datos y DECIDIR SI LOS ITEMS VAN AL ALMACÉN (Stock).

        CRITERIOS ROBUSTOS PARA 'isStockable' (Inventariable):
        - TRUE (SÍ STOCK): Solo materiales físicos que se instalan y se quedan en la obra. Ejemplos: Cables, tuberías, cajas, enchufes, interruptores, diferenciales, tornillos, tacos, paneles solares, inversores.
        - FALSE (NO STOCK): 
            1. Servicios (Mano de obra, transporte, parking).
            2. Consumibles personales (Comida, café, agua, dietas).
            3. Combustible (Gasolina, Diesel).
            4. Herramientas (Taladros, destornilladores, escaleras) -> Son activos fijos, NO stock consumible de obra.
            5. Ropa de trabajo o EPIs.

        CRITERIOS PARA 'categoria':
        1. 'Dietas': Restaurantes, supermercados, comida.
        2. 'Transporte': Tren, taxi, parking, peaje.
        3. 'Combustible': Gasolineras.
        4. 'Material': Material eléctrico, ferretería, construcción (Si isStockable es true, suele ser Material).
        5. 'Herramienta': Maquinaria y herramienta de mano.
        6. 'Varios': Resto.

        Extrae 'items' línea por línea.`;
        
        const documentSchema = {
            type: Type.OBJECT,
            properties: {
                comercio: { type: Type.STRING },
                fecha: { type: Type.STRING },
                total: { type: Type.NUMBER },
                iva: { type: Type.NUMBER },
                categoria: { 
                    type: Type.STRING, 
                    enum: ['Material', 'Dietas', 'Transporte', 'Combustible', 'Herramienta', 'Varios'],
                    description: "Categoría contable del gasto" 
                },
                isStockable: {
                    type: Type.BOOLEAN,
                    description: "TRUE si son materiales instalables (cables, mecanismos). FALSE si es comida, gasolina, servicios o herramientas."
                },
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

        const operation = () => genAI.models.generateContent({
          model: MODEL_NAME,
          contents: { 
              parts: [
                  { 
                      inlineData: { 
                          mimeType: mimeType, 
                          data: cleanBase64 
                      } 
                  }, 
                  { text: prompt }
              ] 
          },
          config: { temperature: 0.0, responseMimeType: 'application/json', responseSchema: documentSchema }
        });

        const response = await retryOperation(operation) as GenerateContentResponse;
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
        const operation = () => genAI.models.generateContent({
            model: MODEL_NAME,
            contents: message,
            config: { systemInstruction: context || 'Eres un asistente útil.' }
        });
        const response = await retryOperation(operation) as GenerateContentResponse;
        return response.text || "Sin respuesta.";
      } catch (error: any) {
        if (error.toString().includes('429')) return "⚠️ El asistente está ocupado (429).";
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
        const prompt = `Analiza: ${project.name}, Estado: ${project.status}, Presupuesto: ${project.budget}, Progreso: ${project.progress}%. Dame 3 consejos.`;
        const operation = () => genAI.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { systemInstruction: "Consultor senior de obras." }
        });
        const response = await retryOperation(operation) as GenerateContentResponse;
        const text = response.text || "";
        responseCache.set(cacheKey, { timestamp: Date.now(), data: text });
        return text;
      } catch (error: any) { return "Análisis no disponible."; }
  });
};

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    return apiQueue.add(async () => {
        // Prepare context properly
        const priceContext = currentPrices.slice(0, 150).map(p => `- ${p.name}: ${p.price}€/${p.unit}`).join('\n');
        
        const systemInstruction = `Eres un INGENIERO DE PRESUPUESTOS Y EXPERTO EN MERCADO ELÉCTRICO. 
        Tu objetivo es generar partidas presupuestarias precisas.
        
        REGLA DE ORO DE PRECIOS:
        1. PRIMERO: Busca en la lista 'PRECIOS_REFERENCIA' que te proporcionaré. Si el material existe o es muy similar, DEBES USAR ESE PRECIO EXACTO y UNIDAD.
        2. SEGUNDO: Si el material NO está en la lista de referencia, estima un PRECIO DE MERCADO MEDIO REALISTA en España. NO pongas precios a 0€ ni inventes precios absurdos.
        3. Clasifica correctamente: Material, Mano de Obra, Maquinaria.
        4. IMPORTANTE: Devuelve números puros para precios y cantidades (ej: 10.50), NO uses comas ni símbolos de moneda en el JSON.
        
        Genera un array JSON con las partidas necesarias para cumplir con la descripción solicitada.`;
        
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
            { text: `PRECIOS_REFERENCIA (Úsalos si hay coincidencia):\n${priceContext}` },
            { text: `SOLICITUD DE PRESUPUESTO:\n${description}` }
        ];
        
        if (images.length > 0) {
            // Include only the first image to save tokens/bandwidth if multiple
            const optimizedImg = await optimizeImage(images[0]);
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedImg } });
        }

        const operation = () => genAI.models.generateContent({
            model: MODEL_NAME,
            contents: { parts },
            config: { 
                temperature: 0.3, 
                systemInstruction, 
                responseMimeType: 'application/json', 
                responseSchema: budgetSchema
            }
        });

        const response = await retryOperation(operation) as GenerateContentResponse;
        let result;
        try {
            result = JSON.parse(response.text || "[]");
        } catch (e) {
            console.warn("JSON parse failed, attempting cleanup", e);
            result = cleanAndParseJSON(response.text || "[]");
        }
        
        const rawItems = Array.isArray(result) ? result : [];
        
        // Critical Step: Sanitize and validate numbers to prevent NaN
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
            // Prompt mejorado para forzar la extracción de descuentos explícitos
            const prompt = `Analiza el siguiente texto de una tarifa de precios: "${textInput}".
            
            REGLAS CRÍTICAS DE EXTRACCIÓN:
            1. 'price': Debe ser el PRECIO DE LISTA (P.V.P) o Precio Base, SIN APLICAR EL DESCUENTO.
            2. 'discount': Si aparece un porcentaje (ej: -20%, Dto 15%, Bonif 30%), extrae SOLO el número (ej: 20, 15, 30).
            3. Si el precio ya parece neto, pon descuento 0.
            
            Devuelve un Array JSON.`;
            
            const materialsSchema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        unit: { type: Type.STRING },
                        price: { type: Type.NUMBER, description: "Precio de lista (PVP) antes de descuentos" },
                        category: { type: Type.STRING },
                        discount: { type: Type.NUMBER, description: "Porcentaje de descuento (0-100)" }
                    },
                    required: ["name", "unit", "price", "category"]
                }
            };

            const operation = () => genAI.models.generateContent({ 
                model: MODEL_NAME, 
                contents: prompt,
                config: { responseMimeType: 'application/json', responseSchema: materialsSchema }
            });

            const response = await retryOperation(operation) as GenerateContentResponse;
            const result = JSON.parse(response.text || "[]");
            const rawItems = Array.isArray(result) ? result : [];
            
            return rawItems.map((item: any) => ({
                ...item,
                price: sanitizeNumber(item.price),
                discount: sanitizeNumber(item.discount)
            }));
        } catch (e) {
            console.error("Error parsing materials text:", e);
            return [];
        }
    });
};

export const parseMaterialsFromImage = async (base64Image: string): Promise<PriceItem[]> => {
    return apiQueue.add(async () => {
        try {
            const cleanData = await optimizeImage(base64Image);
            
            // Prompt específico para visión computarizada de tablas de precios
            const prompt = `Analiza esta imagen de una TARIFA DE PRECIOS O CATÁLOGO.
            
            INSTRUCCIONES PRECISAS:
            1. Identifica cada fila como un material.
            2. Extrae el NOMBRE completo.
            3. Extrae el PRECIO DE TARIFA (PVP) en la columna 'price'. NO extraigas el precio neto si existe columna de PVP.
            4. Busca columnas como "%", "Dto", "Bonif", "Desc". Si existe, extrae ese número en 'discount'.
            5. Si no hay descuento explícito, 'discount' es 0.`;

            const materialsSchema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        unit: { type: Type.STRING },
                        price: { type: Type.NUMBER, description: "Precio de lista (PVP)" },
                        category: { type: Type.STRING },
                        discount: { type: Type.NUMBER, description: "Porcentaje descuento detectado" }
                    },
                    required: ["name", "unit", "price", "category"]
                }
            };

            const operation = () => genAI.models.generateContent({
                model: MODEL_NAME,
                contents: {
                    parts: [
                        { inlineData: { mimeType: 'image/jpeg', data: cleanData } },
                        { text: prompt }
                    ]
                },
                config: { responseMimeType: 'application/json', responseSchema: materialsSchema }
            });

            const response = await retryOperation(operation) as GenerateContentResponse;
            const result = JSON.parse(response.text || "[]");
            const rawItems = Array.isArray(result) ? result : [];
            
            return rawItems.map((item: any) => ({
                ...item,
                price: sanitizeNumber(item.price),
                discount: sanitizeNumber(item.discount)
            }));
        } catch (e) {
            console.error("Error parsing materials image:", e);
            return [];
        }
    });
};

// NEW: Calculate driving distance using Gemini Reasoning
export const calculateDrivingDistance = async (destination: string): Promise<number> => {
    return apiQueue.add(async () => {
        const origin = "Calle Don Eduardo Martín 27, 45560 Oropesa, Toledo";
        const prompt = `Calcula la distancia de conducción en kilómetros desde '${origin}' hasta '${destination}'.
        
        INSTRUCCIONES:
        1. Estima la distancia real por carretera (ruta más rápida).
        2. Responde SOLO con un objeto JSON válido con la propiedad 'distance' (número).
        3. Ejemplo respuesta: { "distance": 120.5 }
        4. Si no puedes encontrar el destino o la ruta, devuelve { "distance": 0 }`;

        const schema = {
            type: Type.OBJECT,
            properties: {
                distance: { type: Type.NUMBER, description: "Distancia en km" }
            },
            required: ["distance"]
        };

        try {
            const operation = () => genAI.models.generateContent({
                model: MODEL_NAME,
                contents: prompt,
                config: { responseMimeType: 'application/json', responseSchema: schema }
            });

            const response = await retryOperation(operation) as GenerateContentResponse;
            const result = JSON.parse(response.text || '{"distance": 0}');
            return result.distance || 0;
        } catch (error) {
            console.error("Error calculating distance:", error);
            return 0;
        }
    });
};