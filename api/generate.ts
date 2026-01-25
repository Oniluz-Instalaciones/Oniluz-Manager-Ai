import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: 'edge', // Usamos Edge Functions para menor latencia
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { model, contents, config } = await req.json();
    
    // La API Key ahora se lee de las variables de entorno del servidor (Vercel)
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
        return new Response(JSON.stringify({ 
            error: 'Configuration Error: API Key not found on server.' 
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const genAI = new GoogleGenAI({ apiKey });
    
    // Llamada segura a Google Gemini desde el servidor
    const response = await genAI.models.generateContent({
        model: model || 'gemini-2.5-flash',
        contents,
        config
    });

    // Devolvemos solo el texto generado para optimizar el ancho de banda
    return new Response(JSON.stringify({ text: response.text }), {
        headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("AI Gateway Error:", error);
    return new Response(JSON.stringify({ 
        error: error.message || 'Internal Server Error',
        details: error.toString()
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}