import { GoogleGenAI } from "@google/genai";
import { Project, PriceItem } from "../types";

// --- CONFIGURACIÓN DE API ---
const apiKey = 'AIzaSyDhw7HUqBlxd2dohZ84jOZD9H75bmjAg3k';
const genAI = new GoogleGenAI({ apiKey });

// Usamos el modelo Flash optimizado.
// Si activas la facturación en Google Cloud, este mismo modelo dejará de dar errores 429.
const MODEL_NAME = 'gemini-1.5-flash-latest';

/**
 * Analiza un documento.
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
    
    const prompt = `Analiza este documento. Devuelve JSON válido:
    {
      "comercio": "string",
      "fecha": "YYYY-MM-DD",
      "total": number,
      "iva": number,
      "categoria": "string",
      "items": [{ "name": "string", "quantity": number, "unit": "string", "price": number }]
    }
    Usa null si no encuentras algo.`;
    
    const response = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: { temperature: 0.1 }
    });

    let text = response.text || "{}";
    text = text.replace(/```json|```/g, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    
    if (start !== -1 && end !== -1) {
       text = text.substring(start, end + 1);
       return JSON.parse(text);
    } else {
       throw new Error("Respuesta inválida");
    }

  } catch (error: any) {
    console.warn('Gemini API Error:', error);
    
    // Detectar específicamente error de CUOTA (429)
    const isQuotaError = error.toString().includes('429') || 
                         (error.status === 429) || 
                         error.toString().includes('Quota') ||
                         error.toString().includes('Resource Exhausted');

    return {
        ...fallbackData,
        errorType: isQuotaError ? 'QUOTA' : 'GENERIC'
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
        return "⚠️ He alcanzado mi límite de uso gratuito. Por favor, configura la facturación en Google Cloud para continuar usando el asistente sin límites.";
    }
    return "El asistente no está disponible temporalmente.";
  }
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
  try {
    const prompt = `Analiza proyecto: ${project.name}. Estado: ${project.status}. Presupuesto: ${project.budget}. Dame 3 consejos.`;
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
        const parts: any[] = [{ text: `Genera JSON array presupuesto para: "${description}"` }];
        
        if (images.length > 0) {
             const img = images[0];
             const data = img.includes(',') ? img.split(',')[1] : img;
             parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
        }

        const response = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: { parts }
        });
        
        let text = response.text || "[]";
        text = text.replace(/```json|```/g, '').trim();
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1) text = text.substring(start, end + 1);
        
        return JSON.parse(text);
    } catch {
        return [];
    }
};

export const parseMaterialsFromInput = async (textInput: string): Promise<PriceItem[]> => {
    try {
        const prompt = `Extrae materiales JSON: "${textInput}"`;
        const response = await genAI.models.generateContent({ model: MODEL_NAME, contents: prompt });
        let text = response.text || "[]";
        text = text.replace(/```json|```/g, '').trim();
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1) text = text.substring(start, end + 1);
        return JSON.parse(text);
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
                    { text: "Lista materiales JSON." }
                ]
            }
        });
        let text = response.text || "[]";
        text = text.replace(/```json|```/g, '').trim();
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1) text = text.substring(start, end + 1);
        return JSON.parse(text);
    } catch {
        return [];
    }
};