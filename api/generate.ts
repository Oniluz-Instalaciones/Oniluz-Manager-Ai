// Este archivo se mantiene solo para compatibilidad de estructura.
// La lógica principal se ha movido al cliente (services/geminiService.ts) para evitar
// errores de Timeouts y Runtime en la capa gratuita de Vercel.

export default async function handler(req: any, res: any) {
  return res.status(200).json({ 
      status: 'ok', 
      message: 'Client-side processing enabled' 
  });
}