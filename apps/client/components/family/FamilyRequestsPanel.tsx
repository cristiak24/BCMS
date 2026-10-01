import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { familyRequestsApi, formatTeamCode, type FamilyJoinRequest, type TeamJoinCode } from '../../services/familyRequestsApi';
import { getPublicAppUrl } from '../../config/serverUrl';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState } from '../ui/ScreenState';

/**
 * Team-code signups waiting for a decision, plus the codes to hand out.
 * Used on Acces & invitații → Cereri (admins: whole club) and on the coach's
 * Cereri page (coaches: their own teams — the server scopes the list).
 *
 * Each request is approved either onto an existing player (the server
 * suggests name matches so a child already on the roster isn't duplicated) or
 * as a new player in that team.
 */

type Notify = (toast: { variant: 'success' | 'error'; message: string }) => void;

function formatBirth(date: string | null) {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

function timeAgo(iso: string) {
  const then = new Date(iso.includes('T') || iso.endsWith('Z') ? iso : `${iso.replace(' ', 'T')}Z`).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 60) return minutes <= 1 ? 'acum' : `acum ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `acum ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ieri' : `acum ${days} zile`;
}

function defaultTarget(request: FamilyJoinRequest): number | 'new' {
  const exact = request.suggestions.filter((s) => s.exact);
  return exact.length === 1 ? exact[0].id : 'new';
}

function RequestCard({
  request,
  busy,
  onApprove,
  onDeny,
}: {
  request: FamilyJoinRequest;
  busy: boolean;
  onApprove: (target: number | 'new') => void;
  onDeny: () => void;
}) {
  const [target, setTarget] = useState<number | 'new'>(() => defaultTarget(request));
  const childName = `${request.child.firstName} ${request.child.lastName}`;
  const options: { key: number | 'new'; title: string; meta: string }[] = [
    ...request.suggestions.map((s) => ({
      key: s.id,
      title: `Leagă de ${s.firstName ?? ''} ${s.lastName ?? ''}`.trim(),
      meta: [
        s.birthYear ? `n. ${s.birthYear}` : null,
        s.number != null ? `#${s.number}` : null,
        s.teams.join(', ') || null,
        request.kind === 'player' && s.hasAccount ? 'are deja cont' : null,
        request.kind === 'parent' && s.guardians ? `${s.guardians} părinte${s.guardians === 1 ? '' : 'i'} legat${s.guardians === 1 ? '' : 'i'}` : null,
      ].filter(Boolean).join(' · ') || 'jucător existent în club',
    })),
    { key: 'new', title: 'Jucător nou în lot', meta: `${childName} va fi adăugat în ${request.team.name}` },
  ];

  return (
    <View
      className="rounded-[14px] border p-4 gap-3.5 min-w-0"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-row items-start gap-3 min-w-0">
        <View
          className="w-10 h-10 rounded-[11px] items-center justify-center shrink-0"
          style={{ backgroundColor: request.kind === 'parent' ? 'var(--c-purple-bg)' : 'var(--c-surface-tint)' }}
        >
          <MaterialIcons name={request.kind === 'parent' ? 'family-restroom' : 'person'} size={19} color={request.kind === 'parent' ? 'var(--c-purple-fg)' : 'var(--c-brand-fg)'} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[15px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>
            {request.kind === 'parent' ? `${request.requester.name} → ${childName}` : childName}
          </Text>
          <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>
            {[
              request.kind === 'parent' ? 'Părinte' : 'Jucător',
              request.team.name,
              request.child.birthDate ? `${request.kind === 'parent' ? 'copil ' : ''}n. ${formatBirth(request.child.birthDate)}` : null,
              timeAgo(request.createdAt),
            ].filter(Boolean).join(' · ')}
          </Text>
          <Text className="t-meta mt-0.5" style={{ color: 'var(--c-faint)', userSelect: 'text' } as any} numberOfLines={1}>
            {[request.requester.phone, request.requester.email].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <View className="gap-1.5" accessibilityRole={'radiogroup' as any} accessibilityLabel={`Unde intră ${childName}`}>
        {options.map((option) => {
          const selected = target === option.key;
          return (
            <Pressable
              key={String(option.key)}
              onPress={() => setTarget(option.key)}
              accessibilityRole={'radio' as any}
              accessibilityState={{ checked: selected } as any}
              className="ui-press rounded-[11px] border px-3 py-2.5 flex-row items-center gap-2.5 text-left"
              style={{
                borderColor: selected ? 'var(--c-brand-fg)' : 'var(--c-border)',
                backgroundColor: selected ? 'var(--c-surface-tint)' : 'var(--c-surface-2)',
              } as any}
            >
              <MaterialIcons name={selected ? 'radio-button-checked' : 'radio-button-unchecked'} size={17} color={selected ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />
              <View className="flex-1 min-w-0">
                <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{option.title}</Text>
                <Text className="text-[12px]" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{option.meta}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row justify-end gap-2">
        <Pressable
          onPress={onDeny}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Respinge cererea pentru ${childName}`}
          className="ui-press h-10 px-4 rounded-[10px] border items-center justify-center"
          style={{ borderColor: 'var(--c-danger-border)', backgroundColor: 'var(--c-danger-bg)' } as any}
        >
          <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-danger-fg)' }}>Respinge</Text>
        </Pressable>
        <Pressable
          onPress={() => onApprove(target)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Aprobă cererea pentru ${childName}`}
          className="ui-press h-10 px-4 rounded-[10px] flex-row items-center gap-1.5"
          style={{ backgroundColor: 'var(--c-brand-surface)', opacity: busy ? 0.7 : 1 } as any}
        >
          {busy ? <ActivityIndicator size="small" color="var(--c-on-brand)" /> : <MaterialIcons name="check" size={16} color="var(--c-on-brand)" />}
          <Text className="text-[13px] font-bold" style={{ color: 'var(--c-on-brand)' }}>Aprobă</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TeamCodes({ codes, onRotate, onNotify }: { codes: TeamJoinCode[]; onRotate: (team: TeamJoinCode) => void; onNotify: Notify }) {
  const [open, setOpen] = useState(false);
  if (!codes.length) return null;

  const share = async (team: TeamJoinCode) => {
    const link = `${getPublicAppUrl()}/signup?inviteToken=${team.code}`;
    const text = `Înscriere în echipa ${team.name} pe BCMS: ${link}\nSau introdu codul ${formatTeamCode(team.code)} la „Creează cont”.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Înscriere ${team.name}`, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      onNotify({ variant: 'success', message: 'Mesajul de înscriere a fost copiat.' });
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  };

  return (
    <View className="rounded-[14px] border mb-3 overflow-hidden" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-2.5 px-4 py-3 text-left"
      >
        <MaterialIcons name="vpn-key" size={17} color="var(--c-brand-fg)" />
        <View className="flex-1 min-w-0">
          <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>Codurile echipelor</Text>
          <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>Trimite-le părinților: se înscriu singuri, tu doar aprobi.</Text>
        </View>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color="var(--c-faint)" />
      </Pressable>
      {open ? (
        <View className="px-4 pb-4 gap-2">
          {codes.map((team) => (
            <View key={team.id} className="flex-row flex-wrap items-center gap-2 rounded-[11px] px-3 py-2.5" style={{ backgroundColor: 'var(--c-surface-2)' }}>
              <Text className="flex-1 min-w-[140px] text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{team.name}</Text>
              <Text className="t-num text-[15px] font-bold tracking-[0.12em]" style={{ color: 'var(--c-ink-strong)', userSelect: 'all' } as any}>
                {formatTeamCode(team.code)}
              </Text>
              <Pressable onPress={() => share(team)} accessibilityRole="button" accessibilityLabel={`Trimite codul echipei ${team.name}`} className="ui-press h-8 px-2.5 rounded-[9px] flex-row items-center gap-1" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                <MaterialIcons name="share" size={14} color="var(--c-brand-fg)" />
                <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Trimite</Text>
              </Pressable>
              <Pressable onPress={() => onRotate(team)} accessibilityRole="button" accessibilityLabel={`Schimbă codul echipei ${team.name}`} className="ui-press w-8 h-8 rounded-[9px] items-center justify-center">
                <MaterialIcons name="refresh" size={16} color="var(--c-faint)" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function FamilyRequestsPanel({ onNotify, onCountChange }: { onNotify: Notify; onCountChange?: (count: number) => void }) {
  const [requests, setRequests] = useState<FamilyJoinRequest[] | null>(null);
  const [codes, setCodes] = useState<TeamJoinCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'deny'; request: FamilyJoinRequest } | { kind: 'all' } | { kind: 'rotate'; team: TeamJoinCode } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [list, teamCodes] = await Promise.all([familyRequestsApi.list(), familyRequestsApi.teamCodes().catch(() => [])]);
      setRequests(list);
      setCodes(teamCodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca cererile.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (requests) onCountChange?.(requests.length);
  }, [requests, onCountChange]);

  const remove = (id: number) => setRequests((list) => (list ?? []).filter((r) => r.id !== id));

  const approve = async (request: FamilyJoinRequest, target: number | 'new') => {
    setBusyId(request.id);
    try {
      const done = await familyRequestsApi.approve(request.id, target);
      remove(request.id);
      onNotify({
        variant: 'success',
        message: `${request.child.firstName} ${request.child.lastName}: ${done.created ? `adăugat în ${request.team.name}` : 'legat de jucătorul existent'}.`,
      });
    } catch (err) {
      onNotify({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut aproba cererea.' });
    } finally {
      setBusyId(null);
    }
  };

  const deny = async (request: FamilyJoinRequest) => {
    setBusyId(request.id);
    try {
      await familyRequestsApi.deny(request.id);
      remove(request.id);
      onNotify({ variant: 'success', message: 'Cererea a fost respinsă.' });
    } catch (err) {
      onNotify({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut respinge cererea.' });
    } finally {
      setBusyId(null);
    }
  };

  const approveAll = async () => {
    if (!requests?.length) return;
    setBulkBusy(true);
    try {
      const { results } = await familyRequestsApi.approveAll(requests.map((r) => r.id));
      const ok = results.filter((r) => r.ok).length;
      const failed = results.length - ok;
      onNotify({ variant: failed ? 'error' : 'success', message: failed ? `${ok} aprobate, ${failed} nu au putut fi aprobate.` : `${ok} cereri aprobate.` });
      await load();
    } catch (err) {
      onNotify({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut aproba cererile.' });
    } finally {
      setBulkBusy(false);
    }
  };

  const rotate = async (team: TeamJoinCode) => {
    try {
      const updated = await familyRequestsApi.rotateCode(team.id);
      setCodes((list) => list.map((t) => (t.id === team.id ? updated : t)));
      onNotify({ variant: 'success', message: `Cod nou pentru ${team.name}: ${formatTeamCode(updated.code)}.` });
    } catch (err) {
      onNotify({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut schimba codul.' });
    }
  };

  const ambiguous = useMemo(() => (requests ?? []).filter((r) => r.suggestions.filter((s) => s.exact).length !== 1 && r.suggestions.length > 0).length, [requests]);

  return (
    <View>
      <TeamCodes codes={codes} onRotate={(team) => setConfirm({ kind: 'rotate', team })} onNotify={onNotify} />

      {error ? (
        <ErrorState title="Nu am putut încărca cererile" message={error} actionLabel="Reîncearcă" onAction={load} />
      ) : !requests ? (
        <View className="gap-2.5" accessibilityRole="progressbar" accessibilityLabel="Se încarcă cererile">
          <Skeleton className="h-[180px] w-full rounded-[14px]" />
          <Skeleton className="h-[180px] w-full rounded-[14px]" />
        </View>
      ) : requests.length === 0 ? (
        <EmptyState
          compact
          icon="family-restroom"
          title="Nicio înscriere nouă"
          message="Când un părinte sau un jucător folosește codul echipei, cererea apare aici."
        />
      ) : (
        <View className="gap-2.5">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-[14px] font-bold" style={{ color: 'var(--c-ink)' }}>
              Înscrieri în echipe · {requests.length}
            </Text>
            {requests.length > 1 ? (
              <Pressable
                onPress={() => setConfirm({ kind: 'all' })}
                disabled={bulkBusy}
                accessibilityRole="button"
                className="ui-press h-9 px-3 rounded-[10px] border flex-row items-center gap-1.5"
                style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
              >
                {bulkBusy ? <ActivityIndicator size="small" color="var(--c-success-fg)" /> : <MaterialIcons name="done-all" size={16} color="var(--c-success-fg)" />}
                <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }}>Aprobă toți</Text>
              </Pressable>
            ) : null}
          </View>
          <View className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
            {requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                busy={busyId === request.id || bulkBusy}
                onApprove={(target) => approve(request, target)}
                onDeny={() => setConfirm({ kind: 'deny', request })}
              />
            ))}
          </View>
        </View>
      )}

      <ConfirmDialog
        visible={confirm != null}
        destructive={confirm?.kind === 'deny'}
        icon={confirm?.kind === 'deny' ? 'block' : confirm?.kind === 'rotate' ? 'refresh' : 'done-all'}
        title={confirm?.kind === 'deny'
          ? `Respingi cererea pentru ${confirm.request.child.firstName} ${confirm.request.child.lastName}?`
          : confirm?.kind === 'rotate'
            ? `Schimbi codul pentru ${confirm.team.name}?`
            : `Aprobi toate cele ${requests?.length ?? 0} cereri?`}
        message={confirm?.kind === 'deny'
          ? 'Contul rămâne în așteptare, fără acces la echipă.'
          : confirm?.kind === 'rotate'
            ? 'Codul vechi nu mai funcționează. Cererile deja trimise rămân.'
            : `Fiecare copil cu un singur jucător identic în lot e legat de el; ceilalți devin jucători noi.${ambiguous ? ` ${ambiguous} ${ambiguous === 1 ? 'cerere are' : 'cereri au'} potriviri nesigure — verifică-le una câte una înainte.` : ''}`}
        confirmLabel={confirm?.kind === 'deny' ? 'Respinge' : confirm?.kind === 'rotate' ? 'Schimbă codul' : 'Aprobă toți'}
        cancelLabel="Anulează"
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          if (action?.kind === 'deny') void deny(action.request);
          else if (action?.kind === 'rotate') void rotate(action.team);
          else if (action?.kind === 'all') void approveAll();
        }}
        onCancel={() => setConfirm(null)}
      />
    </View>
  );
}
