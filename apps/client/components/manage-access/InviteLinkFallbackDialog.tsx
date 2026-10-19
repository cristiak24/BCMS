import { useEffect, useState } from 'react';
import { Text, View } from '@/src/web/reactNative';
import ConfirmDialog from '../ui/ConfirmDialog';

/**
 * The invitation exists but its email could not be sent (WP7-F3): the admin
 * copies the link and passes it on. The invitation stays in the club's list
 * (revocable, expiring as usual), so closing this loses nothing.
 */
export default function InviteLinkFallbackDialog({
  invite,
  onClose,
}: {
  invite: { email: string; inviteUrl: string; emailError?: string | null } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { setCopied(false); }, [invite?.inviteUrl]);

  const copy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <ConfirmDialog
      visible={invite != null}
      icon="link"
      title="Emailul nu a plecat"
      message={invite?.emailError ?? `Invitația pentru ${invite?.email ?? ''} e creată, dar emailul nu a putut fi trimis. Copiază linkul și trimite-l tu.`}
      confirmLabel={copied ? 'Copiat' : 'Copiază linkul invitației'}
      cancelLabel="Închide"
      onConfirm={() => void copy()}
      onCancel={onClose}
    >
      {invite ? (
        <View className="rounded-[10px] border px-3 py-2.5" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}>
          <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-muted)' }}>Pentru {invite.email}</Text>
          <Text className="t-num text-[12.5px] mt-1" style={{ color: 'var(--c-ink)', wordBreak: 'break-all', userSelect: 'all' } as any}>{invite.inviteUrl}</Text>
        </View>
      ) : null}
    </ConfirmDialog>
  );
}
