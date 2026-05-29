import type { Mensagem } from '../lib/supabase';

export function MessageBubble({ msg }: { msg: Mensagem }) {
  const isUser = msg.papel === 'user';
  const isHuman = msg.papel === 'humano';
  const isTool = msg.papel === 'tool';
  const isSystem = msg.papel === 'system';

  if (isTool || isSystem) return null;
  if (msg.papel === 'assistant' && !msg.conteudo) return null;

  const align = isUser ? 'justify-start' : 'justify-end';
  const bubbleCls = isUser
    ? 'bg-white border border-ink-100 text-ink-900'
    : isHuman
      ? 'bg-brand text-white border border-brand-deep'
      : 'bg-accent text-white border border-accent-deep';
  const label = isUser ? 'Cliente' : isHuman ? 'Atendente' : 'Bot';
  const labelCls = isUser ? 'text-ink-400' : 'text-white/80';
  const timeCls = isUser ? 'text-ink-300' : 'text-white/60';

  return (
    <div className={`flex ${align} my-1.5`}>
      <div
        className={`${bubbleCls} rounded-card shadow-card px-3.5 py-2 max-w-[78%] text-sm leading-relaxed`}
      >
        <div className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 ${labelCls}`}>
          {label}
        </div>
        <div className="whitespace-pre-wrap break-words">{msg.conteudo || ''}</div>
        <div className={`text-[10px] mt-1 text-right ${timeCls}`}>
          {new Date(msg.created_at).toLocaleString('pt-BR')}
        </div>
      </div>
    </div>
  );
}
