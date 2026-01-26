import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Project, PriceItem } from "../types";

// --- CONFIGURACIÓN DE API ---
// Se utiliza la librería moderna @google/genai.
const apiKey = 'AIzaSyAPt-4D6bA9qLK-BrijbJBcmnBU1ojXOA8';
const genAI = new GoogleGenAI({ apiKey });

// MODELO: Actualizado a Gemini 2.5 Flash.
// Este modelo ofrece una excelente relación velocidad/coste/inteligencia.
const MODEL_NAME = 'gemini-2.5-flash';

// --- SISTEMA DE CACHÉ ---
// Almacena respuestas recientes para no gastar cuota en consultas repetidas.
const responseCache = new Map<string, { timestamp: number, data: any }>();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutos de validez

// --- SISTEMA DE COLA (Request Queue) ---
// Serializa las peticiones para evitar el error 429 (Too Many Requests).
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
                // Pausa reducida a 1000ms para Gemini 2.5 Flash (Más rápido y con mayor límite de cuota)
                await new Promise(r => setTimeout(r, 1000)); 
            }
        }
        
        this.processing = false;
    }
}

const apiQueue = new RequestQueue();

// --- UTILIDADES ---

/**
 * Limpia la respuesta de la IA eliminando bloques de código Markdown (```json ... ```)
 * y busca el primer objeto JSON válido.
 */
const cleanAndParseJSON = (text: string): any => {
    try {
        if (!text) return null;

        // 1. Eliminar etiquetas de bloque de código
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // 2. Encontrar los límites del JSON (por si la IA añade texto introductorio)
        const firstOpenBrace = cleanText.indexOf('{');
        const firstOpenBracket = cleanText.indexOf('[');
        
        let start = -1;
        let end = -1;

        // Determinar si buscamos un Objeto {} o un Array []
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

/**
 * Reduce el tamaño de las imágenes antes de enviarlas para ahorrar tokens y ancho de banda.
 */
const optimizeImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        if (!base64Str.startsWith('data:image')) {
             // Si no tiene cabecera, asumimos que es raw base64 o url, lo devolvemos limpio
             return resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
        }

        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // Limitamos a 1024px para balancear calidad/tokens
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
            
            // Compresión JPEG al 70%
            const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            resolve(optimizedBase64.split(',')[1]); 
        };
        img.onerror = () => {
            resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
        };
    });
};

/**
 * Wrapper para reintentar automáticamente si hay error de cuota (429) o sobrecarga (503).
 */
const retryOperation = async <T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        const errorStr = error.toString();
        const isTransient = errorStr.includes('429') || errorStr.includes('503') || (error.status === 429) || (error.status === 503);
        
        if (retries > 0 && isTransient) {
            console.warn(`Error transitorio (${error.status || 'red'}). Reintentando en ${delay}ms... (Intentos restantes: ${retries})`);
            await new Promise(r => setTimeout(r, delay));
            return retryOperation(operation, retries - 1, delay * 2); // Backoff exponencial
        }
        throw error;
    }
};

// --- FUNCIONES PÚBLICAS ---

export const analyzeDocument = async (base64String: string, mimeType: string = 'image/jpeg'): Promise<any> => {
  const fallbackData = {
    comercio: "",
    fecha: new Date().toISOString().split('T')[0],
    total: 0,
    iva: 0,
    categoria: "Material",
    description: "Introducir datos manualmente",
    items: []
  };

  // Usamos la cola para evitar saturación
  return apiQueue.add(async () => {
      try {
        const cleanBase64 = await optimizeImage(base64String);
        
        const prompt = `Analiza este documento (ticket, factura o albarán). 
        Extrae la información y devuélvela en un JSON estricto.
        Si algún campo no es visible, usa null o 0.`;
        
        // Define Schema for Document Analysis
        const documentSchema = {
            type: Type.OBJECT,
            properties: {
                comercio: { type: Type.STRING, description: "Nombre del proveedor o comercio" },
                fecha: { type: Type.STRING, description: "Fecha en formato YYYY-MM-DD" },
                total: { type: Type.NUMBER, description: "Importe total del documento" },
                iva: { type: Type.NUMBER, description: "Importe total del impuesto/IVA" },
                categoria: { type: Type.STRING, description: "Categoría del gasto (ej: Material, Combustible)" },
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
            required: ["comercio", "total", "items"]
        };

        const operation = () => genAI.models.generateContent({
          model: MODEL_NAME,
          contents: {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } }, 
              { text: prompt }
            ]
          },
          config: { 
              temperature: 0.1, 
              responseMimeType: 'application/json',
              responseSchema: documentSchema
          }
        });

        const response = await retryOperation(operation) as GenerateContentResponse;
        
        // With responseSchema, parsing is safer but we still use safety check
        let result;
        try {
            result = JSON.parse(response.text || "{}");
        } catch {
            result = cleanAndParseJSON(response.text || "{}");
        }
        
        if (result) {
            return {
                ...fallbackData,
                ...result,
                total: Number(result.total) || 0,
                iva: Number(result.iva) || 0
            };
        } else {
           throw new Error("La respuesta no contiene un JSON válido");
        }
      } catch (error: any) {
        console.warn('Gemini API Error:', error);
        const errorStr = error.toString();
        const isQuotaError = errorStr.includes('429') || (error.status === 429);
        return {
            ...fallbackData,
            errorType: isQuotaError ? 'QUOTA' : 'GENERIC',
            description: isQuotaError ? "Límite de cuota alcanzado." : "Error al procesar la imagen"
        };
      }
  });
};

export const chatWithAssistant = async (message: string, context?: string): Promise<string> => {
  return apiQueue.add(async () => {
      try {
        const operation = () => genAI.models.generateContent({
            model: MODEL_NAME,
            contents: message,
            config: {
                // Pasamos el contexto como instrucción de sistema para mejor rendimiento
                systemInstruction: context || 'Eres un asistente útil para gestión de obras eléctricas.'
            }
        });

        const response = await retryOperation(operation) as GenerateContentResponse;
        return response.text || "No se obtuvo respuesta.";
      } catch (error: any) {
        if (error.toString().includes('429') || (error.status === 429)) {
            return "⚠️ El asistente está ocupado (Límite de cuota 429). Por favor, espera unos segundos.";
        }
        return "El asistente no está disponible en este momento.";
      }
  });
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
  // Comprobamos caché antes de llamar a la API
  const cacheKey = `status-${project.id}-${project.status}-${project.budget.toFixed(2)}`;
  const cached = responseCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return cached.data;
  }

  return apiQueue.add(async () => {
      try {
        const prompt = `Analiza el siguiente proyecto y dame 3 consejos breves:
        - Nombre: ${project.name}
        - Estado: ${project.status}
        - Presupuesto: ${project.budget}€
        - Progreso: ${project.progress}%`;
        
        const operation = () => genAI.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: {
                systemInstruction: "Actúa como un consultor senior de obras eléctricas. Sé conciso y estratégico."
            }
        });

        const response = await retryOperation(operation) as GenerateContentResponse;
        const text = response.text || "";
        
        // Guardamos en caché
        responseCache.set(cacheKey, { timestamp: Date.now(), data: text });
        return text;
      } catch (error: any) {
         if (error.toString().includes('429')) return "Análisis pausado por límite de velocidad. Inténtalo de nuevo en 1 minuto.";
         return "Análisis no disponible temporalmente.";
      }
  });
};

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    return apiQueue.add(async () => {
        // No try/catch here to allow errors to propagate to UI for debugging
        
        // Contexto de precios
        const priceContext = currentPrices.slice(0, 100).map(p => `- ${p.name} (Categoría: ${p.category}): ${p.price}€/${p.unit}`).join('\n');
        
        // System instruction robusta para el modelo estable
        const systemInstruction = `Actúa como un INGENIERO ELÉCTRICO y FOTOVOLTAICO EXPERTO.
        Tu tarea es generar un presupuesto técnico y detallado basado en la solicitud del usuario.

        ### REGLAS CRÍTICAS DE GENERACIÓN:
        1. **PRIORIDAD DE BASE DE DATOS**: Usa los precios proporcionados en "BASE DE DATOS PROPIA" siempre que sea posible.
        2. **GENERACIÓN INTELIGENTE**: Si el usuario pide algo específico (ej: "8 paneles solares", "Batería 10kW") y NO está en la base de datos propia, **IGNORA la restricción de la base de datos y GENERA la partida** con un precio de mercado estimado realista en España.
        3. **DETALLE TÉCNICO**: Incluye pequeños materiales (cableado, protecciones DC/AC, estructura) si son necesarios para que la instalación sea funcional según REBT.
        4. **SALIDA**: Devuelve ÚNICAMENTE un Array JSON válido.`;

        const prompt = `Genera presupuesto detallado para: "${description}".
        
        ### BASE DE DATOS PROPIA (Usar como referencia, pero complementar si falta material específico):
        ${priceContext}`;

        const parts: any[] = [{ text: prompt }];
        
        if (images.length > 0) {
                const optimizedImg = await optimizeImage(images[0]);
                parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedImg } });
        }

        // Schema estricto
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

        const operation = () => genAI.models.generateContent({
            model: MODEL_NAME,
            contents: { parts },
            config: {
                temperature: 0.2, 
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: budgetSchema
            }
        });

        console.log(`Generando presupuesto con IA (${MODEL_NAME})...`);
        const response = await retryOperation(operation) as GenerateContentResponse;
        
        // Logging para depuración en navegador
        console.log("Respuesta cruda Gemini:", response.text);

        const result = JSON.parse(response.text || "[]");
        return Array.isArray(result) ? result : [];
    });
};

export const parseMaterialsFromInput = async (textInput: string): Promise<PriceItem[]> => {
    return apiQueue.add(async () => {
        try {
            const prompt = `Extrae una lista de materiales de este texto: "${textInput}".`;
            
            const materialsSchema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        unit: { type: Type.STRING },
                        price: { type: Type.NUMBER },
                        category: { type: Type.STRING }
                    },
                    required: ["name", "unit", "price", "category"]
                }
            };

            const operation = () => genAI.models.generateContent({ 
                model: MODEL_NAME, 
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: materialsSchema
                }
            });

            const response = await retryOperation(operation) as GenerateContentResponse;
            const result = JSON.parse(response.text || "[]");
            return Array.isArray(result) ? result : [];
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
            
            const materialsSchema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        unit: { type: Type.STRING },
                        price: { type: Type.NUMBER },
                        category: { type: Type.STRING }
                    },
                    required: ["name", "unit", "price", "category"]
                }
            };

            const operation = () => genAI.models.generateContent({
                model: MODEL_NAME,
                contents: {
                    parts: [
                        { inlineData: { mimeType: 'image/jpeg', data: cleanData } },
                        { text: "Identifica los materiales, precios y unidades en esta imagen de tarifa o catálogo." }
                    ]
                },
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: materialsSchema
                }
            });

            const response = await retryOperation(operation) as GenerateContentResponse;
            const result = JSON.parse(response.text || "[]");
            return Array.isArray(result) ? result : [];
        } catch (e) {
            console.error("Error parsing materials image:", e);
            return [];
        }
    });
};