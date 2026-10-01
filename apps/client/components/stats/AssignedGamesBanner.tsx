import { useEffect, useState } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { gamesApi } from '../../services/gamesApi';

/**
 * For a parent (or player) a coach asked to keep the stats sheet: the open
 * matches, one tap from the scorer. Renders nothing for everyone else.
 */
export default function AssignedGamesBanner() {
  const router = useRouter();
  const [games, setGames] = useState<{ eventId: number; title: string; startTime: string; status: string }[]>([]);

  useEffect(() => {
    gamesApi.assigned().then(setGames).catch(() => setGames([]));
  }, []);

  if (!games.length) return null;

  return (
    <View className="w-full px-3 sm:px-4 lg:px-6 xl:px-8 pt-3 gap-2">
      {games.map((g) => (
        <Pressable
          key={g.eventId}
          onPress={() => router.push(`/stats/${g.eventId}` as any)}
          accessibilityRole="button"
          className="ui-press rounded-[14px] border px-3.5 py-3 flex-row items-center gap-3 text-left"
          style={{ backgroundColor: 'var(--c-surface-tint)', borderColor: 'color-mix(in srgb, var(--c-brand-fg) 35%, var(--c-border))' } as any}
        >
          <View className="w-9 h-9 rounded-[10px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-brand-surface)' }}>
            <MaterialIcons name="sports-basketball" size={18} color="var(--c-on-brand)" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
              {g.status === 'live' ? 'Meci în desfășurare — ții statistica' : 'Ții statistica la meci'}
            </Text>
            <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
              {g.title} · {new Date(g.startTime).toLocaleString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color="var(--c-brand-fg)" />
        </Pressable>
      ))}
    </View>
  );
}
