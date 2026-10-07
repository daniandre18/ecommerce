import { describe, expect, it } from 'vitest';
import { parseVideoUrl } from './video-url';

// T021 — FR-018: solo YouTube y Vimeo; se guarda el id del video, no la URL.
describe('parseVideoUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'youtube', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'youtube', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['  https://vimeo.com/76979871  ', 'vimeo', '76979871'],
    ['https://player.vimeo.com/video/76979871', 'vimeo', '76979871'],
    ['http://vimeo.com/76979871', 'vimeo', '76979871'],
  ])('%s → %s %s', (url, provider, videoId) => {
    expect(parseVideoUrl(url)).toEqual({ provider, videoId });
  });

  it.each([
    ['otra plataforma', 'https://www.dailymotion.com/video/x7tgad0'],
    ['un canal, no un video', 'https://www.youtube.com/channel/UC38IQsAvIsxxjztdMZQtwHA'],
    ['sin id', 'https://www.youtube.com/watch'],
    ['un id de YouTube mal formado', 'https://youtu.be/abc'],
    ['un id de Vimeo que no es numérico', 'https://vimeo.com/canal'],
    ['un dominio que solo lo imita', 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'],
    ['otro esquema', 'javascript:alert(1)'],
    ['texto que no es una URL', 'mi video de la camiseta'],
  ])('rechaza %s', (_label, url) => {
    expect(parseVideoUrl(url)).toBeNull();
  });
});
