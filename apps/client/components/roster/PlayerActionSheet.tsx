import { useEffect, useState } from 'react';
import ActionSheet, { type SheetAction } from '../ui/ActionSheet';
import { Player, Team } from '../../services/teamsApi';
import { isPlayerActive } from './rosterHelpers';

interface PlayerActionSheetProps {
  visible: boolean;
  player: Player | null;
  teams: Team[];
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAttendanceLog: () => void;
  onPayments: () => void;
  onRemove: () => void;
  onRestore: (teamId: number) => void;
}

/**
 * A player's actions on Lot. Built on the shared ActionSheet (bottom sheet on
 * phones, centred card from sm) — it used to be its own raw Modal with blue
 * rgba tiles and 18px rows. Restoring an inactive player is a second step of
 * the same sheet: pick the team.
 */
export default function PlayerActionSheet({
  visible,
  player,
  teams,
  busy,
  onClose,
  onEdit,
  onAttendanceLog,
  onPayments,
  onRemove,
  onRestore,
}: PlayerActionSheetProps) {
  const [restoreMode, setRestoreMode] = useState(false);

  useEffect(() => {
    if (!visible) setRestoreMode(false);
  }, [visible]);

  if (!player) return null;

  const name = `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim() || 'Jucător';
  const meta = [player.number ? `#${player.number}` : null, player.position].filter(Boolean).join(' · ');

  const actions: SheetAction[] = restoreMode
    ? [
        { key: 'back', label: 'Înapoi', icon: 'arrow-back', onPress: () => setRestoreMode(false), keepOpen: true },
        ...teams.map((team) => ({
          key: `team-${team.id}`,
          label: team.name,
          icon: 'groups',
          onPress: () => { if (!busy) onRestore(team.id); },
        })),
      ]
    : [
        { key: 'edit', label: 'Editează detaliile', icon: 'edit', onPress: onEdit },
        { key: 'attendance', label: 'Jurnal de prezență', icon: 'fact-check', onPress: onAttendanceLog },
        { key: 'payments', label: 'Plăți și taxe', icon: 'payments', onPress: onPayments },
        isPlayerActive(player)
          ? { key: 'remove', label: 'Elimină din club', icon: 'person-remove', tone: 'danger' as const, onPress: () => { if (!busy) onRemove(); } }
          : {
              key: 'restore',
              label: 'Restaurează la echipă',
              icon: 'restore',
              hint: teams.length === 0 ? 'Clubul nu are încă echipe.' : undefined,
              onPress: () => { if (teams.length > 0) setRestoreMode(true); },
              keepOpen: teams.length > 0,
            },
      ];

  return (
    <ActionSheet
      visible={visible}
      title={name}
      subtitle={restoreMode ? 'Alege echipa de destinație' : meta || undefined}
      actions={actions}
      onClose={onClose}
    />
  );
}
