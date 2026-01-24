import { GoogleGenAI } from "@google/genai";
import { Project, PriceItem } from "../types";

// --- CONFIGURACIÓN DE API ---
const apiKey = 'AIzaSyDhw7HUqBlxd2dohZ84jOZD9H75bmjAg3k';
const genAI = new GoogleGenAI({ apiKey });

// CAMBIO CRÍTICO: Usamos 'gemini-2.0-flash' para evitar el error 404 de la versión 1.5
const MODEL_NAME = 'gemini-2.0-flash';

/**
 * Analiza un documento con manejo de errores robusto.
 * Si falla, devuelve datos vacíos para no bloquear la app.
 */
export const analyzeDocument = async (base64String: string, mimeType: string = 'image/jpeg'): Promise<any> => {
  try {
    const cleanBase64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
    
    const prompt = 'Analiza este ticket/factura. Extrae en JSON: comercio, fecha (YYYY-MM-DD), total (numero), iva (numero), categoria y descripcion. Si no encuentras algo, déjalo vacío o en 0.';
    
    const response = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: cleanBase64 } },
          { text: prompt }
        ]
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
    console.error('Error controlado en Gemini:', error);
    // FALLBACK: Devolvemos objeto válido para que el usuario pueda editar manualmente
    return {
        comercio: "Error de Escaneo (Editar)",
        fecha: new Date().toISOString().split('T')[0],
        total: 0,
        iva: 0,
        categoria: "Otros",
        description: "Introducir datos manualmente",
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
    return response.text || "No tengo respuesta.";
  } catch (error) {
    console.error("Error chat:", error);
    return "Error de conexión. Por favor, verifica tu red.";
  }
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
  try {
    const prompt = `Analiza: ${project.name}. Estado: ${project.status}. Presupuesto: ${project.budget}. Dame 3 tips breves.`;
    const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt
    });
    return response.text || "";
  } catch {
    return "Análisis no disponible temporalmente.";
  }
};

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    try {
        const parts: any[] = [{ text: `Crea un presupuesto JSON array (name, unit, quantity, pricePerUnit, category) para: "${description}". Sé realista.` }];
        
        for (const img of images) {
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
        const prompt = `Extrae materiales de este texto a JSON array {name, unit, price, category}: "${textInput}"`;
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
                    { text: "Lista todos los materiales visibles en un JSON array {name, unit, price, category}." }
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