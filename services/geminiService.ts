import { GoogleGenAI, Type } from "@google/genai";
import { Project, PriceItem } from "../types";

// --- CONFIGURACIÓN TÉCNICA ---
// API Key limpia y exacta
const apiKey = 'AIzaSyDhw7HUqBlxd2dohZ84jOZD9H75bmjAg3k'; 

// Inicialización del SDK moderno (@google/genai)
const ai = new GoogleGenAI({ apiKey });

// MODELO DEFINIDO: 'gemini-1.5-flash' exacto para evitar error 404
const MODEL_NAME = 'gemini-1.5-flash';

// Función para el Chat Global
export const chatWithAssistant = async (message: string, context?: string): Promise<string> => {
  try {
    const systemInstruction = `Eres Oniluz AI, un asistente experto para empresas eléctricas. 
    Ayudas a gestionar obras, materiales, normativas (REBT) y finanzas. 
    Responde de forma breve, profesional y útil.`;

    const prompt = context ? `Contexto actual:\n${context}\n\nUsuario: ${message}` : message;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction
      }
    });

    return response.text || "No pude generar una respuesta.";
  } catch (error) {
    console.error("Error chat assistant:", error);
    return "Lo siento, hubo un problema de conexión. Inténtalo de nuevo.";
  }
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
  const prompt = `
    Actúa como un gestor de proyectos experto en el sector eléctrico.
    Analiza los siguientes datos de un proyecto y proporciona un resumen ejecutivo breve (máximo 100 palabras)
    y 3 recomendaciones puntuales para mejorar la rentabilidad o seguridad.

    Datos del Proyecto:
    Nombre: ${project.name}
    Estado: ${project.status}
    Presupuesto: ${project.budget}€
    Gastos Totales: ${project.transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0)}€
    
    Incidencias Abiertas:
    ${project.incidents.filter(i => i.status === 'Open').map(i => `- ${i.title} (${i.priority})`).join('\n')}

    Stock Crítico (Bajo mínimos):
    ${project.materials.filter(m => m.quantity <= m.minStock).map(m => `- ${m.name}: Quedan ${m.quantity}`).join('\n')}
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });
    return response.text || "Análisis no disponible.";
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return "No se pudo conectar con el asistente de análisis.";
  }
};

export const analyzeDocument = async (base64String: string, mimeType: string = 'image/jpeg'): Promise<any> => {
  // Limpieza del string base64
  const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String;

  const prompt = `
    Analiza este documento (Ticket, Factura o Albarán).
    Extrae los datos financieros clave.

    Devuelve un JSON con esta estructura exacta:
    {
      "comercio": "Nombre del proveedor",
      "fecha": "YYYY-MM-DD",
      "total": Número (importe total),
      "iva": Número (impuestos),
      "categoria": "Material" | "Herramientas" | "Combustible" | "Otros"
    }

    Si detectas items, inclúyelos en "items": [{"name": "...", "quantity": 1, "price": 0}]
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType, 
              data: base64Data
            }
          },
          { text: prompt }
        ]
      }
    });

    let text = response.text || "{}";
    
    // Limpieza de Markdown
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Extracción segura de JSON
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        text = text.substring(firstBrace, lastBrace + 1);
    }
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error analyzing document:", error);
    // IMPORTANTE: Devolvemos objeto vacío limpio, sin mensajes de error en los campos
    return { comercio: "", total: 0, categoria: "Otros", items: [] };
  }
};

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    const priceList = JSON.stringify(currentPrices.map(p => `${p.name} (${p.price}€/${p.unit})`));

    const promptText = `
      Genera un presupuesto detallado para una obra eléctrica basado en esta descripción: "${description}".
      
      Usa estos precios de referencia si aplican: ${priceList}
      
      Devuelve un JSON Array:
      [
         {
           "name": "Concepto",
           "unit": "ud/m/h",
           "quantity": 0,
           "pricePerUnit": 0,
           "category": "Material"
         }
      ]
    `;

    const parts: any[] = [{ text: promptText }];
    
    for (const imgBase64 of images) {
        const base64Data = imgBase64.includes(',') ? imgBase64.split(',')[1] : imgBase64;
        parts.push({
            inlineData: {
                mimeType: 'image/jpeg', 
                data: base64Data
            }
        });
    }

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts },
        });
        
        let text = response.text || "[]";
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
             return JSON.parse(text);
        } catch (e) {
            return [];
        }
    } catch (error) {
        console.error("Error generating budget:", error);
        return [];
    }
};

export const parseMaterialsFromInput = async (inputText: string): Promise<PriceItem[]> => {
    const prompt = `
      Extrae materiales, precios y unidades de este texto y devuélvelos como JSON Array:
      "${inputText.substring(0, 5000)}"
      
      Formato: [{"name": "...", "unit": "...", "price": 0, "category": "Material"}]
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        const text = response.text || "[]";
        const items = JSON.parse(text);
        
        return items.map((item: any) => ({
            ...item,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5)
        }));

    } catch (error) {
        console.error("Error parsing materials:", error);
        throw error;
    }
};

export const parseMaterialsFromImage = async (base64Image: string): Promise<PriceItem[]> => {
  const base64Data = base64Image.split(',')[1]; 

  const prompt = `
    Extrae materiales y precios de esta imagen de tarifa/catálogo.
    Devuelve JSON Array: [{"name": "...", "unit": "...", "price": 0, "category": "Material"}]
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            { text: prompt }
        ]
      }
    });

    let text = response.text || "[]";
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const items = JSON.parse(text);
    return items.map((item: any) => ({
        ...item,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5)
    }));
  } catch (error) {
    console.error("Error parsing materials from image:", error);
    throw error;
  }
};