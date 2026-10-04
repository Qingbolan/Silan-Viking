/** UI route projection aligned with EasyNet's BreadcrumbNav and BrowseFilePage.
 * URAs are passed verbatim; resource resolution/authentication belongs to EasyNet.
 */
export type AddressTarget = { href: string; external: boolean; navigation: 'route' | 'document'; label: string };
const EASYNET = 'https://easynet.run';
const collections: Record<string, string> = {
  device: 'devices', agent: 'agents', ability: 'abilities', resource: 'resources', skill: 'resources', page: 'pages',
};
/** Site address: the realm is host[:port], with resource/ followed by the native site route. */
export function siteAddressUra(address: string): string {
  const url = new URL(address);
  return `easynet:///r/${url.host}/resource${url.pathname}${url.search}${url.hash}`;
}

export function resolveAddress(raw: string, origin: string): AddressTarget | null {
  const value = raw.trim();
  if (!value || Array.from(value).some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null;
  const easy = (path: string): AddressTarget => ({ href: EASYNET + path, external: true, navigation: 'document', label: 'EasyNet' });
  if (value.startsWith('easynet:')) {
    const site = value.match(/^easynet:\/\/\/r\/([^/?#]+)\/resource(\/.*)$/);
    if (site && site[1] === new URL(origin).host) {
      // Resolve through the same URL guard; never allow a path to change authority.
      const target = resolveAddress(site[2], origin);
      return target && !target.external ? target : null;
    }
    const collection = value.match(/^easynet:\/\/\/r\/[^/?#]+\/(?:user\/[^/?#]+\/)?(device|agent|ability|resource|skill|page)\/?$/);
    if (collection) return easy(`/control_plane/${collections[collection[1]]}`);
    const identity = value.match(/^easynet:\/\/\/r\/[^/?#]+\/(device|agent)\/[^/?#]+$/);
    if (identity) return easy(`/control_plane/${collections[identity[1]]}/${encodeURIComponent(value)}`);
    const ability = value.match(/^easynet:\/\/\/r\/[^/?#]+\/ability\/([^. /]+)\.([^. /]+)\.([^/?#]+)$/);
    if (ability) return easy(`/control_plane/abilities/${encodeURIComponent(ability[1] === 'hub' ? `${ability[2]}.${ability[3]}` : ability[3])}`);
    if (/^easynet:\/\/\/r\/[^/?#]+\/resource\/[^/?#]+\/.+/.test(value)) return easy(`/browser/ura?ura=${encodeURIComponent(value)}`);
    return null;
  }
  if (!/^https?:\/\//i.test(value) && !/^\/(?![/\\])/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const internal = url.origin === origin;
    const file = url.pathname === '/api/v1/media' ? url.searchParams.get('f') || '' : url.pathname;
    const video = /\.(mp4|webm|mov|m4v)$/i.test(file);
    const image = /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i.test(file);
    const media = image || video || url.pathname === '/api/v1/media' || url.pathname.startsWith('/api/v1/feedback-media/');
    const label = video ? 'Video' : image ? 'Image' : media ? 'Media' : /^\/(?:zh\/)?moments(?:\/|$)/.test(url.pathname) ? 'Moment' : 'Silan';
    return { navigation: internal && !media ? 'route' : 'document', href: internal ? `${url.pathname}${url.search}${url.hash}` : url.href, external: !internal, label: internal ? label : url.host };
  } catch { return null; }
}
