import { useEffect, useRef, useState } from 'react';
import { Text, View } from '@/src/web/reactNative';
import { useRouter } from '@/src/web/expoRouter';
import ActionSheet, { type SheetAction } from '../ui/ActionSheet';
import ConfirmDialog from '../ui/ConfirmDialog';
import SelectField from '../ui/SelectField';
import { superAdminApi, type ClubRole } from '../../services/superAdminApi';
import { CLUB_ROLE_ORDER, roleLabel } from './format';

/**
 * Row actions for an account or a pending invite, shared by Utilizatori and a
 * club's Membri tab: ⋯ sheet first, then a confirmation for anything that
 * changes access. The server enforces the same rules (no self-edits, no
 * superadmin edits, no moving accounts still tied to their club's data).
 */

export type ActionTarget = {
  id: number | string;
  name: string;
  email: string;
  role: string;
  status: string;
  clubId: number | null;
  clubName?: string | null;
  source: 'user' | 'invite';
};

type Step = 'menu' | 'role' | 'move' | 'deactivate' | 'reactivate' | 'revoke';

export default function UserActions({
  target,
  selfId,
  showClubLink = false,
  onClose,
  onChanged,
  notify,
}: {
  target: ActionTarget | null;
  selfId?: number | null;
  /** Adds "Deschide clubul" (from the platform-wide user list). */
  showClubLink?: boolean;
  onClose: () => void;
  onChanged: () => void;
  notify: (variant: 'success' | 'error', message: string) => void;
}) {
  const router = useRouter();
  const [step, setStepState] = useState<Step>('menu');
  // Read by the sheet's deferred close (below) before React re-renders.
  const stepRef = useRef<Step>('menu');
  const setStep = (next: Step) => {
    stepRef.current = next;
    setStepState(next);
  };
  const [role, setRole] = useState<ClubRole>('coach');
  const [clubId, setClubId] = useState<string>('');
  const [clubs, setClubs] = useState<Array<{ id: number; name: string }> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    setStep('menu');
    setBusy(false);
    setRole((CLUB_ROLE_ORDER as string[]).includes(target.role) ? (target.role as ClubRole) : 'coach');
    setClubId(target.clubId == null ? '' : String(target.clubId));
  }, [target]);

  useEffect(() => {
    if (step !== 'move' || clubs) return;
    superAdminApi.listClubs()
      .then((response) => setClubs(response.clubs.map((club) => ({ id: club.id, name: club.name })).sort((a, b) => a.name.localeCompare(b.name, 'ro'))))
      .catch(() => setClubs([]));
  }, [step, clubs]);

  if (!target) return null;

  const isInvite = target.source === 'invite';
  const locked = target.role === 'superadmin' || (typeof target.id === 'number' && target.id === selfId);
  const name = target.name || target.email;

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      notify('success', message);
      onClose();
      onChanged();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Acțiunea nu a reușit.');
      setBusy(false);
    }
  };

  const copyEmail = () => {
    void navigator.clipboard?.writeText(target.email).then(
      () => notify('success', 'Email copiat.'),
      () => notify('error', 'Nu am putut copia emailul.'),
    );
  };

  const actions: SheetAction[] = [];
  if (isInvite) {
    actions.push({ key: 'revoke', label: 'Revocă invitația', icon: 'link-off', tone: 'danger', hint: 'Linkul din email nu va mai funcționa.', onPress: () => setStep('revoke') });
  } else if (!locked) {
    actions.push({ key: 'role', label: 'Schimbă rolul', icon: 'swap-horiz', hint: `Acum: ${roleLabel(target.role)}`, onPress: () => setStep('role') });
    actions.push({ key: 'move', label: 'Mută în alt club', icon: 'apartment', hint: target.clubName ?? undefined, onPress: () => setStep('move') });
    if (target.status === 'disabled') {
      actions.push({ key: 'reactivate', label: 'Reactivează contul', icon: 'how-to-reg', onPress: () => setStep('reactivate') });
    } else {
      actions.push({ key: 'deactivate', label: 'Dezactivează contul', icon: 'block', tone: 'danger', hint: 'Pierde accesul imediat; datele rămân.', onPress: () => setStep('deactivate') });
    }
  }
  if (showClubLink && target.clubId != null) {
    actions.push({ key: 'club', label: 'Deschide clubul', icon: 'chevron-right', hint: target.clubName ?? undefined, onPress: () => router.push(`/super-admin/clubs/${target.clubId}`) });
  }
  actions.push({ key: 'copy', label: 'Copiază emailul', icon: 'content-copy', hint: target.email, onPress: copyEmail });

  const numericId = Number(target.id);
  const cancel = () => (busy ? undefined : onClose());

  return (
    <>
      <ActionSheet
        visible={step === 'menu'}
        title={name}
        subtitle={locked && !isInvite ? 'Cont protejat — doar vizualizare' : `${roleLabel(target.role)}${target.clubName ? ` · ${target.clubName}` : ''}`}
        actions={actions}
        // The sheet closes itself before running an action: only a real
        // dismissal (backdrop, Escape) should drop the target.
        onClose={() => setTimeout(() => { if (stepRef.current === 'menu') onClose(); }, 0)}
      />

      <ConfirmDialog
        visible={step === 'role'}
        title="Schimbă rolul"
        message={`${name} primește imediat permisiunile noului rol.`}
        icon="swap-horiz"
        confirmLabel="Salvează"
        loading={busy}
        confirmDisabled={role === target.role}
        onConfirm={() => void run(() => superAdminApi.updateUser(numericId, { role }), `${name} este acum ${roleLabel(role).toLowerCase()}.`)}
        onCancel={cancel}
      >
        <SelectField<ClubRole>
          label="Rol nou"
          value={role}
          onChange={setRole}
          options={CLUB_ROLE_ORDER.map((key) => ({ key, label: roleLabel(key) }))}
        />
      </ConfirmDialog>

      <ConfirmDialog
        visible={step === 'move'}
        title="Mută în alt club"
        message="Contul vede doar datele noului club. Conturile legate de copii, echipe sau un profil de jucător trebuie întâi scoase din clubul actual."
        icon="apartment"
        confirmLabel="Mută contul"
        loading={busy}
        confirmDisabled={!clubId || clubId === String(target.clubId ?? '')}
        onConfirm={() => {
          const next = clubs?.find((club) => String(club.id) === clubId);
          void run(() => superAdminApi.updateUser(numericId, { clubId: Number(clubId) }), `Contul lui ${name} a fost mutat în ${next?.name ?? "noul club"}.`);
        }}
        onCancel={cancel}
      >
        {clubs == null ? (
          <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Se încarcă cluburile…</Text>
        ) : (
          <View>
            <SelectField<string>
              label="Club"
              icon="apartment"
              value={clubId}
              onChange={setClubId}
              options={[{ key: '', label: 'Alege clubul…' }, ...clubs.map((club) => ({ key: String(club.id), label: club.name }))]}
            />
          </View>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        visible={step === 'deactivate'}
        title={`Dezactivezi contul lui ${name}?`}
        message="Pierde accesul la următoarea acțiune în aplicație. Datele rămân și îl poți reactiva oricând. Nu mai intră la facturare din luna următoare."
        destructive
        confirmLabel="Dezactivează"
        loading={busy}
        onConfirm={() => void run(() => superAdminApi.updateUser(numericId, { status: 'disabled' }), `Contul lui ${name} a fost dezactivat.`)}
        onCancel={cancel}
      />

      <ConfirmDialog
        visible={step === 'reactivate'}
        title={`Reactivezi contul lui ${name}?`}
        message="Își recapătă accesul cu rolul și clubul de dinainte."
        icon="how-to-reg"
        confirmLabel="Reactivează"
        loading={busy}
        onConfirm={() => void run(() => superAdminApi.updateUser(numericId, { status: 'active' }), `Contul lui ${name} este din nou activ.`)}
        onCancel={cancel}
      />

      <ConfirmDialog
        visible={step === 'revoke'}
        title="Revoci invitația?"
        message={`Linkul trimis la ${target.email} nu va mai funcționa. Poți trimite oricând o invitație nouă.`}
        destructive
        confirmLabel="Revocă"
        loading={busy}
        onConfirm={() => void run(() => superAdminApi.revokeInvitation(target.id), 'Invitația a fost revocată.')}
        onCancel={cancel}
      />
    </>
  );
}
