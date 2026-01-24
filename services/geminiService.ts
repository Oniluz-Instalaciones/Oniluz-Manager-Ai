import { GoogleGenAI } from "@google/genai";
import { Project, PriceItem } from "../types";

// --- CONFIGURACIÓN DE API ---
const apiKey = 'AIzaSyDhw7HUqBlxd2dohZ84jOZD9H75bmjAg3k';
const genAI = new GoogleGenAI({ apiKey });

// SOLUCIÓN AL ERROR 429:
// Usamos 'gemini-1.5-flash' porque 'gemini-2.0-flash' tiene límite 0 en el tier gratuito actual.
// Con el SDK @google/genai configurado correctamente, este modelo NO dará error 404.
const MODEL_NAME = 'gemini-1.5-flash';

/**
 * Analiza un documento.
 * Si la API falla (429 Quota, 404, Internet), devuelve un objeto por defecto
 * para permitir la entrada manual de datos sin bloquear la app.
 */
export const analyzeDocument = async (base64String: string, mimeType: string = 'image/jpeg'): Promise<any> => {
  try {
    const cleanBase64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
    
    // Prompt optimizado para reducir tokens y latencia
    const prompt = 'Extrae en JSON: comercio, fecha (YYYY-MM-DD), total (numero), iva (numero), categoria (Material/Combustible/Dieta/Otros). Si no está claro, usa null.';
    
    const response = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: {
        // Limitamos tokens de salida para ahorrar cuota
        maxOutputTokens: 300, 
        temperature: 0.2
      }
    });

    let text = response.text || "{}";
    
    // Limpieza de Markdown
    text = text.replace(/```json|```|json/g, '').trim();
    
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
       text = text.substring(start, end + 1);
    }

    return JSON.parse(text);

  } catch (error) {
    console.warn('Gemini API Fallback (Quota/Network):', error);
    
    // FALLBACK ROBUSTO:
    // Si falla la IA, devolvemos esto para que se abra el formulario y el usuario escriba.
    // Esto evita la pantalla blanca o el spinner infinito.
    return {
        comercio: "", // Se deja vacío para que el usuario escriba
        fecha: new Date().toISOString().split('T')[0],
        total: 0,
        iva: 0,
        categoria: "Material",
        description: "",
        items: []
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
    return response.text || "No tengo respuesta en este momento.";
  } catch (error) {
    console.error("Error chat:", error);
    return "Lo siento, he superado mi cuota de uso gratuita temporalmente. Por favor, inténtalo de nuevo en unos minutos.";
  }
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
  try {
    const prompt = `Analiza proyecto: ${project.name}. Estado: ${project.status}. Presupuesto: ${project.budget}. 3 consejos breves.`;
    const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt
    });
    return response.text || "";
  } catch {
    return "Análisis no disponible (Cuota excedida o sin conexión).";
  }
};

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    try {
        const parts: any[] = [{ text: `Crea presupuesto JSON array (name, unit, quantity, pricePerUnit, category) para: "${description}".` }];
        
        // Solo enviamos la primera imagen para ahorrar cuota si hay muchas
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
        text = text.replace(/```json|```|json/g, '').trim();
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1) text = text.substring(start, end + 1);
        
        return JSON.parse(text);
    } catch (e) {
        console.error("Error presupuesto:", e);
        return [];
    }
};

export const parseMaterialsFromInput = async (textInput: string): Promise<PriceItem[]> => {
    try {
        const prompt = `Extrae materiales a JSON array {name, unit, price, category}: "${textInput}"`;
        const response = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: prompt
        });
        let text = response.text || "[]";
        text = text.replace(/```json|```|json/g, '').trim();
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
                    { text: "Lista materiales JSON array {name, unit, price, category}." }
                ]
            }
        });
        let text = response.text || "[]";
        text = text.replace(/```json|```|json/g, '').trim();
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1) text = text.substring(start, end + 1);
        return JSON.parse(text);
    } catch {
        return [];
    }
};