import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { Activity, ArrowLeft, CheckCircle, CreditCard, RotateCcw, UserX } from 'lucide-react';
import { Player, Team } from '../../services/teamsApi';
import { dash } from '../dashboard/dashboardTheme';
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

  const active = isPlayerActive(player);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable
        className="flex-1 items-center justify-center p-6"
        style={{ backgroundColor: 'rgba(10,15,28,0.4)' }}
        onPress={onClose}
      >
      <Pressable
        className="dash-fade-in relative w-full max-w-sm overflow-hidden rounded-3xl"
        style={{ backgroundColor: dash.surface, ...dash.shadow.lift }}
        onPress={(event: any) => event.stopPropagation()}
      >
        <View className="flex-row items-center border-b p-6" style={{ borderColor: dash.hairline }}>
          {restoreMode ? (
            <Pressable
              onPress={() => setRestoreMode(false)}
              className="mr-3 h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: dash.lineSoft }}
            >
              <ArrowLeft color={dash.inkSoft} size={16} />
            </Pressable>
          ) : (
            <View
              className="mr-4 h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}
            >
              <Text className="text-lg font-bold" style={{ color: dash.accentBlue }}>
                {player.firstName?.[0]}
                {player.lastName?.[0]}
              </Text>
            </View>
          )}
          <View>
            <Text className="text-xl font-bold" style={{ color: dash.ink }}>
              {player.firstName} {player.lastName}
            </Text>
            <Text className="text-sm" style={{ color: dash.muted }}>
              {restoreMode ? 'Alege echipa de destinație' : `#${player.number || '00'} • ${player.position || 'Sportiv'}`}
            </Text>
          </View>
        </View>

        {restoreMode ? (
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ padding: 12, gap: 8 }}>
            {teams.length === 0 ? (
              <Text className="p-4 text-center text-sm font-semibold" style={{ color: dash.muted }}>
                Nu există echipe disponibile.
              </Text>
            ) : (
              teams.map((team) => (
                <Pressable
                  key={team.id}
                  onPress={() => onRestore(team.id)}
                  disabled={busy}
                  className="dash-row-hover flex-row items-center justify-between rounded-2xl border px-4 py-3"
                  style={{ borderColor: dash.hairline, opacity: busy ? 0.6 : 1 }}
                >
                  <Text className="text-[14px] font-bold" style={{ color: dash.inkSoft }}>
                    {team.name}
                  </Text>
                  {busy ? <ActivityIndicator size="small" color={dash.accentBlue} /> : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        ) : (
          <View className="p-2">
            <Pressable onPress={onEdit} className="dash-row-hover flex-row items-center rounded-2xl p-4">
              <View className="mr-4 h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(37,99,235,0.08)' }}>
                <CheckCircle color={dash.accentBlue} size={20} />
              </View>
              <Text className="text-lg font-semibold" style={{ color: dash.inkSoft }}>
                Editează detaliile
              </Text>
            </Pressable>

            <Pressable onPress={onAttendanceLog} className="dash-row-hover flex-row items-center rounded-2xl p-4">
              <View className="mr-4 h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}>
                <Activity color={dash.successDeep} size={20} />
              </View>
              <Text className="text-lg font-semibold" style={{ color: dash.inkSoft }}>
                Jurnal de prezență
              </Text>
            </Pressable>

            <Pressable onPress={onPayments} className="dash-row-hover flex-row items-center rounded-2xl p-4">
              <View className="mr-4 h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(37,99,235,0.08)' }}>
                <CreditCard color={dash.accentBlue} size={20} />
              </View>
              <Text className="text-lg font-semibold" style={{ color: dash.inkSoft }}>
                Plăți și taxe
              </Text>
            </Pressable>

            {active ? (
              <Pressable
                onPress={onRemove}
                disabled={busy}
                className="dash-row-hover mt-2 flex-row items-center rounded-2xl p-4"
              >
                <View className="mr-4 h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
                  {busy ? <ActivityIndicator size="small" color={dash.dangerDeep} /> : <UserX color={dash.dangerDeep} size={20} />}
                </View>
                <Text className="text-lg font-semibold" style={{ color: dash.dangerDeep }}>
                  Elimină din club
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setRestoreMode(true)}
                className="dash-row-hover mt-2 flex-row items-center rounded-2xl p-4"
              >
                <View className="mr-4 h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}>
                  <RotateCcw color={dash.successDeep} size={20} />
                </View>
                <Text className="text-lg font-semibold" style={{ color: dash.successDeep }}>
                  Restaurează la echipă
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </Pressable>
      </Pressable>
    </Modal>
  );
}
