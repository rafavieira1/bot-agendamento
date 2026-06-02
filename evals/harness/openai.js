// POST chat/completions. body já no formato do buildRequest. Lança em erro HTTP.
export async function chat(env, body) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const j = await res.json();
  const choice = j.choices && j.choices[0];
  const msg = choice && choice.message;
  if (!msg) throw new Error('OpenAI sem message: ' + JSON.stringify(j).slice(0, 300));
  const tc = msg.tool_calls && msg.tool_calls[0];
  return {
    content: msg.content || null,
    tool_name: tc ? tc.function.name : null,
    tool_args_raw: tc ? tc.function.arguments : null,
    tool_call_id: tc ? tc.id : null,
    has_tool_call: !!tc,
    finish_reason: choice.finish_reason,
  };
}
