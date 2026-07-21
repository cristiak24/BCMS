import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import { CalendarClock, ListOrdered } from 'lucide-react';
import { basketballApi, Match, StandingRow } from '../../../services/basketballApi';
import type { Team } from '../../../services/teamsApi';

type FrbView = 'matches' | 'standings';

export default function TeamFrbPanel({ team }: { team: Team }) {
    const [view, setView] = useState<FrbView>('matches');
    const [matches, setMatches] = useState<Match[] | null>(null);
    const [standings, setStandings] = useState<StandingRow[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            setError(null);
            try {
                if (view === 'matches' && matches === null) {
                    const data = await basketballApi.getMatches(team.frbLeagueId, team.frbSeasonId, team.frbTeamId);
                    if (!cancelled) setMatches(data);
                } else if (view === 'standings' && standings === null) {
                    const data = await basketballApi.getStandings(team.frbLeagueId, team.frbSeasonId);
                    if (!cancelled) setStandings(data);
                }
            } catch (e) {
                if (!cancelled) setError('Nu s-au putut încărca datele din FRB.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void run();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view]);

    const isOurTeam = (name: string) => name.trim().toLowerCase() === team.name.trim().toLowerCase();

    return (
        <View className="bg-white rounded-[20px] border border-[#E3E9F2] p-5">
            <View className="flex-row bg-[#F4F8FD] p-1 rounded-[14px] border border-[#DDE7F5] self-start mb-5">
                <Pressable onPress={() => setView('matches')} className={`flex-row items-center gap-1.5 px-3.5 py-2 rounded-[11px] ${view === 'matches' ? 'bg-white shadow-sm' : ''}`}>
                    <CalendarClock size={14} color={view === 'matches' ? '#1D3E90' : '#94A3B8'} />
                    <Text className={`text-[12px] font-black ${view === 'matches' ? 'text-[#1D3E90]' : 'text-[#94A3B8]'}`}>Meciuri</Text>
                </Pressable>
                <Pressable onPress={() => setView('standings')} className={`flex-row items-center gap-1.5 px-3.5 py-2 rounded-[11px] ${view === 'standings' ? 'bg-white shadow-sm' : ''}`}>
                    <ListOrdered size={14} color={view === 'standings' ? '#1D3E90' : '#94A3B8'} />
                    <Text className={`text-[12px] font-black ${view === 'standings' ? 'text-[#1D3E90]' : 'text-[#94A3B8]'}`}>Clasament</Text>
                </Pressable>
            </View>

            {loading ? (
                <View className="items-center justify-center py-12"><ActivityIndicator size="large" color="#1D3E90" /></View>
            ) : error ? (
                <Text className="text-[13px] font-bold text-[#94A3B8] py-8 text-center">{error}</Text>
            ) : view === 'matches' ? (
                !matches || matches.length === 0 ? (
                    <Text className="text-[13px] font-bold text-[#94A3B8] py-8 text-center">Niciun meci disponibil pentru acest sezon.</Text>
                ) : (
                    <View className="gap-2">
                        {matches.map((m, i) => (
                            <View key={`${m.date}-${i}`} className="flex-row items-center gap-3 rounded-[14px] bg-[#F7F9FC] px-4 py-3">
                                <View className="w-14 flex-none">
                                    <Text className="text-[11px] font-black text-[#0E2041]">{m.date}</Text>
                                    <Text className="text-[10px] font-bold text-[#94A3B8]">{m.time || '—'}</Text>
                                </View>
                                <View className="flex-1 min-w-0">
                                    <Text className={`text-[12.5px] ${isOurTeam(m.homeTeam) ? 'font-black text-[#1D3E90]' : 'font-bold text-[#475569]'}`} numberOfLines={1}>{m.homeTeam}</Text>
                                    <Text className={`text-[12.5px] ${isOurTeam(m.awayTeam) ? 'font-black text-[#1D3E90]' : 'font-bold text-[#475569]'}`} numberOfLines={1}>{m.awayTeam}</Text>
                                </View>
                                <View className="flex-none items-end">
                                    {m.status === 'finished' ? (
                                        <>
                                            <Text className="text-[13px] font-black text-[#0E2041]">{m.homeScore}</Text>
                                            <Text className="text-[13px] font-black text-[#0E2041]">{m.awayScore}</Text>
                                        </>
                                    ) : (
                                        <View className="px-2 py-0.5 rounded-full bg-[#EBF1FF]">
                                            <Text className="text-[10px] font-black text-[#1D3E90] uppercase">Programat</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        ))}
                    </View>
                )
            ) : (
                !standings || standings.length === 0 ? (
                    <Text className="text-[13px] font-bold text-[#94A3B8] py-8 text-center">Clasament indisponibil pentru acest sezon.</Text>
                ) : (
                    <View className="overflow-x-auto">
                        <table className="w-full min-w-[420px] border-collapse text-[13px]">
                            <thead>
                                <tr>
                                    <th className="text-left px-2 py-2 text-[10px] font-black uppercase tracking-widest text-[#94A3B8] w-8">#</th>
                                    <th className="text-left px-2 py-2 text-[10px] font-black uppercase tracking-widest text-[#94A3B8]">Echipă</th>
                                    <th className="text-center px-2 py-2 text-[10px] font-black uppercase tracking-widest text-[#94A3B8]">J</th>
                                    <th className="text-center px-2 py-2 text-[10px] font-black uppercase tracking-widest text-[#94A3B8]">V</th>
                                    <th className="text-center px-2 py-2 text-[10px] font-black uppercase tracking-widest text-[#94A3B8]">Î</th>
                                    <th className="text-center px-2 py-2 text-[10px] font-black uppercase tracking-widest text-[#94A3B8]">Pct</th>
                                </tr>
                            </thead>
                            <tbody>
                                {standings.map((row) => {
                                    const ours = isOurTeam(row.team);
                                    return (
                                        <tr key={row.position} className={`border-t border-[#F1F5F9] ${ours ? 'bg-[#EBF1FF]' : ''}`}>
                                            <td className="px-2 py-2.5 font-black text-[#64748B]">{row.position}</td>
                                            <td className={`px-2 py-2.5 ${ours ? 'font-black text-[#1D3E90]' : 'font-bold text-[#0E2041]'}`}>{row.team}</td>
                                            <td className="px-2 py-2.5 text-center font-bold text-[#475569]">{row.played}</td>
                                            <td className="px-2 py-2.5 text-center font-bold text-[#0B7A55]">{row.wins}</td>
                                            <td className="px-2 py-2.5 text-center font-bold text-[#B42318]">{row.losses}</td>
                                            <td className="px-2 py-2.5 text-center font-black text-[#0E2041]">{row.points}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </View>
                )
            )}
        </View>
    );
}
