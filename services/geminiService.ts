import { GoogleGenAI } from "@google/genai";
import { Project, PriceItem } from "../types";

// --- CONFIGURACIÓN DE API ---
// NOTA: Se recomienda usar variables de entorno para la API Key.
const apiKey = 'AIzaSyDhw7HUqBlxd2dohZ84jOZD9H75bmjAg3k';
const genAI = new GoogleGenAI({ apiKey });

// SOLUCIÓN: Configurado explícitamente a Gemini 1.5 Flash por petición del usuario.
// Este modelo es rápido, eficiente y soporta lectura de imágenes (multimodal).
const MODEL_NAME = 'gemini-1.5-flash';

/**
 * Función auxiliar para limpiar y parsear JSON de la respuesta de la IA.
 */
const cleanAndParseJSON = (text: string): any => {
    try {
        // 1. Eliminar bloques de código Markdown
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // 2. Encontrar el primer '{' o '[' y el último '}' o ']'
        const firstOpenBrace = cleanText.indexOf('{');
        const firstOpenBracket = cleanText.indexOf('[');
        
        let start = -1;
        let end = -1;

        // Determinar si esperamos un objeto o un array
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
        
        // Intento directo si no se encontraron estructuras claras
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("Error parseando JSON de Gemini:", e);
        return null;
    }
};

/**
 * Analiza un documento (Ticket, Factura, Albarán).
 */
export const analyzeDocument = async (base64String: string, mimeType: string = 'image/jpeg'): Promise<any> => {
  // Objeto por defecto para fallback
  const fallbackData = {
    comercio: "",
    fecha: new Date().toISOString().split('T')[0],
    total: 0,
    iva: 0,
    categoria: "Material",
    description: "Introducir datos manualmente",
    items: []
  };

  try {
    const cleanBase64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
    
    // Prompt optimizado para Gemini 1.5 Flash
    const prompt = `Analiza esta imagen de un ticket/factura. Extrae los datos en este formato JSON exacto:
    {
      "comercio": "Nombre del proveedor",
      "fecha": "YYYY-MM-DD",
      "total": 0.00,
      "iva": 0.00,
      "categoria": "Material", 
      "items": [{ "name": "Nombre producto", "quantity": 1, "unit": "ud", "price": 0.00 }]
    }
    Si no encuentras un dato, usa null. Responde SOLO con el JSON.`;
    
    const response = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: { 
          temperature: 0.1,
      }
    });

    const result = cleanAndParseJSON(response.text || "{}");
    
    if (result) {
        // Asegurar tipos básicos
        return {
            ...fallbackData,
            ...result,
            total: Number(result.total) || 0,
            iva: Number(result.iva) || 0
        };
    } else {
       throw new Error("Respuesta inválida (Fallo de parsing)");
    }

  } catch (error: any) {
    console.warn('Gemini API Error:', error);
    
    const errorStr = error.toString();
    const isQuotaError = errorStr.includes('429') || 
                         (error.status === 429) || 
                         errorStr.includes('Quota') ||
                         errorStr.includes('Resource Exhausted');

    return {
        ...fallbackData,
        errorType: isQuotaError ? 'QUOTA' : 'GENERIC',
        description: isQuotaError ? "Error de Cuota" : "Error al procesar imagen"
    };
  }
};

export const chatWithAssistant = async (message: string, context?: string): Promise<string> => {
  try {
    const prompt = context ? `Contexto:\n${context}\n\nUsuario: ${message}` : message;
    const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt
    });
    return response.text || "Sin respuesta.";
  } catch (error: any) {
    if (error.toString().includes('429')) {
        return "⚠️ He alcanzado mi límite de uso gratuito. Por favor, espera un momento o configura la facturación.";
    }
    return "El asistente no está disponible temporalmente.";
  }
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
  try {
    const prompt = `Analiza proyecto: ${project.name}. Estado: ${project.status}. Presupuesto: ${project.budget}. Dame 3 consejos breves y estratégicos.`;
    const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt
    });
    return response.text || "";
  } catch {
    return "Análisis no disponible (Límite de cuota o error de red).";
  }
};

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    try {
        const parts: any[] = [{ text: `Genera un array JSON de partidas presupuestarias para: "${description}". Usa precios realistas.` }];
        
        if (images.length > 0) {
             const img = images[0];
             const data = img.includes(',') ? img.split(',')[1] : img;
             parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
        }

        const response = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: { parts }
        });
        
        const result = cleanAndParseJSON(response.text || "[]");
        return Array.isArray(result) ? result : [];
    } catch {
        return [];
    }
};

export const parseMaterialsFromInput = async (textInput: string): Promise<PriceItem[]> => {
    try {
        const prompt = `Extrae una lista de materiales de este texto en formato JSON array: "${textInput}"`;
        const response = await genAI.models.generateContent({ model: MODEL_NAME, contents: prompt });
        const result = cleanAndParseJSON(response.text || "[]");
        return Array.isArray(result) ? result : [];
    } catch {
        return [];
    }
};

export const parseMaterialsFromImage = async (base64Image: string): Promise<PriceItem[]> => {
    try {
        const data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
        const response = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data } },
                    { text: "Lista los materiales visibles o listados en esta imagen. Devuelve SOLO un JSON Array." }
                ]
            }
        });
        const result = cleanAndParseJSON(response.text || "[]");
        return Array.isArray(result) ? result : [];
    } catch {
        return [];
    }
};