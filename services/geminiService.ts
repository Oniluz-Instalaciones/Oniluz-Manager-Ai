import { GoogleGenAI } from "@google/genai";
import { Project, PriceItem } from '../types';

// --- 1. Inicialización Simple ---

// Obtener API Key de forma segura
const getApiKey = (): string => {
  // @ts-ignore
  const envKey = import.meta?.env?.VITE_API_KEY;
  // @ts-ignore
  const processKey = typeof process !== 'undefined' ? process.env?.API_KEY : undefined;
  
  // Clave de respaldo si no hay variables de entorno (Crucial para que funcione la demo)
  return envKey || processKey || 'AIzaSyAPt-4D6bA9qLK-BrijbJBcmnBU1ojXOA8';
};

const apiKey = getApiKey();
const ai = new GoogleGenAI({ apiKey });

// Usamos el modelo más rápido y versátil para tareas de texto
const MODEL_NAME = 'gemini-3-flash-preview';

// --- 2. Utilidades de Limpieza (Fuerza Bruta) ---

/**
 * Esta función es la clave. No confía en que la IA devuelva JSON válido.
 * Busca cualquier cosa que parezca un Array [...] o un Objeto {...} dentro del texto
 * y lo extrae quirúrgicamente.
 */
const extractJSON = (text: string): any => {
    if (!text) return [];

    try {
        // 1. Intentar parseo directo
        return JSON.parse(text);
    } catch (e) {
        // 2. Buscar patrón de Array [...]
        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            const jsonStr = text.substring(firstBracket, lastBracket + 1);
            try {
                return JSON.parse(jsonStr);
            } catch (e2) {
                console.warn("Fallo al parsear Array extraído, intentando limpieza agresiva...");
            }
        }

        // 3. Buscar patrón de Objeto {...} (para casos que no devuelven lista)
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
            const jsonStr = text.substring(firstBrace, lastBrace + 1);
            try {
                return JSON.parse(jsonStr);
            } catch (e3) {}
        }
        
        console.error("No se encontró JSON válido en la respuesta IA:", text);
        return [];
    }
};

/**
 * Reduce el tamaño de las imágenes para no saturar el payload de la API
 */
const optimizeImage = async (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        if (!base64Str || base64Str.startsWith('http')) {
            resolve(''); // Ignorar URLs externas por ahora
            return;
        }

        // Quitar cabecera data:image/...;base64,
        const rawBase64 = base64Str.includes(',') ? base64Str.split(',')[1] : base64Str;
        
        // Si es muy corta, probablemente sea inválida
        if (rawBase64.length < 100) {
            resolve('');
            return;
        }

        resolve(rawBase64);
    });
};

// --- 3. Funciones Principales ---

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    try {
        // 1. Preparar Contexto de Precios (Limitado a 50 para no exceder tokens inútilmente)
        const priceList = currentPrices
            .slice(0, 50)
            .map(p => `"${p.name}" (${p.price}€/${p.unit})`)
            .join(", ");

        // 2. Construir Prompt Directo
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

        // 3. Preparar Contenido (Texto + Imagen si hay)
        const contentParts: any[] = [{ text: prompt }];
        
        if (images.length > 0) {
            const imgData = await optimizeImage(images[0]);
            if (imgData) {
                contentParts.push({ 
                    inlineData: { mimeType: "image/jpeg", data: imgData } 
                });
            }
        }

        // 4. Llamada a la API (Sin Streaming, Sin Schema complejo)
        const result = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: contentParts },
            config: {
                temperature: 0.1, // Creatividad baja para datos precisos
            }
        });

        // 5. Procesar Respuesta
        const responseText = result.text;
        const items = extractJSON(responseText);

        if (Array.isArray(items) && items.length > 0) {
            return items;
        } else {
            throw new Error("La IA no generó partidas válidas.");
        }

    } catch (error) {
        console.error("Error crítico en generateSmartBudget:", error);
        
        // Fallback de seguridad: Devolver un item manual para que la UI no rompa
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

        const result = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "image/jpeg", data: imgData } }
                ]
            }
        });

        const data = extractJSON(result.text);
        return data || { errorType: 'GENERIC' };

    } catch (error) {
        console.error("Error analizando documento:", error);
        return { errorType: 'GENERIC' };
    }
};

export const parseMaterialsFromInput = async (text: string): Promise<PriceItem[]> => {
    try {
        const result = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [{ text: `Extrae una lista de materiales de este texto: "${text}". Devuelve JSON Array [{name, price, unit, category}].` }]
            }
        });
        
        const items = extractJSON(result.text);
        return Array.isArray(items) ? items : [];
    } catch (error) {
        return [];
    }
};

export const parseMaterialsFromImage = async (base64Data: string): Promise<PriceItem[]> => {
    try {
        const imgData = await optimizeImage(base64Data);
        if (!imgData) return [];

        const result = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [
                    { text: "Lista los materiales visibles con precio estimado. JSON Array." },
                    { inlineData: { mimeType: "image/jpeg", data: imgData } }
                ]
            }
        });
        
        const items = extractJSON(result.text);
        return Array.isArray(items) ? items : [];
    } catch (error) {
        return [];
    }
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
    try {
        const prompt = `Analiza brevemente este proyecto: ${project.name}, Presupuesto: ${project.budget}€, Estado: ${project.status}. Dame 3 recomendaciones cortas.`;
        const result = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [{ text: prompt }] }
        });
        return result.text || "No hay análisis disponible.";
    } catch (error) {
        return "Servicio no disponible actualmente.";
    }
};

export const chatWithAssistant = async (message: string, context: string): Promise<string> => {
    try {
        const result = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [{ text: context + "\n\nUsuario: " + message }] }
        });
        return result.text || "Lo siento, no puedo responder ahora.";
    } catch (error) {
        return "Error de conexión con el servidor IA.";
    }
};
