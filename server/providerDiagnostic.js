// Server-only, bounded diagnostics. Never return raw provider bodies to the browser.
export function safeProviderMessage(value, secret) {
  let message = typeof value === 'string' ? value : '';
  if (secret) message = message.split(secret).join('[REDACTED]');
  return message.replace(/AIza[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/https?:\/\/\S+/g, '[URL removed]')
    .replace(/(?:x-goog-api-key|authorization|api[_-]?key|access[_-]?token)\s*["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '[credential removed]')
    .replace(/(?:request|headers|payload|prompt|input|body)\s*["']?\s*[:=][\s\S]*/gi, '[request details omitted]')
    .split(/[\r\n]/)[0].slice(0, 320);
}

export async function providerDiagnostic(response, secret) {
  let text = '', size = 0;
  const reader = response.body?.getReader();
  if (reader) {
    const chunks = [];
    try {
      while (true) {
        const {done,value} = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 16000) { await reader.cancel(); break; }
        chunks.push(Buffer.from(value));
      }
      if (size <= 16000) text = Buffer.concat(chunks).toString('utf8');
    } catch { /* do not expose parser/network details */ }
    finally { reader.releaseLock(); }
  }
  let error;
  try { error = JSON.parse(text)?.error; } catch { /* non-JSON error */ }
  const code = value => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && !(secret && value.includes(secret)) && /^[A-Za-z0-9_.-]{1,80}$/.test(value) && !value.includes('AIza') ? value : null;
  return { source:'gemini', httpStatus:response.status,
    status:code(error?.status ?? error?.type), code:code(error?.code),
    message:safeProviderMessage(error?.message,secret) || 'No safe provider error message available.' };
}
