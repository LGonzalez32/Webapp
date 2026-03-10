import { ChatMessage } from '../types';

export async function sendMessage(
  userMessage: string,
  apiKey: string,
  analysisContext: string,
  history: ChatMessage[] = []
): Promise<string> {
  if (!apiKey) {
    throw new Error('API key no configurada');
  }

  const systemPrompt = `Eres un asistente experto en análisis de ventas y riesgo comercial para empresas distribuidoras y equipos de ventas en Latinoamérica.

Respondes en español directo y conciso, sin jerga técnica.
Máximo 4 párrafos cortos. Usas emojis con moderación.
Siempre priorizas lo urgente primero.
Cuando detectes riesgos críticos, propón acciones concretas.

DATOS ACTUALES DEL NEGOCIO:
${analysisContext}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map(m => ({
      role: m.role,
      content: m.content
    })),
    { role: 'user', content: userMessage }
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 600,
        messages
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      if (response.status === 401) {
        throw new Error('API key inválida. Configúrala en Ajustes → Configuración.');
      } else if (response.status === 429) {
        throw new Error('Demasiadas solicitudes. Espera un momento.');
      } else {
        throw new Error(errorData.error?.message || 'Error en la API de OpenAI');
      }
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error: any) {
    if (error.name === 'TypeError') {
      throw new Error('Error de conexión. Verifica tu internet.');
    }
    throw error;
  }
}
