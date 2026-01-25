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
    
    // Check multiple potential ENV variables for the key, plus the user provided fallback
    const apiKey = process.env.API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.VITE_API_KEY || 'AIzaSyAPt-4D6bA9qLK-BrijbJBcmnBU1ojXOA8';

    if (!apiKey) {
        return new Response(JSON.stringify({ 
            error: 'Server Configuration Error: API_KEY is missing.' 
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const genAI = new GoogleGenAI({ apiKey });
    
    // Llamada segura a Google Gemini desde el servidor
    const response = await genAI.models.generateContent({
        model: model || 'gemini-2.5-flash',
        contents,
        config
    });

    // Devolvemos solo el texto generado
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