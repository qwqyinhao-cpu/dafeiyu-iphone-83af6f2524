const allowed = new Set(['gentle', 'scene', 'fresh']);
export function voiceFilename(data, pack, text) {
  if (!allowed.has(pack) || typeof text !== 'string') return null;
  const entries = Array.isArray(data.entries) ? data.entries.slice(0, 64) : [];
  const entry = entries.find(e => e && e.pack === pack && (e.text === text || e.preview_key === text));
  const file = entry?.mp3 || data.packs?.[pack]?.triggers?.[text];
  return typeof file === 'string' && /^[a-z0-9-]+\.mp3$/.test(file) ? file : null;
}
export function recordedText(data, pack, text, enabled) {
  if (!enabled || !allowed.has(pack)) return text;
  const replacement = data.packs?.[pack]?.display_aliases?.[text];
  return typeof replacement === 'string' && replacement.length <= 400 ? replacement : text;
}
