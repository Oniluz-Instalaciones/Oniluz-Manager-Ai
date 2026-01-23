import { GoogleGenAI, Type } from "@google/genai";
import { Project, PriceItem } from "../types";
import { PRICE_DATABASE } from "../constants";

// --- CONFIGURACIÓN DIRECTA ---
// IMPORTANTE: REEMPLAZA EL TEXTO DE ABAJO CON TU API KEY REAL DE GOOGLE AI STUDIO
const apiKey = 'PEGA_AQUI_TU_LLAVE_QUE_EMPIEZA_POR_AIza'; 

const ai = new GoogleGenAI({ apiKey });

// Función para el Chat Global (Nuevo botón)
export const chatWithAssistant = async (message: string, context?: string): Promise<string> => {
  try {
    const systemInstruction = `Eres Oniluz AI, un asistente experto para empresas eléctricas. 
    Ayudas a gestionar obras, materiales, normativas (REBT) y finanzas. 
    Responde de forma breve, profesional y útil.`;

    const prompt = context ? `Contexto actual:\n${context}\n\nUsuario: ${message}` : message;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction
      }
    });

    return response.text || "No pude generar una respuesta.";
  } catch (error) {
    console.error("Error chat assistant:", error);
    return "Error de conexión con la IA. Verifica tu API Key.";
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
    Ingresos Totales: ${project.transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0)}€
    
    Incidencias Abiertas:
    ${project.incidents.filter(i => i.status === 'Open').map(i => `- ${i.title} (${i.priority})`).join('\n')}

    Stock Crítico (Bajo mínimos):
    ${project.materials.filter(m => m.quantity <= m.minStock).map(m => `- ${m.name}: Quedan ${m.quantity}`).join('\n')}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
    });
    return response.text || "No se pudo generar el análisis.";
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return "Error al conectar con el servicio de IA. Inténtelo más tarde.";
  }
};

export const analyzeReceiptImage = async (base64Image: string): Promise<any> => {
  const base64Data = base64Image.split(',')[1];

  const prompt = `
    Analiza esta imagen (ticket, factura, albarán o foto de material) para una empresa eléctrica.
    
    Tu objetivo PRINCIPAL es extraer el listado de materiales y sus CANTIDADES exactas para el control de stock.
    
    Extrae un JSON con esta estructura:
    1. "amount": Importe total del documento (número).
    2. "date": Fecha (YYYY-MM-DD).
    3. "description": Nombre del proveedor.
    4. "category": Categoría (Material, Herramienta, Varios).
    5. "items": Array con cada línea de material detectada. Para cada item:
       - "name": Descripción del producto.
       - "quantity": LA CANTIDAD EXACTA (número). Busca columnas "Cant", "Uds", "Qty" o números a la izquierda de la descripción (ej: "20x Tubo"). Si pone "100m Cable", cantidad es 100.
       - "unit": Unidad (m, ud, kg, caja, pack).
       - "pricePerUnit": Precio unitario (si aparece).
    
    IMPORTANTE: 
    - No asumas cantidad 1 si ves un número explícito indicando más cantidad.
    - Si detectas "Caja de 50 tacos", el nombre es "Tacos" y la cantidad es 50 (o nombre "Caja tacos" cantidad 1, decide lo más lógico para stock).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg', 
              data: base64Data
            }
          },
          { text: prompt }
        ]
      }
    });

    let text = response.text || "{}";
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error analyzing receipt:", error);
    throw error;
  }
};

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    const priceList = JSON.stringify(currentPrices.map(p => `${p.name} (${p.price}€/${p.unit})`));

    const promptText = `
      Actúa como un estimador de presupuestos eléctricos experto.
      
      ${images.length > 0 ? "He adjuntado imágenes/planos de la obra." : ""}
      Basándote en la siguiente descripción y las imágenes proporcionadas (si las hay), genera una lista de partidas presupuestarias detallada.
      
      Descripción de la obra: "${description}"

      Aquí tienes una lista de precios de referencia de mi base de datos actual:
      ${priceList}

      Instrucciones:
      1. Prioriza SIEMPRE los elementos de la base de datos si encajan.
      2. Si necesitas materiales que no están en la lista, estima un precio de mercado realista en España.
      3. Incluye siempre mano de obra estimada.
      4. Si hay imágenes de planos, intenta contar los puntos de luz, enchufes, etc.
      5. Devuelve SOLAMENTE un JSON array con objetos que tengan esta estructura:
         {
           "name": "Nombre del concepto",
           "unit": "ud" o "m" o "h",
           "quantity": número,
           "pricePerUnit": número,
           "category": "Material" o "Mano de Obra" o "Trámites"
         }
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
            model: 'gemini-1.5-flash',
            contents: { parts },
            config: {}
        });
        
        let text = response.text || "[]";
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
             return JSON.parse(text);
        } catch (e) {
            console.warn("JSON parsing failed, returning empty array. Raw text:", text);
            return [];
        }

    } catch (error) {
        console.error("Error generating budget:", error);
        throw error;
    }
};

export const parseMaterialsFromInput = async (inputText: string): Promise<PriceItem[]> => {
    const prompt = `
      Analiza el siguiente texto. Puede ser contenido copiado de una web de suministros eléctricos, un PDF de tarifas, o una lista informal.
      Extrae todos los materiales, precios y unidades que encuentres.

      Texto a analizar:
      "${inputText.substring(0, 10000)}"

      Instrucciones:
      1. Normaliza los nombres (ej: "CABLE RV-K" -> "Cable RV-K").
      2. Detecta la unidad (m, ud, h, pack). Si no se especifica, asume "ud".
      3. Extrae el precio numérico.
      4. Asigna una categoría lógica (Material, Herramienta, Mano de Obra).
      5. Devuelve un JSON Array con objetos PriceItem: { "name": string, "unit": string, "price": number, "category": string }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            unit: { type: Type.STRING },
                            price: { type: Type.NUMBER },
                            category: { type: Type.STRING }
                        }
                    }
                }
            }
        });

        let text = response.text || "[]";
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
    Analiza esta imagen de una tarifa de precios o catálogo de material eléctrico.
    Extrae todos los materiales, precios y unidades que encuentres.
    
    Instrucciones:
    1. Normaliza los nombres (ej: "CABLE RV-K" -> "Cable RV-K").
    2. Detecta la unidad (m, ud, h, pack). Si no se especifica, asume "ud".
    3. Extrae el precio numérico.
    4. Asigna una categoría lógica (Material, Herramienta, Mano de Obra).
    5. Devuelve SOLAMENTE un JSON Array con objetos que sigan esta estructura exacta:
       [ { "name": string, "unit": string, "price": number, "category": string } ]
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
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