import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { familyApi, type GuardianAccount } from '../../services/familyApi';
import { getPublicAppUrl } from '../../config/serverUrl';
import ConfirmDialog from '../ui/ConfirmDialog';

/**
 * A player's parents with an account, plus "Invită părinte": a personal,
 * single-use link (7 days) that creates the parent's account already linked to
 * this child — no approval needed, the club chose who gets it.
 * Club admins and the player's coach (the server enforces both).
 */

type Notify = (toast: { variant: 'success' | 'error'; message: string }) => void;

export default function GuardiansPanel({ playerId, playerName, onNotify, bare = false }: { playerId: number; playerName: string; onNotify: Notify; bare?: boolean }) {
  const [guardians, setGuardians] = useState<GuardianAccount[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<GuardianAccount | null>(null);

  const load = useCallback(() => {
    familyApi.guardians(playerId).then(setGuardians).catch(() => setGuardians([]));
  }, [playerId]);

  useEffect(() => {
    load();
  }, [load]);

  const invite = async () => {
    setInviting(true);
    try {
      const { token } = await familyApi.createInvite(playerId);
      setLink(`${getPublicAppUrl()}/signup?inviteToken=${token}`);
    } catch (err) {
      onNotify({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut crea invitația.' });
    } finally {
      setInviting(false);
    }
  };

  const share = async () => {
    if (!link) return;
    const text = `Cont BCMS pentru părintele lui ${playerName}: ${link}\nLinkul e personal, valabil 7 zile, se folosește o singură dată.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Invitație părinte — ${playerName}`, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      onNotify({ variant: 'success', message: 'Invitația a fost copiată.' });
    } catch {
      // Share sheet dismissed.
    }
  };

  const unlink = async (guardian: GuardianAccount) => {
    try {
      await familyApi.unlink(playerId, guardian.userId);
      setGuardians((list) => (list ?? []).filter((g) => g.userId !== guardian.userId));
      onNotify({ variant: 'success', message: `${guardian.name} nu mai e legat de ${playerName}.` });
    } catch (err) {
      onNotify({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut dezlega părintele.' });
    }
  };

  return (
    <View
      className={bare ? 'gap-3' : 'rounded-[16px] border p-4 gap-3'}
      style={bare ? undefined : ({ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any)}
    >
      {!bare ? (
        <View className="flex-row items-center gap-2.5">
          <View className="w-9 h-9 rounded-[10px] items-center justify-center" style={{ backgroundColor: 'var(--c-purple-bg)' }}>
            <MaterialIcons name="family-restroom" size={18} color="var(--c-purple-fg)" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-[15px] font-bold" style={{ color: 'var(--c-ink)' }}>Părinți</Text>
            <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Conturi legate de {playerName}</Text>
          </View>
        </View>
      ) : null}

      {guardians == null ? (
        <ActivityIndicator size="small" color="var(--c-brand-fg)" />
      ) : guardians.length === 0 ? (
        <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Niciun părinte cu cont încă.</Text>
      ) : (
        <View className="gap-1.5">
          {guardians.map((guardian) => (
            <View key={guardian.userId} className="flex-row items-center gap-2.5 rounded-[11px] px-3 py-2.5" style={{ backgroundColor: 'var(--c-surface-2)' }}>
              <View className="flex-1 min-w-0">
                <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                  {guardian.name}{guardian.status === 'pending' ? ' · în așteptare' : ''}
                </Text>
                <Text className="text-[12px]" style={{ color: 'var(--c-muted)', userSelect: 'text' } as any} numberOfLines={1}>
                  {[guardian.phone, guardian.email].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Pressable onPress={() => setUnlinking(guardian)} accessibilityRole="button" accessibilityLabel={`Dezleagă ${guardian.name}`} className="ui-press w-8 h-8 rounded-[9px] items-center justify-center">
                <MaterialIcons name="link-off" size={16} color="var(--c-faint)" />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {link ? (
        <View className="rounded-[11px] border p-3 gap-2" style={{ borderColor: 'var(--c-brand-fg)', backgroundColor: 'var(--c-surface-tint)' } as any}>
          <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>
            Link personal pentru un părinte — valabil 7 zile, o singură folosire.
          </Text>
          <Text className="text-[12px] break-anywhere" style={{ color: 'var(--c-muted)', userSelect: 'all' } as any} numberOfLines={2}>{link}</Text>
          <Pressable onPress={share} accessibilityRole="button" className="ui-press self-start h-9 px-3 rounded-[10px] flex-row items-center gap-1.5" style={{ backgroundColor: 'var(--c-brand-surface)' }}>
            <MaterialIcons name="share" size={15} color="var(--c-on-brand)" />
            <Text className="text-[13px] font-bold" style={{ color: 'var(--c-on-brand)' }}>Trimite părintelui</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={invite}
          disabled={inviting}
          accessibilityRole="button"
          className="ui-press self-start h-9 px-3 rounded-[10px] border flex-row items-center gap-1.5"
          style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
        >
          {inviting ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="person-add" size={15} color="var(--c-brand-fg)" />}
          <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Invită părinte</Text>
        </Pressable>
      )}

      <ConfirmDialog
        visible={unlinking != null}
        destructive
        icon="link-off"
        title={unlinking ? `Dezlegi ${unlinking.name} de ${playerName}?` : ''}
        message="Părintele nu mai vede programul, prezența și plățile copilului. Contul lui rămâne."
        confirmLabel="Dezleagă"
        cancelLabel="Anulează"
        onConfirm={() => {
          if (unlinking) void unlink(unlinking);
          setUnlinking(null);
        }}
        onCancel={() => setUnlinking(null)}
      />
    </View>
  );
}
