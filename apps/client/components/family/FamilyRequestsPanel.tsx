import { parseApiDate } from '@/utils/dates';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { familyRequestsApi, formatTeamCode, type FamilyJoinRequest, type TeamJoinCode } from '../../services/familyRequestsApi';
import { getPublicAppUrl } from '../../config/serverUrl';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState } from '../ui/ScreenState';
import { autoApprovableIds, defaultTarget, denyMessage, formatBirth, matchWarnings } from '../../utils/joinRequestReview';
import { plural } from '../../utils/plural';

import { tr } from '../../i18n';
/**
 * Team-code signups waiting for a decision, plus the codes to hand out.
 * Used on Acces & invitații → Cereri (admins: whole club) and on the coach's
 * Cereri page (coaches: their own teams — the server scopes the list).
 *
 * Each request is approved either onto an existing player (the server
 * suggests name matches so a child already on the roster isn't duplicated) or
 * as a new player in that team. "Jucător nou" is always the default: linking
 * to a same-name child is a deliberate choice, with its warnings in view
 * (utils/joinRequestReview.ts).
 */

type Notify = (toast: { variant: 'success' | 'error'; message: string }) => void;

function timeAgo(iso: string) {
  const then = parseApiDate(iso).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 60) return minutes <= 1 ? 'acum' : `acum ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `acum ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ieri' : `acum ${plural(days, tr('zi'), tr('zile'))}`;
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
  const options: { key: number | 'new'; title: string; meta: string; warnings: string[] }[] = [
    { key: 'new', title: tr('Jucător nou în lot'), meta: tr('{childName} va fi adăugat în {1}', { childName, '1': request.team.name }), warnings: [] },
    ...request.suggestions.map((s) => ({
      key: s.id,
      title: tr('Leagă de {0} {1}', { '0': s.firstName ?? '', '1': s.lastName ?? '' }).trim(),
      meta: [
        s.birthDate ? `n. ${formatBirth(s.birthDate)}` : s.birthYear ? `n. ${s.birthYear}` : null,
        s.number != null ? `#${s.number}` : null,
        s.teams.join(', ') || null,
      ].filter(Boolean).join(' · ') || tr('jucător existent în club'),
      warnings: matchWarnings(request, s),
    })),
  ];
  const selectedWarnings = options.find((option) => option.key === target)?.warnings ?? [];

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
              request.kind === 'parent' ? tr('Părinte') : tr('Jucător'),
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

      {request.suggestions.length ? (
        <View className="flex-row items-start gap-2 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--c-warning-bg)' }}>
          <MaterialIcons name="warning-amber" size={16} color="var(--c-warning-fg)" style={{ marginTop: 1 }} />
          <Text className="flex-1 text-[12.5px] font-semibold leading-[18px]" style={{ color: 'var(--c-warning-fg)' }}>
            {request.suggestions.length === 1
              ? tr('În club există un jucător cu același nume. Leagă-l doar dacă ești sigur că e același copil.')
              : tr('În club există {0} cu nume asemănător. Leagă doar dacă ești sigur că e același copil.', { '0': plural(request.suggestions.length, 'jucător', 'jucători') })}
          </Text>
        </View>
      ) : null}

      <View className="gap-1.5" accessibilityRole={'radiogroup' as any} accessibilityLabel={tr('Unde intră {childName}', { childName })}>
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
                {option.warnings.length ? (
                  <Text className="text-[12px] font-semibold mt-0.5" style={{ color: 'var(--c-warning-fg)' }} numberOfLines={2}>
                    {option.warnings.join(' ')}
                  </Text>
                ) : null}
              </View>
              {option.warnings.length ? <MaterialIcons name="warning-amber" size={16} color="var(--c-warning-fg)" /> : null}
            </Pressable>
          );
        })}
      </View>

      {selectedWarnings.length ? (
        <View className="rounded-[10px] border px-3 py-2.5" style={{ backgroundColor: 'var(--c-danger-bg)', borderColor: 'var(--c-danger-border)' } as any}>
          <Text className="text-[12.5px] font-semibold leading-[18px]" style={{ color: 'var(--c-danger-fg)' }}>
            {tr('{0} La aprobare, {1} va vedea datele acestui jucător.', { '0': selectedWarnings.join(' '), '1': request.kind === 'parent' ? request.requester.name : 'contul' })}
          </Text>
        </View>
      ) : null}

      <View className="flex-row justify-end gap-2">
        <Pressable
          onPress={onDeny}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={tr('Respinge cererea pentru {childName}', { childName })}
          className="ui-press h-10 px-4 rounded-[10px] border items-center justify-center"
          style={{ borderColor: 'var(--c-danger-border)', backgroundColor: 'var(--c-danger-bg)' } as any}
        >
          <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-danger-fg)' }}>{tr('Respinge')}</Text>
        </Pressable>
        <Pressable
          onPress={() => onApprove(target)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={tr('Aprobă cererea pentru {childName}', { childName })}
          className="ui-press h-10 px-4 rounded-[10px] flex-row items-center gap-1.5"
          style={{ backgroundColor: 'var(--c-brand-surface)', opacity: busy ? 0.7 : 1 } as any}
        >
          {busy ? <ActivityIndicator size="small" color="var(--c-on-brand)" /> : <MaterialIcons name="check" size={16} color="var(--c-on-brand)" />}
          <Text className="text-[13px] font-bold" style={{ color: 'var(--c-on-brand)' }}>{tr('Aprobă')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TeamCodes({ codes, onRotate, onToggle, onNotify, defaultOpen = false }: { codes: TeamJoinCode[]; onRotate: (team: TeamJoinCode) => void; onToggle: (team: TeamJoinCode, enabled: boolean) => void; onNotify: Notify; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!codes.length) return null;

  const share = async (team: TeamJoinCode) => {
    const link = `${getPublicAppUrl()}/signup?inviteToken=${team.code}`;
    const text = tr('Înscriere în echipa {0} pe BCMS: {link}\nSau introdu codul {2} la „Creează cont”.', { '0': team.name, link, '2': formatTeamCode(team.code) });
    try {
      if (navigator.share) {
        await navigator.share({ title: tr('Înscriere {0}', { '0': team.name }), text });
        return;
      }
      await navigator.clipboard.writeText(text);
      onNotify({ variant: 'success', message: tr('Mesajul de înscriere a fost copiat.') });
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
          <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>{tr('Codurile echipelor')}</Text>
          <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{tr('Trimite-le părinților: se înscriu singuri, tu doar aprobi.')}</Text>
        </View>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color="var(--c-faint)" />
      </Pressable>
      {open ? (
        <View className="px-4 pb-4 gap-2">
          {codes.map((team) => {
            const accepting = team.enabled !== false;
            return (
              <View key={team.id} className="flex-row flex-wrap items-center gap-2 rounded-[11px] px-3 py-2.5" style={{ backgroundColor: 'var(--c-surface-2)' }}>
                <View className="flex-1 min-w-[140px] flex-row items-center gap-2">
                  <Text className="shrink text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{team.name}</Text>
                  {accepting ? null : (
                    <View className="px-2 h-5 rounded-full items-center justify-center" style={{ backgroundColor: 'var(--c-warning-bg)' } as any}>
                      <Text className="text-[11px] font-bold" style={{ color: 'var(--c-warning-fg)' }}>{tr('Oprit')}</Text>
                    </View>
                  )}
                </View>
                <Text className="t-num text-[15px] font-bold tracking-[0.12em]" style={{ color: 'var(--c-ink-strong)', opacity: accepting ? 1 : 0.4, userSelect: 'all' } as any}>
                  {formatTeamCode(team.code)}
                </Text>
                <View className="flex-row items-center gap-2">
                  {accepting ? (
                    <Pressable onPress={() => share(team)} accessibilityRole="button" accessibilityLabel={tr('Trimite codul echipei {0}', { '0': team.name })} className="ui-press h-8 [@media(pointer:coarse)]:h-10 px-2.5 rounded-[9px] flex-row items-center gap-1" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                      <MaterialIcons name="share" size={14} color="var(--c-brand-fg)" />
                      <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{tr('Trimite')}</Text>
                    </Pressable>
                  ) : null}
                  <Switch
                    value={accepting}
                    onValueChange={(value: boolean) => onToggle(team, value)}
                    accessibilityLabel={tr('Înscrieri cu codul echipei {0}', { '0': team.name })}
                  />
                  <Pressable onPress={() => onRotate(team)} accessibilityRole="button" accessibilityLabel={tr('Schimbă codul echipei {0}', { '0': team.name })} className="ui-press tap-40 w-8 h-8 rounded-[9px] items-center justify-center">
                    <MaterialIcons name="refresh" size={16} color="var(--c-faint)" />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Change or pause the team codes on their own — Acces › Coduri, next to the group codes. */
export function TeamCodesPanel({ onNotify }: { onNotify: Notify }) {
  const [codes, setCodes] = useState<TeamJoinCode[] | null>(null);
  const [pendingRotate, setPendingRotate] = useState<TeamJoinCode | null>(null);

  useEffect(() => {
    familyRequestsApi.teamCodes().then(setCodes).catch(() => setCodes([]));
  }, []);

  const rotate = async (team: TeamJoinCode) => {
    try {
      const updated = await familyRequestsApi.rotateCode(team.id);
      setCodes((list) => (list ?? []).map((t) => (t.id === team.id ? updated : t)));
      onNotify({ variant: 'success', message: tr('Cod nou pentru {0}: {1}.', { '0': team.name, '1': formatTeamCode(updated.code) }) });
    } catch (err) {
      onNotify({ variant: 'error', message: err instanceof Error ? err.message : tr('Nu am putut schimba codul.') });
    }
  };
  const toggleCode = async (team: TeamJoinCode, enabled: boolean) => {
    setCodes((list) => (list ?? []).map((t) => (t.id === team.id ? { ...t, enabled } : t)));
    try {
      const updated = await familyRequestsApi.setCodeEnabled(team.id, enabled);
      setCodes((list) => (list ?? []).map((t) => (t.id === team.id ? updated : t)));
      onNotify({ variant: 'success', message: enabled ? tr('Înscrierile cu codul {0} sunt deschise.', { '0': team.name }) : tr('Înscrierile cu codul {0} sunt oprite.', { '0': team.name }) });
    } catch (err) {
      setCodes((list) => (list ?? []).map((t) => (t.id === team.id ? team : t)));
      onNotify({ variant: 'error', message: err instanceof Error ? err.message : tr('Nu am putut schimba starea codului.') });
    }
  };

  if (!codes) return <Skeleton className="h-[60px] w-full rounded-[14px] mb-3" />;
  return (
    <>
      <TeamCodes codes={codes} defaultOpen onRotate={setPendingRotate} onToggle={toggleCode} onNotify={onNotify} />
      <ConfirmDialog
        visible={pendingRotate != null}
        icon="refresh"
        title={pendingRotate ? tr('Schimbi codul pentru {0}?', { '0': pendingRotate.name }) : ''}
        message={tr('Codul vechi nu mai funcționează. Cererile deja trimise rămân.')}
        confirmLabel={tr('Schimbă codul')}
        cancelLabel={tr('Renunță')}
        onConfirm={() => { const team = pendingRotate; setPendingRotate(null); if (team) void rotate(team); }}
        onCancel={() => setPendingRotate(null)}
      />
    </>
  );
}

export default function FamilyRequestsPanel({ onNotify, onCountChange, showTeamCodes = true, hideEmpty = false }: {
  onNotify: Notify;
  onCountChange?: (count: number) => void;
  /** The coach's page keeps the team codes here; Acces shows them under Coduri. */
  showTeamCodes?: boolean;
  /** Nothing at all when there's no request (Acces shows one empty state for both queues). */
  hideEmpty?: boolean;
}) {
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
      setError(err instanceof Error ? err.message : tr('Nu am putut încărca cererile.'));
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
        message: `${request.child.firstName} ${request.child.lastName}: ${done.created ? tr('adăugat în {0}', { '0': request.team.name }) : tr('legat de jucătorul existent')}.`,
      });
    } catch (err) {
      onNotify({ variant: 'error', message: err instanceof Error ? err.message : tr('Nu am putut aproba cererea.') });
    } finally {
      setBusyId(null);
    }
  };

  const deny = async (request: FamilyJoinRequest) => {
    setBusyId(request.id);
    try {
      await familyRequestsApi.deny(request.id);
      remove(request.id);
      onNotify({ variant: 'success', message: tr('Cererea a fost respinsă.') });
    } catch (err) {
      onNotify({ variant: 'error', message: err instanceof Error ? err.message : tr('Nu am putut respinge cererea.') });
    } finally {
      setBusyId(null);
    }
  };

  const approveAll = async () => {
    const ids = autoApprovableIds(requests ?? []);
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const { results } = await familyRequestsApi.approveAll(ids);
      const ok = results.filter((r) => r.ok).length;
      const left = (requests?.length ?? 0) - ok;
      onNotify({ variant: ok === results.length ? 'success' : 'error', message: left ? tr('{ok} aprobate, {left} rămân pentru verificarea ta.', { ok, left }) : `${plural(ok, tr('cerere aprobată'), tr('cereri aprobate'))}.` });
      await load();
    } catch (err) {
      onNotify({ variant: 'error', message: err instanceof Error ? err.message : tr('Nu am putut aproba cererile.') });
    } finally {
      setBulkBusy(false);
    }
  };

  const rotate = async (team: TeamJoinCode) => {
    try {
      const updated = await familyRequestsApi.rotateCode(team.id);
      setCodes((list) => list.map((t) => (t.id === team.id ? updated : t)));
      onNotify({ variant: 'success', message: tr('Cod nou pentru {0}: {1}.', { '0': team.name, '1': formatTeamCode(updated.code) }) });
    } catch (err) {
      onNotify({ variant: 'error', message: err instanceof Error ? err.message : tr('Nu am putut schimba codul.') });
    }
  };

  const toggleCode = async (team: TeamJoinCode, enabled: boolean) => {
    setCodes((list) => list.map((t) => (t.id === team.id ? { ...t, enabled } : t)));
    try {
      const updated = await familyRequestsApi.setCodeEnabled(team.id, enabled);
      setCodes((list) => list.map((t) => (t.id === team.id ? updated : t)));
      onNotify({ variant: 'success', message: enabled ? tr('Înscrierile cu codul {0} sunt deschise.', { '0': team.name }) : tr('Înscrierile cu codul {0} sunt oprite.', { '0': team.name }) });
    } catch (err) {
      setCodes((list) => list.map((t) => (t.id === team.id ? team : t)));
      onNotify({ variant: 'error', message: err instanceof Error ? err.message : tr('Nu am putut schimba starea codului.') });
    }
  };

  // "Aprobă toți" only covers requests with no same-name player in the club.
  const bulkIds = useMemo(() => autoApprovableIds(requests ?? []), [requests]);
  const matched = (requests?.length ?? 0) - bulkIds.length;

  return (
    <View>
      {showTeamCodes ? <TeamCodes codes={codes} onRotate={(team) => setConfirm({ kind: 'rotate', team })} onToggle={toggleCode} onNotify={onNotify} /> : null}

      {error ? (
        <ErrorState title={hideEmpty ? tr('Nu am putut încărca înscrierile cu codul echipei') : tr('Nu am putut încărca cererile')} message={error} actionLabel={tr('Reîncearcă')} onAction={load} />
      ) : !requests ? (
        <View className="gap-2.5" accessibilityRole="progressbar" accessibilityLabel={tr('Se încarcă cererile')}>
          <Skeleton className="h-[180px] w-full rounded-[14px]" />
          <Skeleton className="h-[180px] w-full rounded-[14px]" />
        </View>
      ) : requests.length === 0 ? (
        hideEmpty ? null : <EmptyState
          compact
          icon="family-restroom"
          title={tr('Nicio înscriere nouă')}
          message={tr('Când un părinte sau un jucător folosește codul echipei, cererea apare aici.')}
        />
      ) : (
        <View className="gap-2.5">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-[14px] font-bold" style={{ color: 'var(--c-ink)' }}>
              {tr('Înscrieri în echipe · {0}', { '0': requests.length })}</Text>
            {bulkIds.length > 1 || (bulkIds.length === 1 && requests.length > 1) ? (
              <Pressable
                onPress={() => setConfirm({ kind: 'all' })}
                disabled={bulkBusy}
                accessibilityRole="button"
                className="ui-press h-9 px-3 rounded-[10px] border flex-row items-center gap-1.5"
                style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
              >
                {bulkBusy ? <ActivityIndicator size="small" color="var(--c-success-fg)" /> : <MaterialIcons name="done-all" size={16} color="var(--c-success-fg)" />}
                <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }}>
                  {matched ? tr('Aprobă toți fără potrivire ({0})', { '0': bulkIds.length }) : tr('Aprobă toți')}
                </Text>
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
          ? tr('Respingi cererea pentru {0} {1}?', { '0': confirm.request.child.firstName, '1': confirm.request.child.lastName })
          : confirm?.kind === 'rotate'
            ? tr('Schimbi codul pentru {0}?', { '0': confirm.team.name })
            : bulkIds.length === 1 ? tr('Aprobi cererea fără potrivire?') : tr('Aprobi cele {0} fără potrivire?', { '0': plural(bulkIds.length, 'cerere', 'cereri') })}
        message={confirm?.kind === 'deny'
          ? denyMessage(confirm.request)
          : confirm?.kind === 'rotate'
            ? tr('Codul vechi nu mai funcționează. Cererile deja trimise rămân.')
            : tr('Copiii fără niciun nume identic în club devin jucători noi în echipa cererii.{0}', { '0': matched ? ` ${matched === 1 ? tr('Cererea cu un jucător cu același nume rămâne pentru verificarea ta.') : tr('Cele {matched} cereri cu un jucător cu același nume rămân pentru verificarea ta, una câte una.', { matched })}` : '' })}
        confirmLabel={confirm?.kind === 'deny' ? tr('Respinge') : confirm?.kind === 'rotate' ? tr('Schimbă codul') : tr('Aprobă toți')}
        cancelLabel={tr('Renunță')}
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
