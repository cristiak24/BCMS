import ConfirmDialog from './ConfirmDialog';
import Button from './Button';
import type { useLeaveGuard } from '../../hooks/useLeaveGuard';

import { tr } from '../../i18n';
/**
 * The question `useLeaveGuard` asks when a page with unsaved changes is left
 * (the sidebar, the bottom bar, „Înapoi”): save and go, stay, or go without
 * saving. `what` names the draft („lista L12 a meciului”, „nota pentru jucători”).
 */
export default function LeaveGuardDialog({ guard, saving, what, onSave }: {
  guard: ReturnType<typeof useLeaveGuard>;
  saving: boolean;
  what: string;
  /** Resolves true once saved; the dialog then carries on where the person was going. */
  onSave: () => Promise<boolean>;
}) {
  return (
    <ConfirmDialog
      visible={guard.pending}
      icon="save"
      title={tr('Salvezi modificările?')}
      message={tr('Ai modificări nesalvate în {what}. Dacă pleci fără să le salvezi, se pierd.', { what })}
      confirmLabel={tr('Salvează și pleacă')}
      cancelLabel={tr('Rămân pe pagină')}
      loading={saving}
      onConfirm={() => { void onSave().then((ok) => { if (ok) guard.leave(); }); }}
      onCancel={guard.stay}
    >
      <Button variant="ghost" label={tr('Pleacă fără salvare')} disabled={saving} onPress={guard.leave} className="self-start" />
    </ConfirmDialog>
  );
}
