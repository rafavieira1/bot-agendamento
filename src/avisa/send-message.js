// Builders puros para chamadas à Avisa API. Sem fetch — devolvem
// { url, method, headers, body } pra ser executado pelo n8n HTTP node
// (ou pelo Vitest com fetch mockado).
//
// Rate limit Avisa: 240 req/min (declarado na doc). Sem retry/backoff aqui —
// camada chamadora decide.

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function trimSlash(s) {
  return String(s || '').replace(/\/+$/, '');
}

export function buildSendTextRequest({ baseUrl, token, telefone, texto, replyTo }) {
  if (!baseUrl) throw new Error('baseUrl required');
  if (!token) throw new Error('token required');
  if (!telefone) throw new Error('telefone required');
  if (!texto) throw new Error('texto required');

  const number = String(telefone).replace(/\D/g, '');
  const body = { number, message: String(texto) };
  if (replyTo?.message_id && replyTo?.participant) {
    body.contextInfo = {
      StanzaId: replyTo.message_id,
      Participant: replyTo.participant,
    };
  }
  return {
    url: `${trimSlash(baseUrl)}/actions/sendMessage`,
    method: 'POST',
    headers: authHeaders(token),
    body,
  };
}

export function buildMarkReadRequest({ baseUrl, token, message_id, chat }) {
  if (!message_id) throw new Error('message_id required');
  return {
    url: `${trimSlash(baseUrl)}/actions/markreadMessage`,
    method: 'POST',
    headers: authHeaders(token),
    body: { id: message_id, chat },
  };
}

export function buildCheckNumberRequest({ baseUrl, token, telefone }) {
  const number = String(telefone).replace(/\D/g, '');
  return {
    url: `${trimSlash(baseUrl)}/actions/checknumber`,
    method: 'POST',
    headers: authHeaders(token),
    body: { number },
  };
}
