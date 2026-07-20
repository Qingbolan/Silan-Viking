// mapContentParts — normalize the backend `parts` payload.
//
// Every detail endpoint (idea, project, …) returns a `parts` array in the
// type-agnostic ContentPart shape, in snake_case. This maps it to the
// camelCase `ContentPart` the frontend uses. The list is data-driven: it is
// whatever Parts the Item has, in `sort_order` — no role is assumed.
import type { ContentPart, ContentEntry } from '../types';

/** Map one raw entry of an `entry_list` Part. */
function mapEntry(raw: any): ContentEntry {
  return {
    id: raw.id ?? '',
    entryId: raw.entry_id ?? raw.entryId ?? '',
    sortOrder: raw.sort_order ?? raw.sortOrder ?? 0,
    sharedPayload: raw.shared_payload ?? raw.sharedPayload ?? {},
    localizedPayload: raw.localized_payload ?? raw.localizedPayload ?? {},
  };
}

/** Map the backend `parts` array, or `[]` when the field is absent. */
export function mapContentParts(raw: any): ContentPart[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p: any) => ({
    id: p.id ?? '',
    partId: p.part_id ?? p.partId ?? '',
    role: p.role ?? '',
    shape: p.shape ?? 'prose',
    sortOrder: p.sort_order ?? p.sortOrder ?? 0,
    canonicalLang: p.canonical_lang ?? p.canonicalLang ?? 'en',
    body: p.body ?? {},
    entries: Array.isArray(p.entries) ? p.entries.map(mapEntry) : [],
  }));
}
