import { GoogleGenAI } from "@google/genai";
import { Project, PriceItem } from '../types';

// --- CONFIGURACIÓN DE SEGURIDAD ---

// Intentamos obtener la clave de todas las formas posibles (Vite, Process, o Fallback)
const getApiKey = (): string => {
  // @ts-ignore
  if (import.meta?.env?.VITE_API_KEY) return import.meta.env.VITE_API_KEY;
  // @ts-ignore
  if (typeof process !== 'undefined' && process.env?.API_KEY) return process.env.API_KEY;
  
  // CLAVE DE RESPALDO (Crucial para que no falle si las variables de entorno no cargan en Vercel)
  return 'AIzaSyAPt-4D6bA9qLK-BrijbJBcmnBU1ojXOA8';
};

const apiKey = getApiKey();
const ai = new GoogleGenAI({ apiKey });

// Usamos el modelo más estable y rápido actualmente
const MODEL_NAME = 'gemini-3-flash-preview';

// --- UTILIDADES DE LIMPIEZA (FUERZA BRUTA) ---

/**
 * Limpia la respuesta de la IA para obtener solo el JSON válido.
 * Elimina bloques de código markdown ```json ... ``` y texto introductorio.
 */
const cleanAndParseJSON = (text: string): any => {
    if (!text) return [];

    let cleanText = text;

    // 1. Eliminar bloques de código markdown
    cleanText = cleanText.replace(/```json/g, '').replace(/```/g, '');

    // 2. Buscar el primer '[' y el último ']' para arrays
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');

    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        try {
            const jsonStr = cleanText.substring(firstBracket, lastBracket + 1);
            return JSON.parse(jsonStr);
        } catch (e) {
            console.warn("Fallo parseo de array, intentando objeto...");
        }
    }

    // 3. Buscar el primer '{' y el último '}' para objetos
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1) {
        try {
            const jsonStr = cleanText.substring(firstBrace, lastBrace + 1);
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error("No se pudo parsear JSON:", e);
        }
    }

    return [];
};

/**
 * Optimiza imágenes a Base64 puro para enviar a Gemini
 */
const optimizeImage = async (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        if (!base64Str || base64Str.startsWith('http')) {
            resolve(''); 
            return;
        }
        // Eliminar cabeceras data:image...
        const rawBase64 = base64Str.includes(',') ? base64Str.split(',')[1] : base64Str;
        resolve(rawBase64);
    });
};

// --- FUNCIONES EXPORTADAS ---

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    try {
        // Contexto de precios limitado para no saturar
        const priceContext = currentPrices
            .slice(0, 40)
            .map(p => `- ${p.name}: ${p.price}€/${p.unit} (${p.category})`)
            .join('\n');

        const prompt = `
            Eres un experto en presupuestos eléctricos.
            Tarea: Generar partidas para el proyecto: "${description}".
            
            Precios de referencia (úsalos si aplican):
            ${priceContext}
            
            INSTRUCCIONES ESTRICTAS:
            1. Devuelve SOLAMENTE un JSON Array válido.
            2. NO escribas texto introductorio.
            3. Formato: [{"name": "...", "quantity": 1, "unit": "ud", "pricePerUnit": 10, "category": "Material"}]
        `;

        const parts: any[] = [{ text: prompt }];

        // Añadir imagen si existe
        if (images.length > 0) {
            const imgData = await optimizeImage(images[0]);
            if (imgData) {
                parts.push({ inlineData: { mimeType: 'image/jpeg', data: imgData } });
            }
        }

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts },
            config: {
                temperature: 0.2, // Baja temperatura para ser preciso
            }
        });

        const items = cleanAndParseJSON(response.text || "");
        
        if (Array.isArray(items) && items.length > 0) {
            return items;
        }
        
        // Si no devolvió array, intentamos extraer de la propiedad 'items' si devolvió objeto
        if (items && items.items && Array.isArray(items.items)) {
            return items.items;
        }

        throw new Error("Formato inválido");

    } catch (error) {
        console.error("Error en generateSmartBudget:", error);
        // Fallback visual para que la app no colapse
        return [{
            name: "Partida Manual (Error IA)",
            quantity: 1,
            unit: "ud",
            pricePerUnit: 0,
            category: "Otros"
        }];
    }
};

export const analyzeDocument = async (base64Data: string, mimeType: string) => {
    try {
        const imgData = await optimizeImage(base64Data);
        if (!imgData) return { errorType: 'GENERIC' };

        const prompt = `Analiza este documento. Devuelve JSON: { "comercio": string, "total": number, "fecha": "YYYY-MM-DD", "items": [{name, quantity, price}] }`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: 'image/jpeg', data: imgData } }
                ]
            }
        });

        const data = cleanAndParseJSON(response.text || "");
        return data.total ? data : { errorType: 'GENERIC' };
    } catch (e) {
        return { errorType: 'GENERIC' };
    }
};

export const parseMaterialsFromInput = async (text: string): Promise<PriceItem[]> => {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [{ text: `Extrae materiales de: "${text}". JSON Array: [{"name", "price", "unit", "category"}]` }] }
        });
        const items = cleanAndParseJSON(response.text || "");
        return Array.isArray(items) ? items : [];
    } catch (e) {
        return [];
    }
};

export const parseMaterialsFromImage = async (base64Data: string): Promise<PriceItem[]> => {
    try {
        const imgData = await optimizeImage(base64Data);
        if (!imgData) return [];
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [
                    { text: "Lista materiales y precios. JSON Array." },
                    { inlineData: { mimeType: 'image/jpeg', data: imgData } }
                ]
            }
        });
        const items = cleanAndParseJSON(response.text || "");
        return Array.isArray(items) ? items : [];
    } catch (e) {
        return [];
    }
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
    try {
        const prompt = `Resumen ejecutivo muy breve de la obra: ${project.name}. Estado: ${project.status}. Presupuesto: ${project.budget}.`;
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [{ text: prompt }] }
        });
        return response.text || "Sin análisis.";
    } catch (e) {
        return "Servicio no disponible.";
    }
};

export const chatWithAssistant = async (message: string, context: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [{ text: context + "\n\nUsuario: " + message }] }
        });
        return response.text || "Error de respuesta.";
    } catch (e) {
        return "Error de conexión.";
    }
};
