import mox from './mox.png';
import moss from './moss.png';
import spark from './spark.png';

/** Local, bundled identity assets. Config persists only the stable icon ID. */
export const BOT_AVATARS = [
  { id: 'bot:mox', src: mox, nameKey: 'mox' },
  { id: 'bot:moss', src: moss, nameKey: 'moss' },
  { id: 'bot:spark', src: spark, nameKey: 'spark' },
] as const;

export function resolveBotAvatar(icon: string | null | undefined) {
  return BOT_AVATARS.find(avatar => avatar.id === icon);
}
