import { GoogleGenAI } from "@google/genai";
import { Project, PriceItem } from "../types";

// --- CONFIGURACIÓN DE API ---
// Se utiliza la librería moderna @google/genai.
const apiKey = 'AIzaSyAPt-4D6bA9qLK-BrijbJBcmnBU1ojXOA8';
const genAI = new GoogleGenAI({ apiKey });

// MODELO: Usamos 'gemini-1.5-flash' por ser la opción más robusta y rápida para producción gratuita.
const MODEL_NAME = 'gemini-1.5-flash';

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
                // Pausa de seguridad entre peticiones para respetar rate limits
                await new Promise(r => setTimeout(r, 2000)); 
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
 * Wrapper para reintentar automáticamente si hay error de cuota (429).
 */
const retryOperation = async <T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        const errorStr = error.toString();
        const isQuota = errorStr.includes('429') || (error.status === 429) || errorStr.includes('Resource has been exhausted');
        
        if (retries > 0 && isQuota) {
            console.warn(`Cuota excedida (429). Reintentando en ${delay}ms... (Intentos restantes: ${retries})`);
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
        Si algún campo no es visible, usa null o 0.
        Formato requerido:
        {
          "comercio": "Nombre del proveedor",
          "fecha": "YYYY-MM-DD",
          "total": 0.00,
          "iva": 0.00,
          "categoria": "Material", 
          "items": [{ "name": "Nombre producto", "quantity": 1, "unit": "ud", "price": 0.00 }]
        }`;
        
        // Configuración correcta del SDK @google/genai
        const operation = () => genAI.models.generateContent({
          model: MODEL_NAME,
          contents: {
            parts: [
              // Estructura correcta para envío de imágenes
              { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } }, 
              { text: prompt }
            ]
          },
          config: { 
              temperature: 0.1, // Baja temperatura para datos precisos
          }
        });

        const response = await retryOperation(operation);
        const result = cleanAndParseJSON(response.text || "{}");
        
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
        const prompt = context ? `System Instruction: ${context}\n\nUser Query: ${message}` : message;
        
        const operation = () => genAI.models.generateContent({
            model: MODEL_NAME,
            contents: prompt
        });

        const response = await retryOperation(operation);
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
        const prompt = `Actúa como un consultor de obras eléctricas.
        Analiza el siguiente proyecto:
        - Nombre: ${project.name}
        - Estado: ${project.status}
        - Presupuesto: ${project.budget}€
        - Progreso: ${project.progress}%
        
        Dame 3 consejos estratégicos breves para mejorar la rentabilidad o gestión.`;
        
        const operation = () => genAI.models.generateContent({
            model: MODEL_NAME,
            contents: prompt
        });

        const response = await retryOperation(operation);
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
        try {
            // Contexto de precios para que la IA use precios reales
            const priceContext = currentPrices.slice(0, 50).map(p => `${p.name}: ${p.price}€/${p.unit}`).join('\n');
            
            const prompt = `Genera un presupuesto detallado (lista de partidas) para: "${description}".
            Usa estos precios de referencia si aplican:\n${priceContext}
            
            Devuelve SOLO un Array JSON con objetos: { "name": string, "quantity": number, "unit": string, "pricePerUnit": number, "category": string }.
            Sin markdown.`;

            const parts: any[] = [{ text: prompt }];
            
            if (images.length > 0) {
                 const optimizedImg = await optimizeImage(images[0]);
                 parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedImg } });
            }

            const operation = () => genAI.models.generateContent({
                model: MODEL_NAME,
                contents: { parts }
            });

            const response = await retryOperation(operation);
            const result = cleanAndParseJSON(response.text || "[]");
            return Array.isArray(result) ? result : [];
        } catch {
            return [];
        }
    });
};

export const parseMaterialsFromInput = async (textInput: string): Promise<PriceItem[]> => {
    return apiQueue.add(async () => {
        try {
            const prompt = `Extrae una lista de materiales de este texto.
            Texto: "${textInput}"
            
            Devuelve SOLO un Array JSON: [{ "name": string, "unit": string, "price": number, "category": string }].
            Si no hay precio, pon 0. Categorías sugeridas: Material, Mano de Obra, Pequeño Material.`;
            
            const operation = () => genAI.models.generateContent({ 
                model: MODEL_NAME, 
                contents: prompt 
            });

            const response = await retryOperation(operation);
            const result = cleanAndParseJSON(response.text || "[]");
            return Array.isArray(result) ? result : [];
        } catch {
            return [];
        }
    });
};

export const parseMaterialsFromImage = async (base64Image: string): Promise<PriceItem[]> => {
    return apiQueue.add(async () => {
        try {
            const cleanData = await optimizeImage(base64Image);
            
            const operation = () => genAI.models.generateContent({
                model: MODEL_NAME,
                contents: {
                    parts: [
                        { inlineData: { mimeType: 'image/jpeg', data: cleanData } },
                        { text: "Identifica los materiales, precios y unidades en esta imagen de tarifa o catálogo. Devuelve SOLO un Array JSON válido: [{ name, unit, price, category }]." }
                    ]
                }
            });

            const response = await retryOperation(operation);
            const result = cleanAndParseJSON(response.text || "[]");
            return Array.isArray(result) ? result : [];
        } catch {
            return [];
        }
    });
};