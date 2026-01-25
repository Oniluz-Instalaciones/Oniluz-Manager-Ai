import { GoogleGenAI } from "@google/genai";
import { Project, PriceItem } from '../types';

// --- 1. Inicialización Simple ---

const getApiKey = (): string => {
  // @ts-ignore
  const envKey = import.meta?.env?.VITE_API_KEY;
  // @ts-ignore
  const processKey = typeof process !== 'undefined' ? process.env?.API_KEY : undefined;
  
  // Clave de respaldo
  return envKey || processKey || 'AIzaSyAPt-4D6bA9qLK-BrijbJBcmnBU1ojXOA8';
};

const apiKey = getApiKey();
const ai = new GoogleGenAI({ apiKey });

// LISTA DE MODELOS EN ORDEN DE PRIORIDAD
// Si el primero falla (404), intentamos el siguiente.
const MODELS_TO_TRY = ['gemini-3-flash-preview', 'gemini-2.0-flash-exp'];

// --- 2. Utilidades ---

/**
 * Función auxiliar para llamar a la IA con reintentos automáticos de modelo
 */
const generateContentSafe = async (contents: any, config: any = {}) => {
    let lastError = null;

    for (const model of MODELS_TO_TRY) {
        try {
            const result = await ai.models.generateContent({
                model,
                contents,
                config
            });
            return result;
        } catch (error: any) {
            console.warn(`Fallo con modelo ${model}:`, error.message);
            lastError = error;
            // Si es un error 404 (Modelo no encontrado) o 503 (Servicio no disponible), probamos el siguiente.
            // Si es otro error (ej. API Key inválida), quizás deberíamos parar, pero por seguridad probamos todos.
        }
    }
    throw lastError || new Error("Todos los modelos de IA fallaron.");
};

const extractJSON = (text: string): any => {
    if (!text) return [];

    try {
        return JSON.parse(text);
    } catch (e) {
        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            try { return JSON.parse(text.substring(firstBracket, lastBracket + 1)); } catch (e2) {}
        }

        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch (e3) {}
        }
        return [];
    }
};

const optimizeImage = async (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        if (!base64Str || base64Str.startsWith('http')) {
            resolve(''); 
            return;
        }
        const rawBase64 = base64Str.includes(',') ? base64Str.split(',')[1] : base64Str;
        resolve(rawBase64.length > 100 ? rawBase64 : '');
    });
};

// --- 3. Funciones Principales ---

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    try {
        const priceList = currentPrices
            .slice(0, 50)
            .map(p => `"${p.name}" (${p.price}€/${p.unit})`)
            .join(", ");

        const prompt = `
            Actúa como un Ingeniero Eléctrico Experto.
            Crea un presupuesto detallado para: "${description}".
            
            Usa estos precios de referencia si aplican: [${priceList}].
            
            REGLAS OBLIGATORIAS:
            1. Devuelve SOLAMENTE un JSON Array. Nada de texto antes ni después.
            2. Estructura exacta de cada item:
               {
                 "name": "Nombre técnico del material o servicio",
                 "quantity": número,
                 "unit": "m", "ud", "h", etc,
                 "pricePerUnit": número (usa referencia o precio de mercado en España),
                 "category": "Material" o "Mano de Obra"
               }
            3. Sé realista con las cantidades.
        `;

        const contentParts: any[] = [{ text: prompt }];
        
        if (images.length > 0) {
            const imgData = await optimizeImage(images[0]);
            if (imgData) {
                contentParts.push({ inlineData: { mimeType: "image/jpeg", data: imgData } });
            }
        }

        // Usamos la función segura con fallback
        const result = await generateContentSafe(
            { parts: contentParts },
            { temperature: 0.1 }
        );

        const items = extractJSON(result.text || "[]");

        if (Array.isArray(items) && items.length > 0) {
            return items;
        } else {
            throw new Error("La IA no generó partidas válidas.");
        }

    } catch (error) {
        console.error("Error crítico en generateSmartBudget:", error);
        return [{
            name: "Partida Manual (Error de conexión IA)",
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
        if (!imgData) throw new Error("Imagen inválida");

        const prompt = `Analiza este documento (factura o albarán). Extrae los datos en este formato JSON exacto:
        {
            "comercio": "Nombre proveedor",
            "fecha": "YYYY-MM-DD",
            "total": 0.00,
            "iva": 0.00,
            "categoria": "Material",
            "items": [
                { "name": "...", "quantity": 1, "price": 0.00, "unit": "ud" }
            ]
        }`;

        const result = await generateContentSafe(
            {
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "image/jpeg", data: imgData } }
                ]
            }
        );

        const data = extractJSON(result.text || "{}");
        return data || { errorType: 'GENERIC' };

    } catch (error) {
        console.error("Error analizando documento:", error);
        return { errorType: 'GENERIC' };
    }
};

export const parseMaterialsFromInput = async (text: string): Promise<PriceItem[]> => {
    try {
        const result = await generateContentSafe(
            { parts: [{ text: `Extrae una lista de materiales de este texto: "${text}". Devuelve JSON Array [{name, price, unit, category}].` }] }
        );
        const items = extractJSON(result.text || "[]");
        return Array.isArray(items) ? items : [];
    } catch (error) {
        return [];
    }
};

export const parseMaterialsFromImage = async (base64Data: string): Promise<PriceItem[]> => {
    try {
        const imgData = await optimizeImage(base64Data);
        if (!imgData) return [];

        const result = await generateContentSafe(
            {
                parts: [
                    { text: "Lista los materiales visibles con precio estimado. JSON Array." },
                    { inlineData: { mimeType: "image/jpeg", data: imgData } }
                ]
            }
        );
        const items = extractJSON(result.text || "[]");
        return Array.isArray(items) ? items : [];
    } catch (error) {
        return [];
    }
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
    try {
        const prompt = `Analiza brevemente este proyecto: ${project.name}, Presupuesto: ${project.budget}€, Estado: ${project.status}. Dame 3 recomendaciones cortas.`;
        const result = await generateContentSafe({ parts: [{ text: prompt }] });
        return result.text || "No hay análisis disponible.";
    } catch (error) {
        return "Servicio no disponible actualmente.";
    }
};

export const chatWithAssistant = async (message: string, context: string): Promise<string> => {
    try {
        const result = await generateContentSafe({ parts: [{ text: context + "\n\nUsuario: " + message }] });
        return result.text || "Lo siento, no puedo responder ahora.";
    } catch (error) {
        return "Error de conexión con el servidor IA.";
    }
};