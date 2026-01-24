import { GoogleGenAI } from "@google/genai";
import { Project, PriceItem } from "../types";

// --- CONFIGURACIÓN DE API ---
const apiKey = 'AIzaSyDhw7HUqBlxd2dohZ84jOZD9H75bmjAg3k';
const genAI = new GoogleGenAI({ apiKey });

// CAMBIO CRÍTICO: 'gemini-1.5-flash-latest' es la referencia correcta y estable para el Free Tier 
// en la versión v1beta de la API. Evita el 404 de 'gemini-1.5-flash' y el 429 de '2.0-flash'.
const MODEL_NAME = 'gemini-1.5-flash-latest';

/**
 * Analiza un documento.
 * Devuelve un objeto JSON con los datos extraídos o valores por defecto si falla.
 */
export const analyzeDocument = async (base64String: string, mimeType: string = 'image/jpeg'): Promise<any> => {
  try {
    const cleanBase64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
    
    // Prompt ajustado para mayor precisión en JSON
    const prompt = `Analiza este documento (ticket/factura).
    Responde ÚNICAMENTE con un objeto JSON válido con esta estructura:
    {
      "comercio": "Nombre del proveedor",
      "fecha": "YYYY-MM-DD",
      "total": 0.00,
      "iva": 0.00,
      "categoria": "Material",
      "items": [{ "name": "item", "quantity": 1, "unit": "ud", "price": 0 }]
    }
    Si algún dato no es visible, usa null o 0. No uses markdown.`;
    
    const response = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: {
        temperature: 0.1, // Baja temperatura para datos precisos
      }
    });

    let text = response.text || "{}";
    
    // Limpieza agresiva: elimina bloques de código markdown ```json ... ``` y espacios
    text = text.replace(/```json|```/g, '').trim();
    
    // Busca el primer '{' y el último '}' para aislar el JSON de cualquier texto extra
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    
    if (start !== -1 && end !== -1) {
       text = text.substring(start, end + 1);
    } else {
       throw new Error("No se encontró JSON válido en la respuesta");
    }

    return JSON.parse(text);

  } catch (error) {
    console.warn('Gemini API Fallback:', error);
    
    // Retornamos un objeto "vacío" seguro para que la UI no falle y permita edición manual
    return {
        comercio: "",
        fecha: new Date().toISOString().split('T')[0],
        total: 0,
        iva: 0,
        categoria: "Material",
        description: "Error de escaneo - Introducir manualmente",
        items: []
    };
  }
};

export const chatWithAssistant = async (message: string, context?: string): Promise<string> => {
  try {
    const prompt = context ? `Contexto previo:\n${context}\n\nUsuario: ${message}` : message;
    const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt
    });
    return response.text || "No tengo respuesta en este momento.";
  } catch (error) {
    console.error("Error chat:", error);
    return "Lo siento, el servicio de IA no está disponible en este momento (posible límite de cuota).";
  }
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
  try {
    const prompt = `Analiza proyecto: ${project.name}. Estado: ${project.status}. Presupuesto: ${project.budget}. Dame 3 consejos breves.`;
    const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt
    });
    return response.text || "";
  } catch {
    return "Análisis no disponible.";
  }
};

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    try {
        const parts: any[] = [{ text: `Genera JSON array de partidas para: "${description}". Formato: [{name, unit, quantity, pricePerUnit, category}].` }];
        
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
        const prompt = `Extrae materiales a JSON array {name, unit, price, category}: "${textInput}"`;
        const response = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: prompt
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
        text = text.replace(/```json|```/g, '').trim();
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1) text = text.substring(start, end + 1);
        return JSON.parse(text);
    } catch {
        return [];
    }
};