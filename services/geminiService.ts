import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Project, PriceItem } from "../types";

// --- CONFIGURACIÓN DE API ---
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GOOGLE_GENERATIVE_AI_API_KEY || ''; 
const genAI = new GoogleGenAI({ apiKey });

// --- ESTRATEGIA DE MODELOS (ROBUSTEZ) ---
// CAMBIO IMPORTANTE: Arquitectura actualizada para mejor visión y razonamiento.
// Primary: 3.1 Flash Lite Preview (Muy rápido y con mayor cuota para escaneos masivos).
// Fallback: 3.1 Pro Preview (El más capaz, por si el lite falla en documentos complejos).
const MODEL_PRIMARY = 'gemini-3.1-flash-lite-preview';
const MODEL_FALLBACK = 'gemini-3.1-pro-preview'; 

// Estado Global del Modelo (Sticky Strategy)
// Si el modelo primario falla por cuota, nos quedamos en el fallback un tiempo
// para evitar intentar y fallar en cada documento del lote.
let activeModel = MODEL_PRIMARY;
let modelResetTimer: NodeJS.Timeout | null = null;

const switchToFallback = () => {
    if (activeModel === MODEL_FALLBACK) return; // Ya estamos en fallback
    
    console.log(`[Oniluz iA] 📉 Activando modo Fallback (${MODEL_FALLBACK}) por 2 minutos.`);
    activeModel = MODEL_FALLBACK;
    
    // Cancelar timer anterior si existe
    if (modelResetTimer) clearTimeout(modelResetTimer);
    
    // Volver a intentar el modelo primario después de 2 minutos
    modelResetTimer = setTimeout(() => {
        console.log(`[Oniluz iA] 📈 Intentando restaurar modelo Primario (${MODEL_PRIMARY}).`);
        activeModel = MODEL_PRIMARY;
        modelResetTimer = null;
    }, 120000); // 2 minutos
};

// --- SISTEMA DE CACHÉ ---
const responseCache = new Map<string, { timestamp: number, data: any }>();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutos de validez

// --- SISTEMA DE COLA INTELIGENTE (Circuit Breaker) ---
class RequestQueue {
    private queue: (() => Promise<void>)[] = [];
    private processing = false;
    private pausedUntil = 0; // Timestamp hasta cuando detener la cola

    async add<T>(operation: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await operation();
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            });
            this.process();
        });
    }

    public pause(ms: number) {
        const resumeTime = Date.now() + ms;
        console.warn(`[Oniluz iA] 🛑 Cola pausada por ${Math.ceil(ms/1000)}s debido a límites de API.`);
        // Solo extendemos la pausa si el nuevo tiempo es mayor al actual
        if (resumeTime > this.pausedUntil) {
            this.pausedUntil = resumeTime;
        }
    }

    private async process() {
        if (this.processing) return;
        this.processing = true;
        
        while (this.queue.length > 0) {
            // 1. Verificar Circuit Breaker
            const timeLeft = this.pausedUntil - Date.now();
            if (timeLeft > 0) {
                // Esperar el tiempo restante antes de procesar el siguiente
                await new Promise(r => setTimeout(r, timeLeft + 100));
                this.pausedUntil = 0; // Resetear tras espera
            }

            const op = this.queue.shift();
            if (op) {
                await op();
                // Ritmo base para no saturar (1s entre llamadas exitosas)
                // Reducido de 1.5s a 1s para agilizar si estamos en Flash
                await new Promise(r => setTimeout(r, 1000)); 
            }
        }
        
        this.processing = false;
    }
}

const apiQueue = new RequestQueue();

// --- UTILIDADES ---

const cleanAndParseJSON = (text: string): any => {
    try {
        if (!text) return null;
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstOpenBrace = cleanText.indexOf('{');
        const firstOpenBracket = cleanText.indexOf('[');
        let start = -1;
        let end = -1;
        if (firstOpenBrace !== -1 && (firstOpenBracket === -1 || firstOpenBrace < firstOpenBracket)) {
            start = firstOpenBrace;
            end = cleanText.lastIndexOf('}');
        } else if (firstOpenBracket !== -1) {
            start = firstOpenBracket;
            end = cleanText.lastIndexOf(']');
        }
        if (start !== -1 && end !== -1) {
            cleanText = cleanText.substring(start, end + 1);
        }
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("Error parseando JSON de Gemini. Texto recibido:", text);
        return null;
    }
};

const sanitizeNumber = (value: any): number => {
    if (typeof value === 'number' && !isNaN(value)) return value;
    if (!value) return 0;
    const cleanStr = String(value).replace(',', '.').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleanStr);
    return isNaN(parsed) ? 0 : parsed;
};

const optimizeImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        if (!base64Str.startsWith('data:image')) {
             return resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
        }
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const MAX_SIZE = 1024; 
            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.6);
            resolve(optimizedBase64.split(',')[1]); 
        };
        img.onerror = () => resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
    });
};

// --- GESTOR DE REINTENTOS ROBUSTO ---
// Ejecuta la operación pasando el modelo a usar. Gestiona Fallback y 429.
const robustGenerate = async <T>(
    operationBuilder: (model: string) => Promise<T>, 
    allowFallback: boolean = true,
    onStatus?: (msg: string) => void
): Promise<T> => {
    // Usamos el modelo activo globalmente (Sticky Strategy)
    let currentModel = activeModel;
    let attempt = 0;
    const maxRetries = 3;
    const TIMEOUT_MS = 60000; // 60s timeout absoluto por petición

    while (attempt < maxRetries) {
        try {
            // Wrapper con Timeout para evitar bloqueos indefinidos
            const operationPromise = operationBuilder(currentModel);
            const timeoutPromise = new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error("Timeout: La API tardó demasiado en responder.")), TIMEOUT_MS)
            );

            return await Promise.race([operationPromise, timeoutPromise]);

        } catch (error: any) {
            attempt++;
            const errStr = error.toString();
            
            // Detección precisa de error de cuota (429), Timeout o Servidor (500/503)
            const isQuotaError = errStr.includes('429') || error.status === 429 || error.code === 429 || errStr.includes('RESOURCE_EXHAUSTED');
            const isTimeout = errStr.includes('Timeout') || errStr.includes('fetch failed') || errStr.includes('network');
            const isServerError = errStr.includes('500') || error.status === 500 || error.code === 500 || errStr.includes('503') || error.status === 503;
            const isBadRequest = errStr.includes('400') || error.status === 400 || error.code === 400;

            if (isBadRequest) {
                console.error("[Oniluz iA] ❌ Bad Request (400) — Error de payload, no se reintenta.");
                throw error;
}

            if (!isQuotaError && !isTimeout && !isServerError) {
                if (attempt >= maxRetries) throw error;
                // Error genérico, espera exponencial breve
                if (onStatus) onStatus(`⚠️ Error temporal (${attempt}/${maxRetries}). Reintentando en 2s...`);
                await new Promise(r => setTimeout(r, 2000 * attempt));
                continue;
            }

            console.warn(`[Oniluz iA] ⚠️ Problema (${isQuotaError ? 'Cuota' : isTimeout ? 'Timeout' : 'Servidor'}) en ${currentModel}.`);

            // 1. ESTRATEGIA FALLBACK: Cambiar de modelo si es posible
            if (allowFallback && currentModel === MODEL_PRIMARY) {
                const msg = `🔄 Problema en Pro. Cambiando a Flash...`;
                console.log(`[Oniluz iA] ${msg}`);
                if (onStatus) onStatus(msg);
                
                // Activar Sticky Fallback Globalmente
                switchToFallback();
                currentModel = MODEL_FALLBACK;
                
                // Reiniciamos intentos para el nuevo modelo
                attempt = 0; 
                continue;
            }

            // 2. ESTRATEGIA DE ESPERA INTELIGENTE
            let waitMs = 5000 * attempt; // 5s, 10s, 15s
            
            // Extraer "retry in X s" del mensaje de error
            const match = errStr.match(/retry in ([\d\.]+)s/);
            if (match && match[1]) {
                const seconds = parseFloat(match[1]);
                waitMs = Math.ceil(seconds * 1000) + 2000; // Buffer de 2s
                console.log(`[Oniluz iA] ⏳ Google solicita espera de: ${seconds}s`);
            }

            if (attempt >= maxRetries) {
                if (onStatus) onStatus(`❌ Fallo definitivo tras ${maxRetries} intentos.`);
                throw error;
            }

            const waitMsg = `⏳ Esperando ${Math.ceil(waitMs/1000)}s para reintentar (${attempt}/${maxRetries})...`;
            if (onStatus) onStatus(waitMsg);

            // Si la espera es muy larga (> 10s), pausamos toda la cola
            if (waitMs > 10000) {
                apiQueue.pause(waitMs);
            }
            
            await new Promise(r => setTimeout(r, waitMs));
        }
    }
    throw new Error("Servicio IA no disponible tras reintentos.");
};

// --- FUNCIONES PÚBLICAS ---

const fetchResourceAsBase64 = async (url: string, maxRetries = 2): Promise<string> => {
    let attempt = 0;
    while (attempt <= maxRetries) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout per attempt
        
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            const blob = await response.blob();
            if (blob.size === 0) throw new Error("Archivo descargado vacío.");

            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = reader.result as string;
                    if (!result) return reject(new Error("Fallo al leer archivo local."));
                    const base64 = result.includes(',') ? result.split(',')[1] : result;
                    resolve(base64);
                };
                reader.onerror = () => reject(new Error("Error FileReader."));
                reader.readAsDataURL(blob);
            });
        } catch (error: any) {
            clearTimeout(timeoutId);
            attempt++;
            const isTimeout = error.name === 'AbortError' || error.message?.includes('Timeout');
            console.warn(`[Oniluz iA] ⚠️ Error descargando documento (Intento ${attempt}/${maxRetries + 1}): ${error.message}`);
            
            if (attempt > maxRetries) {
                throw new Error(isTimeout ? `Timeout al descargar documento tras ${maxRetries + 1} intentos.` : `Fallo al descargar documento: ${error.message}`);
            }
            // Espera breve antes de reintentar la descarga
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
    throw new Error("Fallo inesperado en fetchResourceAsBase64");
};

export const analyzeDocument = async (input: string | string[], mimeType: string = 'image/jpeg', onStatus?: (msg: string) => void): Promise<any> => {
  const fallbackData = { comercio: "", fecha: new Date().toISOString().split('T')[0], total: 0, iva: 0, categoria: "Material", isStockable: false, description: "Introducir datos manualmente", items: [] };
  
  return apiQueue.add(async () => {
      try {
        const inputs = Array.isArray(input) ? input : [input];
        
        // Validate inputs
        if (inputs.length === 0 || inputs.some(i => !i)) {
            throw new Error("Documento vacío o inválido.");
        }

        const imageParts = await Promise.all(inputs.map(async (inputStr) => {
            let rawBase64 = inputStr;

            // 1. Handle Remote URLs (Supabase Storage, etc.)
            if (inputStr.startsWith('http') || inputStr.startsWith('https')) {
                if (onStatus) onStatus("Descargando documento remoto...");
                rawBase64 = await fetchResourceAsBase64(inputStr);
            }

            let finalBase64 = rawBase64;

            // 2. Optimize if Image
            if (mimeType.startsWith('image/')) {
                // Ensure Data URI format for optimizeImage
                const dataUri = rawBase64.startsWith('data:') ? rawBase64 : `data:${mimeType};base64,${rawBase64}`;
                finalBase64 = await optimizeImage(dataUri);
            } else {
                // For PDF/Other, ensure raw base64
                finalBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
            }
            
            // Sanitize: remove whitespace/newlines
            finalBase64 = finalBase64.replace(/\s/g, '');

            if (!finalBase64) throw new Error("Datos base64 vacíos tras limpieza.");

            return { inlineData: { mimeType: mimeType, data: finalBase64 } };
        }));

        const prompt = `Actúa como el CONTABLE experto. Analiza documento (puede tener múltiples páginas).
        CONTEXTO TEMPORAL: Estamos en el año 2026. Si encuentras fechas con año de 2 dígitos (ej: '24', '25'), asume 2026 si es razonable. NUNCA devuelvas fechas futuras al 2026 (como 2027, 2028, etc) a menos que sea explícitamente claro en el documento. Ante la duda, usa 2026.
        OBJETIVO: Extraer datos y DECIDIR SI LOS ITEMS VAN AL ALMACÉN (Stock).
        CRITERIOS 'isStockable': TRUE para materiales físicos (cables, mecanismos). FALSE para servicios, comida, gasolina, herramientas.
        IMPORTANTE: Si es una FACTURA RECTIFICATIVA, ABONO o DEVOLUCIÓN, el 'total' debe ser NEGATIVO.
        TOTALES: Si hay múltiples páginas, busca el 'Total a Pagar' definitivo del documento completo. No sumes totales parciales si ya están incluidos en el final.
        CATEGORIAS: Material, Dietas, Transporte, Combustible, Herramienta, Varios, Devolución.
        PAGINACIÓN: Detecta si el documento indica que hay más páginas (ej: "Página 1 de 3", "1/2").
        Extrae items línea por línea de TODAS las páginas.
        
        PARA BASE DE PRECIOS Y MATERIALES:
        Es CRÍTICO diferenciar entre materiales de construcción/reforma (cables, tornillos, tuberías, cemento, mecanismos, etc.) y otros gastos (desayunos, comidas, gasolina, peajes, herramientas, servicios).
        - Para CADA línea, evalúa si es un material de construcción/reforma válido. Si lo es, marca 'isMaterial' como true.
        - Si es comida, bebida (ej. cafés, tostadas, menús, restaurantes), gasolina, servicios, o herramientas, marca 'isMaterial' como false. ¡ESTO ES MUY IMPORTANTE! NUNCA marques un desayuno o comida como material.
        - Extrae 'unitPrice' (precio por unidad sin IVA) y 'discount' (descuento aplicado en %) SOLO si 'isMaterial' es true. Si no es un material de construcción, NO extraigas 'unitPrice' ni 'discount'.`;
        
        const documentSchema = {
            type: Type.OBJECT,
            properties: {
                comercio: { type: Type.STRING },
                fecha: { type: Type.STRING },
                total: { type: Type.NUMBER, description: "Importe total del documento completo." },
                iva: { type: Type.NUMBER },
                categoria: { type: Type.STRING, enum: ['Material', 'Dietas', 'Transporte', 'Combustible', 'Herramienta', 'Varios', 'Devolución'] },
                isStockable: { type: Type.BOOLEAN },
                pagination: { 
                    type: Type.OBJECT,
                    properties: {
                        current: { type: Type.NUMBER },
                        total: { type: Type.NUMBER },
                        hasMore: { type: Type.BOOLEAN }
                    },
                    description: "Información de paginación si existe (ej: Pag 1/3)"
                },
                items: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            quantity: { type: Type.NUMBER },
                            unit: { type: Type.STRING },
                            price: { type: Type.NUMBER, description: "Precio total de la línea" },
                            unitPrice: { type: Type.NUMBER, description: "Precio unitario SIN IVA (solo si isMaterial es true)" },
                            discount: { type: Type.NUMBER, description: "Descuento en % (solo si isMaterial es true)" },
                            isMaterial: { type: Type.BOOLEAN, description: "TRUE solo si es material de construcción/reforma o consumible de obra (ej. tornillos, cables). FALSE para comida, gasolina, herramientas, servicios." }
                        }
                    }
                }
            },
            required: ["comercio", "total", "items", "categoria", "isStockable"]
        };

        const response = await robustGenerate(async (model) => {
            // Ensure contents is an array of parts to avoid ambiguity
            return genAI.models.generateContent({
                model: model,
                contents: { 
                    parts: [
                        ...imageParts,
                        { text: prompt }
                    ] 
                },
                config: { 
                    temperature: 0.0, 
                    responseMimeType: 'application/json', 
                    responseSchema: documentSchema,
                    thinkingConfig: { thinkingLevel: 'minimal' }
                }
            });
        }, true, onStatus); // Pass onStatus to robustGenerate

        let result;
        try { result = JSON.parse(response.text || "{}"); } catch { result = cleanAndParseJSON(response.text || "{}"); }
        
        if (result) return { ...fallbackData, ...result, total: sanitizeNumber(result.total), iva: sanitizeNumber(result.iva) };
        throw new Error("JSON inválido");
      } catch (error: any) {
        console.error("Gemini API Error:", error);
        // Enhanced error logging
        if (error.message?.includes('400') || error.status === 400) {
             console.error("Bad Request Details - Check MimeType or Base64 integrity.");
        }
        const isQuotaError = error.toString().includes('429') || (error.status === 429);
        return { ...fallbackData, errorType: isQuotaError ? 'QUOTA' : 'GENERIC', description: isQuotaError ? "Límite de cuota alcanzado." : "Error al procesar" };
      }
  });
};

export const chatWithAssistant = async (message: string, context?: string): Promise<string> => {
  return apiQueue.add(async () => {
      try {
        const response = await robustGenerate(async (model) => {
            return genAI.models.generateContent({
                model: model,
                // ✅ FIX: mismo patrón
                contents: {
                    parts: [{ text: message }]
                },
                config: { 
                    systemInstruction: context || 'Eres un asistente útil.',
                    thinkingConfig: { thinkingLevel: 'minimal' }
                }
            });
        }, true);
        return response.text || "Sin respuesta.";
      } catch (error: any) {
        if (error.toString().includes('429')) return "⚠️ El asistente está durmiendo (429). Inténtalo en 1 minuto.";
        return "El asistente no está disponible.";
      }
  });
};

export const analyzeProjectStatus = async (project: Project): Promise<string> => {
  const cacheKey = `status-${project.id}-${project.status}-${project.budget.toFixed(2)}`;
  const cached = responseCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) return cached.data;

  return apiQueue.add(async () => {
      try {
        const prompt = `Analiza: ${project.name}, Estado: ${project.status}, Presupuesto: ${project.budget}, Progreso: ${project.progress}%. Dame 3 consejos breves.`;
        const response = await robustGenerate(async (model) => {
            return genAI.models.generateContent({
                model: model,
                contents: {
                    parts: [{ text: prompt }]
                },
                config: { 
                    systemInstruction: "Consultor senior.",
                    thinkingConfig: { thinkingLevel: 'minimal' }
                }
                
            });
        }, true);
        
        const text = response.text || "";
        responseCache.set(cacheKey, { timestamp: Date.now(), data: text });
        return text;
      } catch (error: any) { return "Análisis no disponible por el momento."; }
  });
};

export const generateSmartBudget = async (description: string, currentPrices: PriceItem[], images: string[] = []): Promise<any[]> => {
    return apiQueue.add(async () => {
        const priceContext = currentPrices.slice(0, 150).map(p => `- ${p.name}: ${p.price}€/${p.unit}`).join('\n');
        
        const systemInstruction = `Eres un INGENIERO DE PRESUPUESTOS. Genera partidas JSON.
        REGLA: Usa PRECIOS_REFERENCIA si coinciden. Si no, estima precio mercado España.
        Devuelve array JSON.`;
        
        const budgetSchema = {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    pricePerUnit: { type: Type.NUMBER },
                    category: { type: Type.STRING }
                },
                required: ["name", "quantity", "unit", "pricePerUnit", "category"]
            }
        };

        const parts: any[] = [
            { text: `PRECIOS_REFERENCIA:\n${priceContext}` },
            { text: `SOLICITUD:\n${description}` }
        ];
        
        if (images.length > 0) {
            const optimizedImg = await optimizeImage(images[0]);
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedImg } });
        }

        const response = await robustGenerate(async (model) => {
            return genAI.models.generateContent({
                model: model,
                contents: { parts },
                config: { 
                    temperature: 0.3, 
                    systemInstruction, 
                    responseMimeType: 'application/json', 
                    responseSchema: budgetSchema
                }
            });
        }, true);

        let result;
        try {
            result = JSON.parse(response.text || "[]");
        } catch (e) {
            result = cleanAndParseJSON(response.text || "[]");
        }
        
        const rawItems = Array.isArray(result) ? result : [];
        return rawItems.map((item: any) => ({
            ...item,
            quantity: sanitizeNumber(item.quantity),
            pricePerUnit: sanitizeNumber(item.pricePerUnit)
        }));
    });
};

// ✅ FIX: parseMaterialsFromInput
export const parseMaterialsFromInput = async (textInput: string): Promise<PriceItem[]> => {
    return apiQueue.add(async () => {
        try {
            const prompt = `Analiza texto tarifa: "${textInput}". Extrae JSON array.
            OBJETIVO: Detectar precios. Si hay PAQUETES (ej: Caja 100), extrae TAMBIÉN el precio unitario si es calculable.
            FORMATO: { name, unit, price, category, discount }.
            Si detectas paquete, genera 2 items: 1 por la caja, 1 por la unidad (calculado).`;
            
            const materialsSchema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        unit: { type: Type.STRING },
                        price: { type: Type.NUMBER },
                        category: { type: Type.STRING },
                        discount: { type: Type.NUMBER }
                    },
                    required: ["name", "unit", "price", "category"]
                }
            };

            const response = await robustGenerate(async (model) => {
                return genAI.models.generateContent({ 
                    model: model, 
                    // ✅ FIX: contents como objeto estructurado, NO string directo
                    contents: {
                        parts: [{ text: prompt }]
                    },
                    config: { 
                        temperature: 0.3, 
                        systemInstruction, 
                        responseMimeType: 'application/json', 
                        responseSchema: budgetSchema,
                        thinkingConfig: { thinkingLevel: 'minimal' }  // ✅ AÑADIR esto
                    }
                });
            }, true);

            const result = cleanAndParseJSON(response.text || "[]");
            return (Array.isArray(result) ? result : []).map((item: any) => ({
                ...item,
                price: sanitizeNumber(item.price),
                discount: sanitizeNumber(item.discount)
            }));
        } catch (e) {
            console.error("Error parsing materials:", e);
            return [];
        }
    });
};

export const parseMaterialsFromImage = async (input: string | string[]): Promise<PriceItem[]> => {
    return apiQueue.add(async () => {
        try {
            const inputs = Array.isArray(input) ? input : [input];
            const imageParts = await Promise.all(inputs.map(async (imgStr) => {
                const cleanBase64 = await optimizeImage(imgStr);
                return { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } };
            }));

            const prompt = `Analiza imágenes de TARIFA DE PRECIOS. Extrae JSON array.
            OBJETIVO: Detectar precios. Si hay PAQUETES (ej: Caja 100, Pack 50), extrae TAMBIÉN el precio unitario si es calculable.
            Ejemplo: "Caja 100 tornillos 10€" -> Genera item "Caja 100 tornillos" (10€/caja) Y "Tornillo suelto" (0.10€/ud).
            FORMATO: { name, unit, price, category, discount }.
            price=PVP. discount=%.`;
            
            const materialsSchema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        unit: { type: Type.STRING },
                        price: { type: Type.NUMBER },
                        category: { type: Type.STRING },
                        discount: { type: Type.NUMBER }
                    },
                    required: ["name", "unit", "price", "category"]
                }
            };

            const response = await robustGenerate(async (model) => {
                return genAI.models.generateContent({
                    model: model,
                    contents: {
                        parts: [
                            ...imageParts,
                            { text: prompt }
                        ]
                    },
                    config: { 
    responseMimeType: 'application/json', 
    responseSchema: materialsSchema,
    thinkingConfig: { thinkingLevel: 'minimal' }  // ✅ AÑADIR
}
                });
            }, true);

            const result = JSON.parse(response.text || "[]");
            return (Array.isArray(result) ? result : []).map((item: any) => ({
                ...item,
                price: sanitizeNumber(item.price),
                discount: sanitizeNumber(item.discount)
            }));
        } catch (e) { return []; }
    });
};

/**
 * REEMPLAZO TOTAL: CÁLCULO DE DISTANCIA ROBUSTO (NO IA)
 * Usamos OpenStreetMap (Nominatim + OSRM) para evitar errores 429 de Gemini.
 * Es gratis, no requiere API Key (para uso moderado) y es exacto.
 */
export const parseMaterialsFromText = async (text: string): Promise<PriceItem[]> => {
    return parseMaterialsFromInput(text);
};
export const calculateDrivingDistance = async (destination: string): Promise<number> => {
    // No pasamos por la cola de API de Gemini porque esto es una petición fetch estándar.
    try {
        console.log(`[Oniluz Map] Calculando ruta a: ${destination}`);
        
        // 1. GEOCODIFICACIÓN (Obtener coordenadas de Oropesa y Destino)
        // Coordenadas fijas de Oropesa, Toledo (aproximadas para el centro)
        // Optimizamos ahorrando una llamada a la API.
        const originLat = 39.9198;
        const originLon = -5.1763;

        // Buscar coordenadas del destino con Nominatim
        const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}&limit=1`;
        const geoResponse = await fetch(geoUrl, {
            headers: { 'User-Agent': 'OniluzApp/1.0' } // Buena práctica para OSM
        });
        
        if (!geoResponse.ok) throw new Error("Error en servicio de geocodificación");
        
        const geoData = await geoResponse.json();

        if (!geoData || geoData.length === 0) {
            console.warn("[Oniluz Map] Destino no encontrado.");
            return 0;
        }

        const destLat = geoData[0].lat;
        const destLon = geoData[0].lon;

        // 2. ENRUTAMIENTO (OSRM) para obtener distancia de conducción real
        // OSRM usa formato: lon,lat;lon,lat
        const routerUrl = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?overview=false`;
        
        const routerResponse = await fetch(routerUrl);
        if (!routerResponse.ok) throw new Error("Error en servicio de rutas");

        const routerData = await routerResponse.json();

        if (routerData.code !== 'Ok' || !routerData.routes || routerData.routes.length === 0) {
            console.warn("[Oniluz Map] No se pudo calcular la ruta.");
            return 0;
        }

        const meters = routerData.routes[0].distance;
        const km = Math.round(meters / 1000);
        
        console.log(`[Oniluz Map] Distancia calculada: ${km} km`);
        return km;

    } catch (error) {
        console.error("[Oniluz Map] Error fatal calculando distancia:", error);
        return 0;
    }
};