import { useState } from 'react';
import { Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import Button from '../ui/Button';
import { enablePush, nudgeSnoozed, snoozeNudge, usePushState } from '../../src/pwa/push';
import type { PushKind } from '../../services/pushApi';
import { tr } from '../../i18n';

/**
 * The one in-context invitation to turn on push (Val 3B): under the answer
 * buttons after a family's answer, and in Prezență when the coach sees an
 * announced absence. Never a dialog over the screen, never when the browser
 * blocks or can't do push, never on an iPhone where the app isn't installed
 * (the install banner covers that). „Nu acum” hides it for 30 days.
 */
export default function PushNudge(props: { kind: PushKind; message: string }) {
    // Snoozed: not even the two requests the state needs.
    const [hidden, setHidden] = useState(() => nudgeSnoozed());
    return hidden ? null : <Invitation {...props} onHide={() => setHidden(true)} />;
}

function Invitation({ kind, message, onHide }: { kind: PushKind; message: string; onHide: () => void }) {
    const { state, reload } = usePushState();
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);

    if (done) {
        return (
            <View className="ui-rise flex-row items-center gap-2" accessibilityRole="status">
                <MaterialIcons name="check-circle" size={15} color="var(--c-success-fg)" />
                <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-success-fg)' }}>{tr('Notificările sunt active pe acest dispozitiv.')}</Text>
            </View>
        );
    }
    if (state.loading || !state.serverEnabled || !state.publicKey || !state.kinds.includes(kind)) return null;
    if (state.support !== 'supported' || state.permission === 'denied' || state.currentEndpoint) return null;

    const enable = async () => {
        setBusy(true);
        // Straight from the tap: iOS shows the dialog only inside the gesture.
        const result = await enablePush(state.publicKey!);
        setBusy(false);
        if (result === 'enabled') {
            setDone(true);
            return;
        }
        if (result === 'dismissed' || result === 'denied') {
            snoozeNudge();
            onHide();
            return;
        }
        void reload();
    };

    return (
        <View
            className="ui-rise rounded-[12px] border px-3.5 py-3 gap-2.5"
            style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}
        >
            <View className="flex-row items-start gap-2.5">
                <MaterialIcons name="notifications-active" size={16} color="var(--c-muted)" />
                <Text className="text-[13px] flex-1" style={{ color: 'var(--c-ink-soft)' }}>{message}</Text>
            </View>
            <View className="flex-row flex-wrap items-center gap-2">
                <Button label={tr('Activează notificările')} variant="primary" size="sm" onPress={() => void enable()} loading={busy} />
                <Button
                    label={tr('Nu acum')}
                    variant="ghost"
                    size="sm"
                    onPress={() => {
                        snoozeNudge();
                        onHide();
                    }}
                />
            </View>
        </View>
    );
}
