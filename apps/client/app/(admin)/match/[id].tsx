import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { basketballApi, GameDetail } from '../../../services/basketballApi';
import { useHeader, DEFAULT_SEARCH_PLACEHOLDER } from '../../../components/HeaderContext';
import PageHero from '../../../components/admin/PageHero';
import PageContainer from '../../../components/ui/PageContainer';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ErrorState } from '../../../components/ui/ScreenState';

/**
 * "Fișă meci" — pulled live from FRB's own game-detail widget (the one their
 * schedule page links to as "Avancronica"/"Preview"): quarter-by-quarter
 * score, arena, attendance, referees, commissioner. Not every scheduled match
 * carries a `gameId` (FRB only wires one up once the fixture is confirmed on
 * their side), so a missing id is a normal "not published yet" state, not an
 * error.
 */

const SCHEDULE_PATH = '/admin/dashboard';

function formatDateLabel(dateStr: string) {
  const parts = dateStr.split('.');
  if (parts.length !== 3) return dateStr;
  const [day, month, year] = parts.map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return dateStr;
  const label = date.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View
      className="ui-rise rounded-[16px] border p-4 md:p-5"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <Text className="t-eyebrow mb-3.5" style={{ color: 'var(--c-faint)' }}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="w-10 h-10 rounded-[11px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-2)' }}>
        <MaterialIcons name={icon} size={18} color="var(--c-brand-fg)" />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-[12px] font-medium" style={{ color: 'var(--c-faint)' }}>{label}</Text>
        <Text className="text-[15px] font-semibold mt-0.5" style={{ color: 'var(--c-ink)' }}>{value}</Text>
      </View>
    </View>
  );
}

export default function MatchDetailScreen() {
  const { id, seasonId } = useLocalSearchParams<{ id: string; seasonId?: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { setSearchPlaceholder, setHeaderActions, setMobileFab } = useHeader();

  useEffect(() => {
    setSearchPlaceholder('Caută…');
    setHeaderActions(null);
    setMobileFab(null);
    return () => {
      setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
      setHeaderActions(null);
      setMobileFab(null);
    };
  }, [setHeaderActions, setMobileFab, setSearchPlaceholder]);

  const loadData = useCallback(async () => {
    if (!id || !seasonId) {
      setError('Acest meci nu are încă o fișă publicată de FRB.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await basketballApi.getGameDetail(id, seasonId);
      setDetail(data);
    } catch (err) {
      console.error('Match detail load error:', err);
      setError(err instanceof Error ? err.message : 'Fișa meciului nu a putut fi încărcată.');
    } finally {
      setLoading(false);
    }
  }, [id, seasonId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const goBack = () => router.back(SCHEDULE_PATH);

  const backButton = (
    <Pressable
      onPress={goBack}
      accessibilityRole="button"
      accessibilityLabel="Înapoi"
      className="ui-press self-start h-9 pl-2 pr-3 rounded-[10px] border flex-row items-center gap-1.5 mb-4"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
    >
      <MaterialIcons name="chevron-left" size={18} color="var(--c-ink-soft)" />
      <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Înapoi</Text>
    </Pressable>
  );

  if (loading) {
    return (
      <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
        <PageContainer>
          <View className="max-w-[920px] w-full self-center gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă fișa meciului">
            <Skeleton className="h-9 w-24 rounded-[10px]" />
            <Skeleton className="h-[160px] w-full rounded-[16px]" />
            <Skeleton className="h-[140px] w-full rounded-[16px]" />
          </View>
        </PageContainer>
      </ScrollView>
    );
  }

  if (!detail) {
    return (
      <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
        <PageContainer>
          <View className="max-w-[920px] w-full self-center">
            {backButton}
            <ErrorState
              title="Fișa meciului nu e disponibilă"
              message={error ?? 'FRB nu a publicat încă detalii pentru acest meci.'}
              actionLabel={id && seasonId ? 'Reîncearcă' : undefined}
              onAction={id && seasonId ? loadData : undefined}
            />
          </View>
        </PageContainer>
      </ScrollView>
    );
  }

  const isFinished = detail.homeScore !== '' && detail.awayScore !== '';
  const homeWon = isFinished && Number(detail.homeScore) > Number(detail.awayScore);
  const awayWon = isFinished && Number(detail.awayScore) > Number(detail.homeScore);

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
        <View className="max-w-[920px] w-full self-center">
          {backButton}

          <PageHero
            eyebrow="Fișă meci · FRB"
            title={`${detail.homeTeam} vs ${detail.awayTeam}`}
            subtitle={detail.date ? `${formatDateLabel(detail.date)}${detail.time ? `, ${detail.time}` : ''}` : undefined}
            className="mb-4"
          >
            <View className="glass rounded-[14px] px-4 py-3.5 items-center gap-2.5" style={{ boxShadow: 'var(--e-sm)' } as any}>
              <View className="flex-row items-center gap-3 w-full">
                <Text
                  className="f-display flex-1 text-[14px] md:text-[17px] font-bold text-right leading-tight"
                  style={{ color: homeWon ? 'var(--c-ink-strong)' : 'var(--c-muted)' }}
                >
                  {detail.homeTeam}
                </Text>
                <View className="items-center">
                  {isFinished ? (
                    <Text className="f-display t-num text-[30px] font-extrabold leading-none" style={{ color: 'var(--c-ink-strong)' }}>
                      {detail.homeScore}<Text style={{ color: 'var(--c-faint)' }}> : </Text>{detail.awayScore}
                    </Text>
                  ) : (
                    <Text className="f-display text-[16px] font-bold leading-none" style={{ color: 'var(--c-brand-fg)' }}>vs</Text>
                  )}
                  <Text className="text-[10.5px] font-semibold mt-1 uppercase tracking-[0.06em]" style={{ color: 'var(--c-faint)' }}>
                    {isFinished ? 'Final' : 'Programat'}
                  </Text>
                </View>
                <Text
                  className="f-display flex-1 text-[14px] md:text-[17px] font-bold leading-tight"
                  style={{ color: awayWon ? 'var(--c-ink-strong)' : 'var(--c-muted)' }}
                >
                  {detail.awayTeam}
                </Text>
              </View>

              {detail.quarters.length > 0 ? (
                <View className="flex-row justify-center gap-1.5 flex-wrap">
                  {detail.quarters.map((q, i) => (
                    <View key={i} className="rounded-[10px] px-2.5 py-1 items-center min-w-[52px]" style={{ backgroundColor: 'var(--c-surface-2)' }}>
                      <Text className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--c-faint)' }}>
                        {i < 4 ? `Sf. ${i + 1}` : `Prel. ${i - 3}`}
                      </Text>
                      <Text className="t-num text-[13px] font-bold mt-0.5" style={{ color: 'var(--c-ink)' }}>{q.home}-{q.away}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </PageHero>

          {error ? (
            <View className="mb-4 rounded-[12px] border px-4 py-3 flex-row items-center gap-2.5" style={{ backgroundColor: 'var(--c-danger-bg)', borderColor: 'var(--c-danger-border)' } as any}>
              <MaterialIcons name="error-outline" size={17} color="var(--c-danger-fg)" />
              <Text className="text-[13px] font-semibold flex-1" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text>
            </View>
          ) : null}

          <View className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Când și unde">
              <View className="gap-3.5">
                {detail.date ? <InfoRow icon="schedule" label="Data și ora" value={`${formatDateLabel(detail.date)}${detail.time ? `, ${detail.time}` : ''}`} /> : null}
                {detail.arena ? <InfoRow icon="place" label="Sală" value={detail.arena} /> : null}
                {detail.attendance ? <InfoRow icon="confirmation-number" label="Spectatori" value={detail.attendance} /> : null}
                {detail.broadcast ? <InfoRow icon="flash-on" label="Difuzare TV" value={detail.broadcast} /> : null}
                {detail.gameNumber ? <InfoRow icon="scoreboard" label="Meci numărul" value={detail.gameNumber} /> : null}
              </View>
            </Card>

            <Card title="Oficiali">
              {detail.referees.length > 0 || detail.commissioner ? (
                <View className="gap-3.5">
                  {detail.referees.length > 0 ? (
                    <InfoRow icon="verified-user" label={detail.referees.length === 1 ? 'Arbitru' : 'Arbitri'} value={detail.referees.join(', ')} />
                  ) : null}
                  {detail.commissioner ? <InfoRow icon="badge" label="Comisar" value={detail.commissioner} /> : null}
                </View>
              ) : (
                <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>FRB nu a publicat încă oficialii acestui meci.</Text>
              )}
            </Card>
          </View>
        </View>
      </PageContainer>
    </ScrollView>
  );
}
