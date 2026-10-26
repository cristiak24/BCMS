import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import ModalBackdrop from '../ui/ModalBackdrop';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import Button from '../ui/Button';
import { FormField } from '../ui/FormField';
import { announce } from '../ui/LiveRegion';
import { OptionChip } from './RoleSelector';
import CountdownTimer from './CountdownTimer';
import { clubAdminApi } from '../../services/clubAdminApi';
import { manageAccessApi } from '../../services/manageAccessApi';
import { familyRequestsApi, formatTeamCode, type TeamJoinCode } from '../../services/familyRequestsApi';
import { getPublicAppUrl } from '../../config/serverUrl';
import { formatDateTime, parseApiDate } from '../../utils/dates';
import { plural } from '../../utils/plural';
import { buildInviteRegistrationUrl, DEFAULT_REFRESH_INTERVAL_MINUTES } from '../../utils/manageAccess';
import type { InviteCodeItem, InviteLinkItem } from '../../types/manageAccess';

/**
 * One „Invită” entry for the four mechanisms the club already has (email
 * invitation, group code, team code, role link). The admin answers who and
 * how; the flow picks the mechanism and ends on something to send plus one
 * sentence on what happens next. Server rules are untouched — see
 * .impeccable/briefs/invita.md for the mapping.
 */

type Who = 'parent' | 'player' | 'coach' | 'accountant';
type How = 'team-code' | 'group-code' | 'email';
type Step = 1 | 2 | 3;

type Result =
    | { kind: 'team-code'; team: TeamJoinCode }
    | { kind: 'group-code'; code: InviteCodeItem }
    | { kind: 'email'; email: string; expiresAt: string; inviteUrl: string; emailSent: boolean; emailError?: string | null }
    | { kind: 'link'; link: InviteLinkItem };

export type InviteCreated = Result['kind'];

const WHO_OPTIONS: { key: Who; label: string; hint: string; icon: string }[] = [
    { key: 'parent', label: 'Părinte', hint: 'Își înscrie copilul în club.', icon: 'family-restroom' },
    { key: 'player', label: 'Jucător', hint: 'Cont propriu de jucător.', icon: 'sports-basketball' },
    { key: 'coach', label: 'Antrenor', hint: 'Conduce antrenamente și echipe.', icon: 'sports' },
    { key: 'accountant', label: 'Contabil', hint: 'Vede plățile și documentele financiare.', icon: 'account-balance' },
];

const WHO_LABEL: Record<Who, string> = { parent: 'Părinte', player: 'Jucător', coach: 'Antrenor', accountant: 'Contabil' };

const VALIDITY_OPTIONS: { label: string; hours: number }[] = [
    { label: '1 zi', hours: 24 },
    { label: '3 zile', hours: 72 },
    { label: '7 zile', hours: 24 * 7 },
    { label: '30 de zile', hours: 24 * 30 },
];

const STEPS: { step: Step; title: string }[] = [
    { step: 1, title: 'Pe cine inviți?' },
    { step: 2, title: 'Cum primește invitația?' },
    { step: 3, title: 'Gata de trimis' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A parent code is one per family (two parents); the other roles share a code across a group.
const defaultUses = (who: Who) => (who === 'parent' ? '2' : '25');

const withTeam = (who: Who) => who === 'parent' || who === 'player';

// Which methods take the chosen team along: the server keeps a team on a group
// code only for parents, and an email invitation never carries one.
const carriesTeam = (how: How | 'link', who: Who) => how === 'team-code' || how === 'link' || (how === 'group-code' && who === 'parent');

const teamDroppedNote = (teamName: string) => `Nu ține de echipa ${teamName}: adaugă contul în echipă după ce se creează.`;

const formatExpiry = formatDateTime;

function signupLink(token: string) {
    return `${getPublicAppUrl()}/signup?inviteToken=${encodeURIComponent(token)}`;
}

/** What gets copied, what the share sheet sends, and what happens on the other side. */
function describe(result: Result, who: Who, droppedTeam: string | null) {
    const details = describeResult(result, who);
    return droppedTeam ? { ...details, next: `${details.next} ${teamDroppedNote(droppedTeam)}` } : details;
}

function describeResult(result: Result, who: Who) {
    switch (result.kind) {
        case 'team-code': {
            const code = formatTeamCode(result.team.code);
            const link = signupLink(result.team.code);
            return {
                value: code,
                mono: true,
                copy: code,
                share: `Înscriere în echipa ${result.team.name} pe BCMS: ${link}\nSau introdu codul ${code} la „Creează cont”.`,
                facts: [`Codul echipei ${result.team.name}`, 'nu expiră'],
                next: 'Fiecare înscriere ajunge la Cereri și o aprobi tu sau antrenorul echipei.',
                approval: true,
            };
        }
        case 'group-code': {
            const link = signupLink(result.code.code);
            return {
                value: result.code.code,
                mono: true,
                copy: result.code.code,
                share: `Creează-ți contul pe BCMS: ${link}\nSau introdu codul ${result.code.code} la „Creează cont”.`,
                facts: [
                    result.code.teamName ? `${WHO_LABEL[who]} · ${result.code.teamName}` : WHO_LABEL[who],
                    `expiră ${formatExpiry(result.code.expiresAt)}`,
                    `cel mult ${plural(result.code.maxUses, 'cont', 'conturi')}`,
                ],
                next: who === 'coach'
                    ? 'Fiecare antrenor care folosește codul așteaptă aprobarea ta la Cereri.'
                    : 'Cine folosește codul intră direct în club, fără aprobare.',
                approval: who === 'coach',
            };
        }
        case 'email':
            return {
                value: result.emailSent ? result.email : result.inviteUrl,
                mono: !result.emailSent,
                copy: result.inviteUrl,
                share: `Creează-ți contul pe BCMS: ${result.inviteUrl}`,
                facts: [result.emailSent ? 'Email trimis' : `Pentru ${result.email}`, `expiră ${formatExpiry(result.expiresAt)}`],
                // The server's emailError already says what to do ("Copiază linkul… și trimite-l tu").
                next: result.emailSent
                    ? 'Contul se creează din linkul primit și intră direct în club. Dacă expiră, o retrimiți din Conturi.'
                    : `${result.emailError ?? 'Invitația e creată, dar emailul nu a plecat. Copiază linkul și trimite-l tu.'} O găsești și în Conturi.`,
                approval: false,
            };
        case 'link': {
            const url = buildInviteRegistrationUrl(result.link);
            return {
                value: url,
                mono: true,
                copy: url,
                share: `Creează-ți contul pe BCMS: ${url}`,
                facts: [result.link.teamName ? `${WHO_LABEL[who]} · ${result.link.teamName}` : WHO_LABEL[who]],
                next: 'Linkul e pentru o singură persoană și expiră repede. Contul așteaptă aprobarea ta la Cereri.',
                approval: true,
            };
        }
    }
}

type Props = {
    visible: boolean;
    onClose: () => void;
    /** Something now exists on the server — lets the page reload its list. */
    onCreated?: (kind: InviteCreated) => void;
};

export default function InviteFlow({ visible, onClose, onCreated }: Props) {
    const cardRef = useRef<HTMLDivElement | null>(null);
    const headingRef = useRef<HTMLHeadingElement | null>(null);
    const [step, setStep] = useState<Step>(1);
    const [who, setWho] = useState<Who>('parent');
    const [teamId, setTeamId] = useState<number | null>(null);
    const [how, setHow] = useState<How>('group-code');
    const [validityHours, setValidityHours] = useState(24 * 7);
    const [maxUses, setMaxUses] = useState(defaultUses('parent'));
    const [label, setLabel] = useState('');
    const [email, setEmail] = useState('');
    const [errors, setErrors] = useState<{ label?: string; email?: string; maxUses?: string }>({});
    const [teams, setTeams] = useState<TeamJoinCode[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [linkBusy, setLinkBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<Result | null>(null);
    // The choices `result` was made from: Back from step 3 and Continue again
    // with nothing changed reopens it instead of creating a second code.
    const [resultFor, setResultFor] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const reset = useCallback(() => {
        setStep(1);
        setWho('parent');
        setTeamId(null);
        setHow('group-code');
        setValidityHours(24 * 7);
        setMaxUses(defaultUses('parent'));
        setLabel('');
        setEmail('');
        setErrors({});
        setError(null);
        setResult(null);
        setResultFor(null);
        setCopied(false);
    }, []);

    useEffect(() => {
        if (!visible) return;
        reset();
        setTeams(null);
        void familyRequestsApi.teamCodes().then(setTeams).catch(() => setTeams([]));
    }, [visible, reset]);

    const team = teams?.find((item) => item.id === teamId) ?? null;
    const teamCodeOpen = team != null && team.enabled !== false;

    const methods: { key: How; label: string; hint: string; icon: string; disabled?: boolean }[] = (() => {
        if (who === 'accountant') {
            return [{ key: 'email', label: 'Email', hint: 'Contabilii se invită doar prin email. Linkul e valabil 7 zile.', icon: 'mail-outline' }];
        }
        const email = { key: 'email' as const, label: 'Email', hint: 'O invitație personală, valabilă 7 zile. Intră direct în club.', icon: 'mail-outline' };
        if (who === 'coach') {
            return [
                email,
                { key: 'group-code', label: 'Cod de trimis în grup', hint: 'Pentru mai mulți antrenori. Fiecare cont așteaptă aprobarea ta.', icon: 'confirmation-number' },
            ];
        }
        const list: { key: How; label: string; hint: string; icon: string; disabled?: boolean }[] = [];
        if (team) {
            list.push(teamCodeOpen
                ? { key: 'team-code', label: `Folosește codul echipei ${team.name}`, hint: `${formatTeamCode(team.code)} · nu expiră. Cererile le aprobi tu sau antrenorul echipei.`, icon: 'vpn-key' }
                : { key: 'team-code', label: `Codul echipei ${team.name}`, hint: 'Înscrierile cu codul echipei sunt oprite. Le pornești din Cereri › Codurile echipelor.', icon: 'vpn-key', disabled: true });
        }
        // A team chosen in step 1 that this method won't carry: said here, not discovered later.
        const dropped = (key: How) => (team && !carriesTeam(key, who) ? ` ${teamDroppedNote(team.name)}` : '');
        list.push({
            key: 'group-code',
            label: 'Cod nou de trimis în grup',
            hint: (who === 'parent'
                ? 'Un cod per familie (2 conturi). Intră direct în club.'
                : 'Un cod pentru un grup (până la 25 de conturi). Intră direct în club.') + dropped('group-code'),
            icon: 'confirmation-number',
        });
        list.push({ ...email, hint: email.hint + dropped('email') });
        return list;
    })();

    const pickWho = (next: Who) => {
        setWho(next);
        if (!withTeam(next)) setTeamId(null);
        setMaxUses(defaultUses(next));
        setErrors({});
    };

    const goToStep = (next: Step) => {
        setError(null);
        setStep(next);
    };

    const continueFromWho = () => {
        // The team code goes first when the family's team accepts it; coaches and accountants default to email.
        setHow(withTeam(who) ? (teamCodeOpen ? 'team-code' : 'group-code') : 'email');
        goToStep(2);
    };

    const choiceKey = (kind: Result['kind']) => JSON.stringify([kind, who, teamId, validityHours, maxUses, label.trim(), email.trim().toLowerCase()]);
    const reopenable = result != null && resultFor === choiceKey(how);

    const finish = (next: Result) => {
        setResult(next);
        setResultFor(choiceKey(next.kind));
        setCopied(false);
        goToStep(3);
        onCreated?.(next.kind);
    };

    const submit = async () => {
        if (reopenable) {
            goToStep(3);
            return;
        }
        if (how === 'team-code') {
            if (team && teamCodeOpen) finish({ kind: 'team-code', team });
            return;
        }

        if (how === 'group-code') {
            const uses = Number(maxUses);
            if (!Number.isInteger(uses) || uses < 1 || uses > 500) {
                setErrors({ maxUses: 'Între 1 și 500 de conturi.' });
                return;
            }
            setBusy(true);
            setError(null);
            try {
                const created = await manageAccessApi.createInviteCode({
                    role: who === 'accountant' ? 'player' : who,
                    teamId: who === 'parent' ? teamId : null,
                    expiresInHours: validityHours,
                    maxUses: uses,
                });
                finish({ kind: 'group-code', code: created });
            } catch (createError) {
                setError(createError instanceof Error ? createError.message : 'Nu am putut genera codul.');
            } finally {
                setBusy(false);
            }
            return;
        }

        const normalizedLabel = label.trim().replace(/\s+/g, ' ');
        const normalizedEmail = email.trim().toLowerCase();
        const nextErrors: typeof errors = {};
        if (!normalizedLabel) nextErrors.label = 'Adaugă o etichetă ca să recunoști invitația.';
        if (!normalizedEmail) nextErrors.email = 'Emailul este obligatoriu.';
        else if (!EMAIL_RE.test(normalizedEmail)) nextErrors.email = 'Introdu o adresă de email validă.';
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setBusy(true);
        setError(null);
        try {
            // The label is admin-only; the member enters their real name when registering.
            const response = await clubAdminApi.createInvitation({ email: normalizedEmail, fullName: normalizedLabel, role: who });
            finish({
                kind: 'email',
                email: response.invitation.email,
                expiresAt: response.invitation.expiresAt,
                inviteUrl: response.invitation.inviteUrl,
                emailSent: response.invitation.emailSent !== false,
                emailError: response.invitation.emailError,
            });
        } catch (inviteError) {
            setError(inviteError instanceof Error ? inviteError.message : 'Nu am putut crea invitația.');
        } finally {
            setBusy(false);
        }
    };

    /** „Altă metodă”: the role link for one person (short-lived, approved at Cereri). */
    const openRoleLink = async () => {
        if (who === 'accountant') return;
        setBusy(true);
        setLinkBusy(true);
        setError(null);
        try {
            const scopedTeam = withTeam(who) ? teamId : null;
            const active = await manageAccessApi.getActiveInviteLink(who, scopedTeam);
            const link = active && parseApiDate(active.expiresAt).getTime() > Date.now()
                ? active
                : await manageAccessApi.generateInviteLink(who, DEFAULT_REFRESH_INTERVAL_MINUTES, scopedTeam);
            finish({ kind: 'link', link });
        } catch (linkError) {
            setError(linkError instanceof Error ? linkError.message : 'Nu am putut genera linkul.');
        } finally {
            setBusy(false);
            setLinkBusy(false);
        }
    };

    const details = result ? describe(result, who, team && !carriesTeam(result.kind, who) ? team.name : null) : null;
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    const copy = async () => {
        if (!details) return;
        try {
            await navigator.clipboard.writeText(details.copy);
            setCopied(true);
            announce('Copiat.');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setError('Nu am putut copia. Selectează textul și copiază-l manual.');
        }
    };

    const share = async () => {
        if (!details) return;
        try {
            await navigator.share({ title: 'Invitație BCMS', text: details.share });
        } catch {
            // Share sheet dismissed — nothing to do.
        }
    };

    // Escape closes, Tab stays inside, focus returns to the trigger; body scroll locked.
    useEffect(() => {
        if (!visible || typeof document === 'undefined') return undefined;
        const previouslyFocused = document.activeElement as HTMLElement | null;
        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';

        const focusables = () => Array.from(
            cardRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [],
        ).filter((el) => !el.hasAttribute('disabled'));

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !busy) {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const items = focusables();
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (event.shiftKey && (active === first || !cardRef.current?.contains(active))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = overflow;
            previouslyFocused?.focus?.();
        };
    }, [visible, busy, onClose]);

    // Each step announces itself: focus moves to its heading.
    useEffect(() => {
        if (!visible) return undefined;
        const timer = window.setTimeout(() => headingRef.current?.focus(), 0);
        return () => window.clearTimeout(timer);
    }, [visible, step]);

    if (!visible) return null;

    const summary: Record<Step, string | null> = {
        // The team only when the chosen method keeps it (not on an email or a player's group code).
        1: step > 1 ? `${WHO_LABEL[who]}${team && carriesTeam(result?.kind ?? how, who) ? ` · ${team.name}` : ''}` : null,
        2: step > 2 ? (result?.kind === 'link' ? 'Link de înscriere' : methods.find((item) => item.key === how)?.label ?? null) : null,
        3: null,
    };

    const primary = step === 1
        ? { label: 'Continuă', onPress: continueFromWho, disabled: false }
        : step === 2
            ? {
                label: how === 'team-code' ? 'Folosește codul echipei' : reopenable ? (how === 'group-code' ? 'Vezi codul creat' : 'Vezi invitația creată') : how === 'group-code' ? 'Generează codul' : 'Trimite invitația',
                onPress: () => void submit(),
                disabled: how === 'team-code' && !teamCodeOpen,
            }
            : { label: 'Gata', onPress: onClose, disabled: false };

    return (
        <Modal visible transparent onRequestClose={busy ? undefined : onClose}>
            <ModalBackdrop
                onDismiss={busy ? undefined : onClose}
                className="flex-1 items-stretch sm:items-center justify-center sm:p-6"
                style={{ backgroundColor: 'rgba(2, 8, 23, 0.55)' }}
            >
                <div
                    ref={cardRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="invite-flow-title"
                    className="ui-rise flex flex-col w-full h-[100dvh] sm:h-auto sm:max-h-[min(720px,calc(100dvh-48px))] sm:max-w-[760px] sm:rounded-[18px] sm:border overflow-hidden"
                    style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-lg)' }}
                >
                    {/* Header */}
                    <View className="flex-row items-center gap-3 px-4 sm:px-5 h-14 border-b shrink-0 pt-[env(safe-area-inset-top)]" style={{ borderColor: 'var(--c-border)' }}>
                        <View className="flex-1 min-w-0">
                            <Text nativeID="invite-flow-title" className="text-[16px] font-bold" style={{ color: 'var(--c-ink)' }}>Invită</Text>
                        </View>
                        <Text className="md:hidden t-meta" style={{ color: 'var(--c-muted)' }}>Pasul {step} din 3</Text>
                        <Pressable
                            onPress={onClose}
                            disabled={busy}
                            accessibilityRole="button"
                            accessibilityLabel="Închide"
                            className="ui-press w-10 h-10 -mr-2 rounded-[10px] items-center justify-center"
                        >
                            <MaterialIcons name="close" size={20} color="var(--c-muted)" />
                        </Pressable>
                    </View>

                    <View className="flex-1 min-h-0 flex-row">
                        {/* Desktop: the steps side by side with what was chosen. */}
                        <View className="hidden md:flex w-[210px] shrink-0 border-r px-4 py-5 gap-4" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' }}>
                            {STEPS.map((item) => {
                                const done = item.step < step;
                                const current = item.step === step;
                                return (
                                    <View key={item.step} className="flex-row items-start gap-2.5" aria-current={current ? 'step' : undefined}>
                                        <View
                                            className="w-6 h-6 rounded-full items-center justify-center shrink-0 border"
                                            style={{
                                                backgroundColor: current ? 'var(--c-brand-surface)' : 'var(--c-surface)',
                                                borderColor: current ? 'transparent' : 'var(--c-border)',
                                            } as any}
                                        >
                                            {done ? (
                                                <MaterialIcons name="check" size={14} color="var(--c-brand-fg)" />
                                            ) : (
                                                <Text className="text-[12px] font-bold t-num" style={{ color: current ? 'var(--c-on-brand)' : 'var(--c-muted)' }}>{item.step}</Text>
                                            )}
                                        </View>
                                        <View className="flex-1 min-w-0 pt-0.5">
                                            <Text className="text-[13px] font-semibold" style={{ color: current ? 'var(--c-ink)' : 'var(--c-muted)' }}>{item.title}</Text>
                                            {summary[item.step] ? (
                                                <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>{summary[item.step]}</Text>
                                            ) : null}
                                        </View>
                                    </View>
                                );
                            })}
                        </View>

                        {/* Current step */}
                        <View className="flex-1 min-w-0 min-h-0 overflow-y-auto px-4 sm:px-6 py-5">
                            <h2
                                ref={headingRef}
                                tabIndex={-1}
                                className="text-[18px] font-bold tracking-tight outline-none mb-4"
                                style={{ color: 'var(--c-ink-strong)' }}
                            >
                                {/* A failed email is not „Gata de trimis”: the heading says what happened. */}
                                {step === 3 && result?.kind === 'email' && !result.emailSent ? 'Emailul nu a plecat' : STEPS[step - 1].title}
                            </h2>

                            {step === 1 ? (
                                <View className="gap-5">
                                    <ChoiceList
                                        label="Rol"
                                        options={WHO_OPTIONS}
                                        value={who}
                                        onChange={pickWho}
                                    />

                                    {withTeam(who) ? (
                                        teams == null ? (
                                            <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                                        ) : teams.length === 0 ? (
                                            <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>
                                                Clubul nu are încă echipe, așa că invitația nu ține de o echipă.
                                            </Text>
                                        ) : (
                                            <View>
                                                <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>
                                                    Echipă <Text className="font-medium" style={{ color: 'var(--c-faint)' }}>· opțional</Text>
                                                </Text>
                                                <View className="flex-row flex-wrap gap-1.5">
                                                    <OptionChip label="Fără echipă" active={teamId == null} onPress={() => setTeamId(null)} />
                                                    {teams.map((item) => (
                                                        <OptionChip key={item.id} label={item.name} active={teamId === item.id} onPress={() => setTeamId(item.id)} />
                                                    ))}
                                                </View>
                                                <Text className="text-[12px] font-medium mt-1.5" style={{ color: 'var(--c-faint)' }}>
                                                    {teamId == null
                                                        ? 'Fără echipă, contul nu intră în nicio echipă până îl adaugi tu într-una.'
                                                        : 'Cu echipa aleasă poți trimite direct codul echipei.'}
                                                </Text>
                                            </View>
                                        )
                                    ) : null}
                                </View>
                            ) : step === 2 ? (
                                <View className="gap-5">
                                    <ChoiceList
                                        label="Metodă"
                                        options={methods}
                                        value={how}
                                        onChange={(next) => {
                                            setHow(next);
                                            setErrors({});
                                            setError(null);
                                        }}
                                    />

                                    {how === 'group-code' ? (
                                        <View className="flex-col sm:flex-row gap-4">
                                            <View className="sm:flex-1">
                                                <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>Valabil</Text>
                                                <View className="flex-row flex-wrap gap-1.5">
                                                    {VALIDITY_OPTIONS.map((option) => (
                                                        <OptionChip
                                                            key={option.hours}
                                                            label={option.label}
                                                            active={option.hours === validityHours}
                                                            onPress={() => setValidityHours(option.hours)}
                                                        />
                                                    ))}
                                                </View>
                                            </View>
                                            <View>
                                                <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>Max. conturi</Text>
                                                <TextInput
                                                    value={maxUses}
                                                    onChangeText={(value: string) => {
                                                        setMaxUses(value.replace(/[^0-9]/g, '').slice(0, 3));
                                                        setErrors({});
                                                    }}
                                                    keyboardType="number-pad"
                                                    accessibilityLabel="Număr maxim de conturi"
                                                    aria-invalid={errors.maxUses ? true : undefined}
                                                    className="w-full sm:w-28 h-8 [@media(pointer:coarse)]:h-10 rounded-[9px] border px-3 text-[13px] font-semibold outline-none t-num"
                                                    style={{ backgroundColor: 'var(--c-surface-2)', borderColor: errors.maxUses ? 'var(--c-danger)' : 'var(--c-border)', color: 'var(--c-ink)' } as any}
                                                />
                                                <Text className="text-[12px] font-medium mt-1.5" style={{ color: errors.maxUses ? 'var(--c-danger-fg)' : 'var(--c-faint)' }}>
                                                    {errors.maxUses ?? '1–500'}
                                                </Text>
                                            </View>
                                        </View>
                                    ) : how === 'email' ? (
                                        <View className="flex-col md:flex-row gap-4">
                                            <View className="md:flex-1">
                                                <FormField
                                                    label="Etichetă"
                                                    hint="O văd doar administratorii. Persoana își scrie numele real la crearea contului."
                                                    error={errors.label}
                                                    value={label}
                                                    onChangeText={(value: string) => {
                                                        setLabel(value);
                                                        setErrors((current) => ({ ...current, label: undefined }));
                                                    }}
                                                    placeholder="ex. Andrei Popescu"
                                                    autoCapitalize="sentences"
                                                />
                                            </View>
                                            <View className="md:flex-1">
                                                <FormField
                                                    label="Email"
                                                    error={errors.email}
                                                    value={email}
                                                    onChangeText={(value: string) => {
                                                        setEmail(value);
                                                        setErrors((current) => ({ ...current, email: undefined }));
                                                    }}
                                                    onBlur={() => {
                                                        const value = email.trim();
                                                        if (value && !EMAIL_RE.test(value)) setErrors((current) => ({ ...current, email: 'Introdu o adresă de email validă.' }));
                                                    }}
                                                    placeholder="nume@exemplu.ro"
                                                    autoCapitalize="none"
                                                    keyboardType="email-address"
                                                    onSubmitEditing={() => void submit()}
                                                />
                                            </View>
                                        </View>
                                    ) : null}
                                    {who !== 'accountant' ? (
                                        <View className="border-t pt-3" style={{ borderColor: 'var(--c-border)' }}>
                                            {/* Offered here, before anything is created (it used to appear only after a code or an email). */}
                                            <Pressable
                                                onPress={() => void openRoleLink()}
                                                disabled={busy}
                                                accessibilityRole="button"
                                                className="ui-press self-start flex-row items-center gap-1.5 min-h-10 -ml-1 px-1 rounded-[8px]"
                                            >
                                                {linkBusy ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="add-link" size={16} color="var(--c-brand-fg)" />}
                                                <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>
                                                    Altă metodă: link pentru o singură persoană
                                                </Text>
                                            </Pressable>
                                        </View>
                                    ) : null}
                                </View>
                            ) : details ? (
                                <View className="gap-4">
                                    <View className="rounded-[12px] border p-4" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}>
                                        {result?.kind === 'email' && result.emailSent ? (
                                            <View className="flex-row items-center gap-2.5">
                                                <MaterialIcons name="mark-email-read" size={20} color="var(--c-success-fg)" />
                                                <Text className="flex-1 min-w-0 text-[15px] font-semibold" style={{ color: 'var(--c-ink-strong)', wordBreak: 'break-all' } as any}>
                                                    {details.value}
                                                </Text>
                                            </View>
                                        ) : (
                                            <Text
                                                selectable
                                                className={`t-num ${details.mono && details.value.length < 16 ? 'text-[22px] font-bold tracking-[0.12em]' : 'text-[13px] leading-5'}`}
                                                style={{
                                                    color: 'var(--c-ink-strong)',
                                                    wordBreak: 'break-all',
                                                    userSelect: 'all',
                                                } as any}
                                            >
                                                {details.value}
                                            </Text>
                                        )}
                                        <Text className="t-meta mt-2" style={{ color: 'var(--c-muted)' }}>
                                            {details.facts.join(' · ')}
                                            {result?.kind === 'link' ? <> · expiră în <CountdownTimer expiresAt={result.link.expiresAt} /></> : null}
                                        </Text>
                                    </View>

                                    {!(result?.kind === 'email' && result.emailSent) ? (
                                        <View className="flex-row gap-2">
                                            <Button
                                                variant="primary"
                                                icon={copied ? 'check' : 'content-copy'}
                                                label={copied ? 'Copiat' : result?.kind === 'link' || result?.kind === 'email' ? 'Copiază linkul' : 'Copiază codul'}
                                                onPress={() => void copy()}
                                                className="flex-1 sm:flex-none"
                                            />
                                            {canShare ? (
                                                <Button icon="share" label="Trimite" onPress={() => void share()} className="flex-1 sm:flex-none" />
                                            ) : null}
                                        </View>
                                    ) : null}

                                    <View className="flex-row items-start gap-2.5">
                                        <MaterialIcons
                                            name={result?.kind === 'email' && !result.emailSent ? 'error-outline' : details.approval ? 'how-to-reg' : 'info-outline'}
                                            size={17}
                                            color={result?.kind === 'email' && !result.emailSent ? 'var(--c-warning-fg)' : 'var(--c-muted)'}
                                        />
                                        <Text className="flex-1 text-[13px] leading-5" style={{ color: 'var(--c-ink-soft)' }}>
                                            {details.next}
                                        </Text>
                                    </View>
                                </View>
                            ) : null}

                            {error ? (
                                <View className="flex-row items-start gap-2 mt-4 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--c-danger-bg)' }} accessibilityRole={'alert' as any}>
                                    <MaterialIcons name="error-outline" size={16} color="var(--c-danger-fg)" />
                                    <Text className="flex-1 text-[13px] font-medium" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text>
                                </View>
                            ) : null}
                        </View>
                    </View>

                    {/* Footer: Back on every step, one primary. */}
                    <View
                        className="flex-row items-center gap-2 px-4 sm:px-5 py-3 border-t shrink-0 pb-[max(12px,env(safe-area-inset-bottom))]"
                        style={{ borderColor: 'var(--c-border)' }}
                    >
                        {step === 1 ? (
                            <Button label="Renunță" onPress={onClose} />
                        ) : (
                            <Button label="Înapoi" icon="arrow-back" disabled={busy} onPress={() => goToStep(step === 3 ? 2 : 1)} />
                        )}
                        <View className="flex-1" />
                        {step === 3 ? (
                            <Button label="Invită pe altcineva" variant="ghost" onPress={reset} className="hidden sm:flex" />
                        ) : null}
                        <Button
                            variant="primary"
                            label={primary.label}
                            loading={busy && !linkBusy && step === 2}
                            disabled={primary.disabled || busy}
                            onPress={primary.onPress}
                        />
                    </View>
                </div>
            </ModalBackdrop>
        </Modal>
    );
}

/** Radio list in one bordered container with separators (dense-list rule). */
function ChoiceList<K extends string>({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: { key: K; label: string; hint: string; icon: string; disabled?: boolean }[];
    value: K;
    onChange: (key: K) => void;
}) {
    return (
        <View
            className="rounded-[12px] border overflow-hidden"
            style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
            accessibilityRole={'radiogroup' as any}
            accessibilityLabel={label}
        >
            {options.map((option, index) => {
                const active = option.key === value && !option.disabled;
                return (
                    <Pressable
                        key={option.key}
                        onPress={() => onChange(option.key)}
                        disabled={option.disabled}
                        accessibilityRole={'radio' as any}
                        accessibilityState={{ checked: active, disabled: Boolean(option.disabled) }}
                        className={`ui-press flex-row items-start gap-3 px-3.5 py-3 text-left ${index > 0 ? 'border-t' : ''}`}
                        style={{
                            borderColor: 'var(--c-border)',
                            backgroundColor: active ? 'var(--c-surface-tint)' : 'transparent',
                            opacity: option.disabled ? 0.6 : 1,
                            cursor: option.disabled ? 'not-allowed' : 'pointer',
                        } as any}
                    >
                        <MaterialIcons name={option.icon} size={19} color={active ? 'var(--c-brand-fg)' : 'var(--c-muted)'} />
                        <View className="flex-1 min-w-0">
                            <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>{option.label}</Text>
                            <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>{option.hint}</Text>
                        </View>
                        <MaterialIcons
                            name={active ? 'radio-button-checked' : 'radio-button-unchecked'}
                            size={18}
                            color={active ? 'var(--c-brand-fg)' : 'var(--c-faint)'}
                        />
                    </Pressable>
                );
            })}
        </View>
    );
}
