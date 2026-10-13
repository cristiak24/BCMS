import { useEffect, useState } from 'react';
import ConfirmDialog from '../ui/ConfirmDialog';
import { FormField } from '../ui/FormField';
import { superAdminApi, type SuperAdminClub } from '../../services/superAdminApi';

/** "Club nou": a name is all a club needs; admins are invited afterwards. */
export default function CreateClubDialog({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (club: SuperAdminClub) => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setName('');
      setError(null);
      setSaving(false);
    }
  }, [visible]);

  const submit = async () => {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const { club } = await superAdminApi.createClub({ name: trimmed });
      onClose();
      onCreated(club);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut crea clubul.');
      setSaving(false);
    }
  };

  return (
    <ConfirmDialog
      visible={visible}
      title="Club nou"
      message="Clubul apare imediat în listă. Apoi invită-i administratorul."
      icon="apartment"
      confirmLabel="Creează clubul"
      loading={saving}
      confirmDisabled={!name.trim()}
      onConfirm={() => void submit()}
      onCancel={onClose}
    >
      <FormField
        label="Numele clubului"
        value={name}
        onChangeText={(value: string) => { setName(value); setError(null); }}
        placeholder="ex. CSM Târgu Mureș"
        autoCapitalize="words"
        error={error}
        onSubmitEditing={() => void submit()}
      />
    </ConfirmDialog>
  );
}
