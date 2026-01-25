import { GoogleGenAI } from "@google/genai";

// Usamos configuración estándar de Serverless (Node.js) para máxima compatibilidad en Vercel
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { model, contents, config } = req.body;
    
    // Fallback key seguro para evitar fallos si las variables de entorno no están configuradas en Vercel
    const apiKey = process.env.API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.VITE_API_KEY || 'AIzaSyAPt-4D6bA9qLK-BrijbJBcmnBU1ojXOA8';

    if (!apiKey) {
        return res.status(500).json({ error: 'Server Configuration Error: API_KEY is missing.' });
    }

    const genAI = new GoogleGenAI({ apiKey });
    
    // Llamada segura
    const response = await genAI.models.generateContent({
        model: model || 'gemini-3-flash-preview',
        contents,
        config
    });

    return res.status(200).json({ text: response.text });

  } catch (error: any) {
    console.error("AI Gateway Error:", error);
    return res.status(500).json({ 
        error: error.message || 'Internal Server Error'
    });
  }
}