/** Parse without URL normalization: dot segments, escapes and queries are not aliases. */
export function themeAddress(raw: string): { uri: string; id: string } {
  const match = /^silan:\/\/themes\/([a-z][a-z0-9-]*)(?:\/theme\.json)?$/.exec(raw);
  if (!match) throw new Error(`Invalid theme address: ${raw}`);
  return { uri: `silan://themes/${match[1]}`, id: match[1] };
}
