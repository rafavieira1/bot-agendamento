import { chat } from './openai.js';

// Cliente simulado. Vê só as mensagens visíveis do bot e responde como o cliente.
// visivel: array de { who: 'bot'|'cliente', text }. Retorna a próxima fala do cliente.
// Se decidir encerrar, retorna a string contendo o token <STOP>.
export async function customerReply({ env, cliente, visivel, hoje }) {
  const sys = `Voce esta SIMULANDO um cliente do WhatsApp de uma clinica de exames ocupacionais, conversando com um atendente (bot). NUNCA revele que e um teste ou uma IA. Responda curto e natural, como cliente real no WhatsApp.

SEU PERFIL: ${cliente.persona}
SEU OBJETIVO: ${cliente.objetivo}
COMO SE COMPORTAR: ${cliente.comportamento}
DATA DE HOJE: ${hoje}

DADOS QUE VOCE TEM (forneca SOMENTE quando o atendente pedir o dado correspondente; pode mandar varios juntos se fizer sentido):
${JSON.stringify(cliente.fatos, null, 2)}

REGRAS:
- Responda APENAS com a sua proxima mensagem de cliente (sem aspas, sem rotulo).
- Quando seu objetivo for atingido (ex: agendamento confirmado pelo atendente) OU voce decidir desistir, responda com sua ultima fala seguida de " <STOP>".
- Nao invente dados que nao estao na sua lista; se o atendente pedir algo que voce nao tem, improvise de forma plausivel e curta.`;

  const messages = [{ role: 'system', content: sys }];
  // do ponto de vista do cliente: bot = 'user' (quem fala com ele), cliente = 'assistant'
  for (const m of visivel) messages.push({ role: m.who === 'bot' ? 'user' : 'assistant', content: m.text });
  if (visivel.length === 0 || visivel[visivel.length - 1].who === 'cliente') {
    messages.push({ role: 'user', content: '(o atendente ainda nao respondeu; inicie a conversa)' });
  }

  const r = await chat(env, { model: 'gpt-4.1-mini', messages, max_tokens: 200 });
  return (r.content || '').trim();
}
