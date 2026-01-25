import { GoogleGenAI } from "@google/genai";
import { Project, PriceItem } from "../types";

// --- CONFIGURACIÓN DE API ---
// NOTA: Se recomienda usar variables de entorno para la API Key.
const apiKey = 'AIzaSyAPt-4D6bA9qLK-BrijbJBcmnBU1ojXOA8';
const genAI = new GoogleGenAI({ apiKey });

// Usamos 'gemini-1.5-flash' por su balance velocidad/coste/cuota.
const MODEL_NAME = 'gemini-1.5-flash';

// --- SISTEMA DE CACHÉ ---
const responseCache = new Map<string, { timestamp: number, data: any }>();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutos de caché para análisis idénticos

// --- SISTEMA DE COLA (Rate Limiting) ---
// Evita lanzar múltiples peticiones simultáneas que bloqueen la API gratuita
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
                // Pequeña pausa entre peticiones para dar respiro a la cuota
                await new Promise(r => setTimeout(r, 1000)); 
            }
        }
        
        this.processing = false;
    }
}

const apiQueue = new RequestQueue();

// --- UTILIDADES DE OPTIMIZACIÓN ---

/**
 * Comprime imágenes antes de enviarlas para ahorrar tokens masivamente.
 * Redimensiona a max 1024px y reduce calidad JPEG.
 */
const optimizeImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        // Si no es imagen, devolver tal cual
        if (!base64Str.startsWith('data:image')) {
             return resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
        }

        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const MAX_SIZE = 1024; // Reducción drástica de tokens

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
            
            // Comprimir a JPEG 0.7
            const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            resolve(optimizedBase64.split(',')[1]); // Devolver solo la data sin header
        };
        img.onerror = () => {
            // Fallback si falla la carga
            resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
        };
    });
};

/**
 * Wrapper con reintentos exponenciales para manejar errores 429.
 */
const retryOperation = async <T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        const isQuota = error.toString().includes('429') || (error.status === 429);
        if (retries > 0 && isQuota) {
            console.warn(`Cuota excedida (429). Reintentando en ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            return retryOperation(operation, retries - 1, delay * 2);
        }
        throw error;
    }
};

/**
 * Función auxiliar para limpiar y parsear JSON de la respuesta de la IA.
 */
const cleanAndParseJSON = (text: string): any => {
    try {
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
            return JSON.parse(cleanText);
        }
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("Error parseando JSON de Gemini:", e);
        return null;
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

  return apiQueue.add(async () => {
      try {
        // OPTIMIZACIÓN: Reducir tamaño de imagen antes de enviar
        const cleanBase64 = await optimizeImage(base64String);
        
        const prompt = `Analiza ticket/factura. JSON exacto:
        {
          "comercio": "Proveedor",
          "fecha": "YYYY-MM-DD",
          "total": 0.00,
          "iva": 0.00,
          "categoria": "Material", 
          "items": [{ "name": "Producto", "quantity": 1, "unit": "ud", "price": 0.00 }]
        }
        Si falta dato usa null. SOLO JSON.`;
        
        const operation = () => genAI.models.generateContent({
          model: MODEL_NAME,
          contents: {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } }, // Forzamos jpeg optimizado
              { text: prompt }
            ]
          },
          config: { temperature: 0.1 }
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
           throw new Error("Fallo de parsing");
        }
      } catch (error: any) {
        console.warn('Gemini API Error:', error);
        const errorStr = error.toString();
        const isQuotaError = errorStr.includes('429') || (error.status === 429);
        return {
            ...fallbackData,
            errorType: isQuotaError ? 'QUOTA' : 'GENERIC',
            description: isQuotaError ? "Límite de cuota." : "Error procesando"
        };
      }
  });
};

export const chatWithAssistant = async (message: string, context?: string): Promise<string> => {
  return apiQueue.add(async () => {
      try {
        const prompt = context ? `Contexto:\n${context}\n\nUsuario: ${message}` : message;
        const response = await retryOperation(() => genAI.models.generateContent({
            model: MODEL_NAME,
            contents: prompt
        }));
        return response.text || "Sin respuesta.";
      } catch (error: any) {
        if (error.toString().includes('429') || (error.status === 429)) {
            return "⚠️ Tráfico alto. Por favor espera 30 segundos.";
        }
        return "El asistente no está disponible.";
      }
  });
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
  // OPTIMIZACIÓN: Cachear resultado si el proyecto no ha cambiado significativamente
  // Usamos un hash simple basado en ID + Status + Budget
  const cacheKey = `status-${project.id}-${project.status}-${project.budget}`;
  const cached = responseCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log("Sirviendo análisis desde caché");
      return cached.data;
  }

  return apiQueue.add(async () => {
      try {
        const prompt = `Analiza proyecto: ${project.name}. Estado: ${project.status}. Presupuesto: ${project.budget}. 3 consejos breves.`;
        const response = await retryOperation(() => genAI.models.generateContent({
            model: MODEL_NAME,
            contents: prompt
        }));
        
        const text = response.text || "";
        // Guardar en caché
        responseCache.set(cacheKey, { timestamp: Date.now(), data: text });
        return text;
      } catch (error: any) {
         if (error.toString().includes('429')) return "Análisis pausado (Límite). Inténtalo luego.";
         return "Análisis no disponible.";
      }
  });
};

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    return apiQueue.add(async () => {
        try {
            const parts: any[] = [{ text: `Genera JSON array partidas presupuestarias para: "${description}".` }];
            
            if (images.length > 0) {
                 // Optimizar solo la primera imagen para ahorrar contexto
                 const optimizedImg = await optimizeImage(images[0]);
                 parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedImg } });
            }

            const response = await retryOperation(() => genAI.models.generateContent({
                model: MODEL_NAME,
                contents: { parts }
            }));
            
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
            const prompt = `Extrae materiales de este texto en JSON array: "${textInput}"`;
            const response = await retryOperation(() => genAI.models.generateContent({ model: MODEL_NAME, contents: prompt }));
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
            const response = await retryOperation(() => genAI.models.generateContent({
                model: MODEL_NAME,
                contents: {
                    parts: [
                        { inlineData: { mimeType: 'image/jpeg', data: cleanData } },
                        { text: "Lista materiales visibles. Devuelve SOLO JSON Array." }
                    ]
                }
            }));
            const result = cleanAndParseJSON(response.text || "[]");
            return Array.isArray(result) ? result : [];
        } catch {
            return [];
        }
    });
};