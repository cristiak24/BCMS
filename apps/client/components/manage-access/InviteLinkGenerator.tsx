import { useEffect, useState } from 'react';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { ActivityIndicator, Platform, Share, Text, TextInput, View } from '@/src/web/reactNative';
import type { InviteLinkItem, InviteRole } from '../../types/manageAccess';
import {
    buildInviteRegistrationUrl,
    formatIntervalLabel,
    MAX_REFRESH_INTERVAL_MINUTES,
    MIN_REFRESH_INTERVAL_MINUTES,
    PRESET_REFRESH_INTERVALS,
} from '../../utils/manageAccess';
import RoleSelector, { AccessButton, AccessCard, FieldLabel, OptionChip, ROLE_LABELS, TeamPicker, type TeamOption } from './RoleSelector';
import CountdownTimer from './CountdownTimer';

type Props = {
    inviteLink: InviteLinkItem | null;
    loading: boolean;
    regenerating: boolean;
    error?: string | null;
    selectedRole: InviteRole;
    teams: TeamOption[];
    selectedTeamId: number | null;
    onTeamChange: (teamId: number | null) => void;
    refreshIntervalMinutes: number;
    onRoleChange: (role: InviteRole) => void;
    onRefreshIntervalChange: (minutes: number) => void;
    /** Called with a validated lifetime in minutes. */
    onGenerate: (minutes: number) => void;
    onCopied: () => void;
    onInvalidMinutes: (message: string) => void;
};

async function copyInviteLink(url: string): Promise<boolean> {
    const navigatorRef = typeof globalThis.navigator !== 'undefined'
        ? (globalThis.navigator as { clipboard?: { writeText: (value: string) => Promise<void>; }; })
        : undefined;

    if (Platform.OS === 'web' && navigatorRef?.clipboard) {
        await navigatorRef.clipboard.writeText(url);
        return true;
    }

    await Share.share({ message: url, url, title: 'Link de invitație' });
    return false;
}

/**
 * Role-scoped registration link. One card: who it is for, how long it lives,
 * and the live link itself with copy / regenerate. The custom-minutes field
 * only appears when "Altă durată" is picked instead of sitting there always.
 */
export default function InviteLinkGenerator({
    inviteLink,
    loading,
    regenerating,
    error,
    selectedRole,
    teams,
    selectedTeamId,
    onTeamChange,
    refreshIntervalMinutes,
    onRoleChange,
    onRefreshIntervalChange,
    onGenerate,
    onCopied,
    onInvalidMinutes,
}: Props) {
    const currentUrl = inviteLink ? buildInviteRegistrationUrl(inviteLink) : '';
    const [copied, setCopied] = useState(false);
    const [customOpen, setCustomOpen] = useState(() => !PRESET_REFRESH_INTERVALS.includes(refreshIntervalMinutes));
    const [customMinutes, setCustomMinutes] = useState(() => (
        PRESET_REFRESH_INTERVALS.includes(refreshIntervalMinutes) ? '' : String(refreshIntervalMinutes)
    ));

    // A stored link with a non-preset lifetime opens the custom field with it.
    useEffect(() => {
        if (!PRESET_REFRESH_INTERVALS.includes(refreshIntervalMinutes)) {
            setCustomOpen(true);
            setCustomMinutes(String(refreshIntervalMinutes));
        }
    }, [refreshIntervalMinutes]);

    const handleCopy = async () => {
        if (!currentUrl) return;
        try {
            if (await copyInviteLink(currentUrl)) {
                setCopied(true);
                onCopied();
                setTimeout(() => setCopied(false), 2000);
            }
        } catch {
            onInvalidMinutes('Nu am putut copia linkul. Încearcă din nou.');
        }
    };

    const handleGenerate = () => {
        if (!customOpen) {
            onGenerate(refreshIntervalMinutes);
            return;
        }
        const minutes = Number(customMinutes);
        if (!Number.isInteger(minutes) || minutes < MIN_REFRESH_INTERVAL_MINUTES || minutes > MAX_REFRESH_INTERVAL_MINUTES) {
            onInvalidMinutes(`Durata trebuie să fie între ${MIN_REFRESH_INTERVAL_MINUTES} și ${MAX_REFRESH_INTERVAL_MINUTES} de minute.`);
            return;
        }
        onRefreshIntervalChange(minutes);
        onGenerate(minutes);
    };

    const busy = loading || regenerating;

    return (
        <AccessCard>
            <View className="gap-4">
                <View>
                    <FieldLabel>Pentru</FieldLabel>
                    <RoleSelector selectedRole={selectedRole} onSelectRole={onRoleChange} />
                </View>

                {selectedRole === 'parent' ? <TeamPicker teams={teams} selectedTeamId={selectedTeamId} onSelect={onTeamChange} /> : null}

                <View>
                    <FieldLabel hint="după expirare linkul nu mai funcționează">Valabil</FieldLabel>
                    <View className="flex-row flex-wrap items-center gap-1.5">
                        {PRESET_REFRESH_INTERVALS.map((minutes) => (
                            <OptionChip
                                key={minutes}
                                label={formatIntervalLabel(minutes)}
                                active={!customOpen && refreshIntervalMinutes === minutes}
                                onPress={() => {
                                    setCustomOpen(false);
                                    onRefreshIntervalChange(minutes);
                                }}
                            />
                        ))}
                        <OptionChip
                            label="Altă durată"
                            active={customOpen}
                            onPress={() => {
                                if (!customOpen) setCustomMinutes('');
                                setCustomOpen(true);
                            }}
                        />
                        {customOpen ? (
                            <View
                                className="ui-rise flex-row items-center h-8 rounded-[9px] border pl-2.5 pr-2"
                                style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}
                            >
                                <TextInput
                                    value={customMinutes}
                                    onChangeText={(value: string) => setCustomMinutes(value.replace(/[^0-9]/g, '').slice(0, 4))}
                                    keyboardType="number-pad"
                                    accessibilityLabel="Durată în minute"
                                    placeholder="ex. 90"
                                    className="w-12 text-[13px] font-semibold outline-none bg-transparent t-num"
                                    style={{ color: 'var(--c-ink)' } as any}
                                    autoFocus
                                />
                                <Text className="text-[12px]" style={{ color: 'var(--c-faint)' }}>min</Text>
                            </View>
                        ) : null}
                    </View>
                </View>

                <View
                    className="rounded-[12px] border p-3.5"
                    style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}
                >
                    {loading ? (
                        <View className="h-[74px] items-center justify-center">
                            <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                        </View>
                    ) : inviteLink ? (
                        <View className="gap-3">
                            <View className="flex-row items-center gap-2">
                                <View className="w-2 h-2 rounded-full ui-ping" style={{ backgroundColor: 'var(--c-success-fg)' }} />
                                <Text className="text-[12.5px] font-semibold flex-1" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>
                                    Link activ · {ROLE_LABELS[inviteLink.role]}{inviteLink.teamName ? ` · ${inviteLink.teamName}` : ''}
                                </Text>
                                <Text className="text-[12px]" style={{ color: 'var(--c-faint)' }}>expiră în</Text>
                                <CountdownTimer expiresAt={inviteLink.expiresAt} />
                            </View>
                            <Text
                                selectable
                                numberOfLines={2}
                                className="text-[12px] leading-[17px]"
                                style={{ color: 'var(--c-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', wordBreak: 'break-all' } as any}
                            >
                                {currentUrl}
                            </Text>
                            <View className="flex-row gap-2">
                                <AccessButton
                                    className="flex-1"
                                    label={copied ? 'Copiat' : 'Copiază linkul'}
                                    icon={copied ? 'check' : 'content-copy'}
                                    onPress={() => void handleCopy()}
                                />
                                <AccessButton
                                    variant="secondary"
                                    label="Link nou"
                                    icon="autorenew"
                                    loading={regenerating}
                                    disabled={busy}
                                    onPress={handleGenerate}
                                />
                            </View>
                        </View>
                    ) : (
                        <View className="gap-3">
                            <View className="flex-row items-center gap-2.5">
                                <MaterialIcons name="link-off" size={18} color="var(--c-faint)" />
                                <Text className="text-[13px] flex-1" style={{ color: 'var(--c-muted)' }}>
                                    Niciun link activ pentru {ROLE_LABELS[selectedRole].toLowerCase()}{selectedTeamId != null ? ' din această echipă' : ''}.
                                </Text>
                            </View>
                            <AccessButton
                                label="Generează link"
                                icon="add-link"
                                loading={regenerating}
                                disabled={busy}
                                onPress={handleGenerate}
                            />
                        </View>
                    )}
                </View>

                {error ? (
                    <Text className="text-[12.5px] font-medium" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text>
                ) : null}
            </View>
        </AccessCard>
    );
}
