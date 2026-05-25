// Parser do payload entrante da Avisa API (WhatsApp não-oficial).
//
// Avisa envia o webhook como application/x-www-form-urlencoded com 2 campos:
//   token=<token da instância>
//   jsonData=<JSON urlencoded do evento>
//
// Estrutura de jsonData (após JSON.parse):
//   { event: { type: "Message", Info: {...}, Message: {...} } }
//
// Retorna objeto normalizado ou { skip: true, reason } se a msg deve ser ignorada.

export function parseAvisaWebhook(body, { expectedToken } = {}) {
  if (!body || typeof body !== 'object') {
    return { skip: true, reason: 'empty_body' };
  }

  if (expectedToken && body.token !== expectedToken) {
    return { skip: true, reason: 'token_mismatch' };
  }

  let payload;
  const raw = body.jsonData;
  if (!raw) return { skip: true, reason: 'missing_jsonData' };

  if (typeof raw === 'string') {
    try { payload = JSON.parse(raw); }
    catch { return { skip: true, reason: 'invalid_json' }; }
  } else {
    payload = raw;
  }

  // Avisa real payload: { event: {Info, Message, ...}, type: "Message" }
  // Defensivo: aceita também shape com `type` aninhado dentro de event.
  const eventType = payload?.type ?? payload?.event?.type;
  if (eventType !== 'Message') return { skip: true, reason: `event_type:${eventType}` };

  const event = payload?.event;
  if (!event) return { skip: true, reason: 'missing_event' };

  const info = event.Info || {};
  if (info.IsFromMe) return { skip: true, reason: 'from_me' };
  if (info.IsGroup) return { skip: true, reason: 'group' };

  const senderAlt = String(info.SenderAlt || '');
  // strip @s.whatsapp.net e device suffix (ex: ":1" em "5519...:1@s.whatsapp.net")
  const telefone = senderAlt
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/:\d+$/, '')
    .replace(/\D/g, '');
  if (!telefone) return { skip: true, reason: 'missing_sender' };

  const msg = event.Message || {};
  const texto = typeof msg.conversation === 'string' && msg.conversation
    ? msg.conversation
    : msg.extendedTextMessage?.text || '';

  const tipo = texto ? 'text' : detectMediaType(msg);

  return {
    skip: false,
    telefone,
    texto,
    tipo,
    message_id: String(info.ID || ''),
    timestamp: info.Timestamp || null,
    push_name: info.PushName || null,
  };
}

function detectMediaType(msg) {
  if (msg.imageMessage) return 'image';
  if (msg.audioMessage) return 'audio';
  if (msg.videoMessage) return 'video';
  if (msg.documentMessage) return 'document';
  if (msg.stickerMessage) return 'sticker';
  if (msg.locationMessage) return 'location';
  if (msg.contactMessage) return 'contact';
  return 'unknown';
}
