import type { VideoProvider } from '../entities/product';

export interface ParsedVideo {
  readonly provider: VideoProvider;
  readonly videoId: string;
}

const YOUTUBE_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d+$/;
/** Esquema, servidor, ruta y consulta; el fragmento se ignora. */
const URL_PARTS = /^(https?):\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i;

/**
 * El video de un enlace de YouTube o Vimeo (FR-018), o `null` si no es de una plataforma admitida
 * o no nombra un video. Se analiza a mano, sin depender del `URL` del entorno: el dominio corre
 * igual en el navegador y en las Functions.
 */
export function parseVideoUrl(raw: string): ParsedVideo | null {
  const parts = URL_PARTS.exec(raw.trim());
  if (!parts) return null;
  const host = (parts[2] ?? '').toLowerCase().replace(/^(?:www|m)\./, '');
  const path = (parts[3] ?? '').split('/').filter((segment) => segment !== '');
  const query = new Map(
    (parts[4] ?? '')
      .split('&')
      .map((pair) => pair.split('='))
      .map(([key = '', value = '']) => [key, value] as const),
  );

  switch (host) {
    case 'youtube.com': {
      const id = path[0] === 'watch' ? query.get('v') : path[0] === 'shorts' ? path[1] : undefined;
      return video('youtube', id, YOUTUBE_ID);
    }
    case 'youtu.be':
      return video('youtube', path[0], YOUTUBE_ID);
    case 'vimeo.com':
      return video('vimeo', path[0], VIMEO_ID);
    case 'player.vimeo.com':
      return path[0] === 'video' ? video('vimeo', path[1], VIMEO_ID) : null;
    default:
      return null;
  }
}

function video(provider: VideoProvider, id: string | undefined, form: RegExp): ParsedVideo | null {
  return id !== undefined && form.test(id) ? { provider, videoId: id } : null;
}
