import { useEffect, useState } from 'react';
import { Text, View } from '@/src/web/reactNative';
import ConfirmDialog from '../ui/ConfirmDialog';
import SelectField from '../ui/SelectField';
import { NOBODY, handoverTarget, type HandoverRequest } from '../../utils/coachHandover';

/**
 * "Cine preia echipele?" — shown when a coach being deactivated still leads
 * teams (utils/coachHandover.ts). Used by Conturi (club admin) and the super
 * admin's user page.
 */
export default function CoachHandoverDialog({
  request,
  personName,
  loading,
  onConfirm,
  onCancel,
}: {
  request: HandoverRequest | null;
  personName: string;
  loading?: boolean;
  onConfirm: (teamsReassignTo: number | null) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState<string>(NOBODY);
  useEffect(() => {
    setChoice(request?.candidates[0] ? String(request.candidates[0].id) : NOBODY);
  }, [request]);

  const teamCount = request?.teams.length ?? 0;
  const options = [
    ...(request?.candidates ?? []).map((c) => ({ key: String(c.id), label: `${c.name}${c.role === 'admin' ? ' (admin)' : ''}` })),
    { key: NOBODY, label: 'Nimeni deocamdată (fără antrenor)' },
  ];

  return (
    <ConfirmDialog
      visible={request != null}
      destructive
      title={`Dezactivezi contul lui ${personName}?`}
      message={`${personName} antrenează ${request?.teams.map((t) => t.name).join(', ') ?? ''}. Un antrenor dezactivat ar rămâne alocat ${teamCount === 1 ? 'echipei' : 'echipelor'} și nimeni nu le-ar mai putea prelua. Alege cine preia ${teamCount === 1 ? 'echipa' : 'echipele'}.`}
      confirmLabel="Dezactivează și realocă"
      cancelLabel="Anulează"
      loading={loading}
      onConfirm={() => onConfirm(handoverTarget(choice))}
      onCancel={onCancel}
    >
      <View className="gap-1.5">
        <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>
          {teamCount === 1 ? 'Echipa trece la' : 'Echipele trec la'}
        </Text>
        <SelectField label="Antrenorul care preia echipele" value={choice} onChange={setChoice} options={options} />
        {choice === NOBODY ? (
          <Text className="text-[12px]" style={{ color: 'var(--c-muted)' }}>
            Fără antrenor, orice antrenor al clubului poate gestiona echipa până alegi unul în Echipe.
          </Text>
        ) : null}
      </View>
    </ConfirmDialog>
  );
}
