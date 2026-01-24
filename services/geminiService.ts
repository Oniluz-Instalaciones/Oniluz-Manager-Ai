import { GoogleGenAI } from "@google/genai";
import { Project, PriceItem } from "../types";

// --- CONFIGURACIÓN DE API ---
// Clave API limpia y directa
const apiKey = 'AIzaSyDhw7HUqBlxd2dohZ84jOZD9H75bmjAg3k';
// Inicialización del cliente (SDK @google/genai)
const genAI = new GoogleGenAI({ apiKey });
// Nombre exacto del modelo para evitar 404
const MODEL_NAME = 'gemini-1.5-flash';

/**
 * Analiza un documento (ticket/factura) y extrae datos estructurados.
 * Implementa la lógica de limpieza solicitada para asegurar JSON válido.
 */
export const analyzeDocument = async (base64String: string, mimeType: string = 'image/jpeg'): Promise<any> => {
  try {
    // Aseguramos que solo enviamos la parte de datos del base64
    const cleanBase64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
    
    // Prompt específico solicitado
    const prompt = 'Extrae de este ticket: comercio, fecha (DD/MM/AAAA), total (numero), iva (numero), categoria y descripcion. Responde SOLO con el objeto JSON.';
    
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
    
    // Limpieza agresiva de etiquetas markdown y json (Solicitada por el usuario)
    text = text.replace(/```json|```|json/g, '').trim();
    
    // Intento adicional de extracción segura si queda basura alrededor
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
       text = text.substring(start, end + 1);
    }

    return JSON.parse(text);
  } catch (error) {
    console.error('Error en Gemini analyzeDocument:', error);
    // Retornamos un objeto vacío/seguro para evitar que la UI explote
    throw error;
  }
};

// --- OTRAS FUNCIONES (Mantenidas y corregidas para que la app no se rompa) ---

export const chatWithAssistant = async (message: string, context?: string): Promise<string> => {
  try {
    const prompt = context ? `Contexto:\n${context}\n\nUsuario: ${message}` : message;
    const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt
    });
    return response.text || "";
  } catch (error) {
    console.error("Error en chatWithAssistant:", error);
    return "Lo siento, hubo un error de conexión con mi cerebro digital (Error 404 o Network).";
  }
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
  try {
    const prompt = `Analiza brevemente este proyecto: ${project.name}. Estado: ${project.status}. Presupuesto: ${project.budget}€. Gastos: ${project.transactions.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount,0)}€. Dame 3 recomendaciones cortas.`;
    const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt
    });
    return response.text || "No se pudo generar el análisis.";
  } catch (error) {
    console.error("Error en analyzeProjectStatus:", error);
    return "Error de conexión al analizar el proyecto.";
  }
};

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    try {
        const parts: any[] = [{ text: `Genera un JSON array de partidas presupuestarias (name, unit, quantity, pricePerUnit, category) para: ${description}. Usa precios realistas.` }];
        
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
        
        // Extracción segura de array
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1) text = text.substring(start, end + 1);
        
        return JSON.parse(text);
    } catch (error) {
        console.error("Error en generateSmartBudget:", error);
        return [];
    }
};

export const parseMaterialsFromInput = async (textInput: string): Promise<PriceItem[]> => {
    try {
        const prompt = `Analiza este texto y extrae materiales eléctricos en un JSON array con {name, unit, price, category}: "${textInput}"`;
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
                    { text: "Extrae materiales de esta lista/catálogo. Devuelve JSON array con {name, unit, price, category}." }
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