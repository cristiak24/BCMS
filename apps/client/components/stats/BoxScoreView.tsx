import { Text, View } from '@/src/web/reactNative';
import type { BoxScore, GameMode, PlayerLine } from '../../utils/gameStats';
import type { GameRosterEntry, OpponentEntry } from '../../services/gamesApi';

/**
 * The box score. Simple mode shows points and fouls; full mode adds shooting
 * (made/attempted), rebounds, assists, steals, blocks, turnovers and minutes.
 * Scrolls sideways inside its own box on phones, never the page.
 */

function pct(made: number, att: number) {
  return att ? `${Math.round((made / att) * 100)}%` : '—';
}

function minutes(sec: number | null) {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type Column = { key: string; label: string; get: (l: PlayerLine) => string | number; full?: boolean };

const COLUMNS: Column[] = [
  { key: 'pts', label: 'Pct', get: (l) => l.pts },
  { key: 'min', label: 'Min', get: (l) => minutes(l.secondsPlayed), full: true },
  { key: '2p', label: '2P', get: (l) => `${l.fgm2}/${l.fga2}`, full: true },
  { key: '3p', label: '3P', get: (l) => `${l.fgm3}/${l.fga3}`, full: true },
  { key: 'll', label: 'LL', get: (l) => `${l.ftm}/${l.fta}`, full: true },
  { key: 'fg', label: 'Arunc. %', get: (l) => pct(l.fgm2 + l.fgm3, l.fga2 + l.fga3), full: true },
  { key: 'reb', label: 'Rec', get: (l) => l.rebO + l.rebD, full: true },
  { key: 'ast', label: 'As', get: (l) => l.ast, full: true },
  { key: 'stl', label: 'Fu', get: (l) => l.stl, full: true },
  { key: 'blk', label: 'Ca', get: (l) => l.blk, full: true },
  { key: 'tov', label: 'Pi', get: (l) => l.tov, full: true },
  { key: 'pf', label: 'F', get: (l) => l.pf },
];

function Table({ rows, mode, totalLabel }: { rows: { key: string; number: string; name: string; line: PlayerLine }[]; mode: GameMode; totalLabel: string }) {
  const columns = COLUMNS.filter((c) => mode === 'full' || !c.full);
  const total: PlayerLine = rows.reduce((acc, r) => {
    (Object.keys(acc) as (keyof PlayerLine)[]).forEach((k) => {
      if (k === 'secondsPlayed') return;
      (acc[k] as number) += r.line[k] as number;
    });
    return acc;
  }, { pts: 0, fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0, rebO: 0, rebD: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, secondsPlayed: null } as PlayerLine);

  const cell = 'px-2 py-2 text-[13px] t-num text-right whitespace-nowrap';
  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--c-border)', backgroundColor: 'var(--c-surface)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: mode === 'full' ? 640 : 0 }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--c-surface-2)' }}>
            <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--c-faint)' }}>Jucător</th>
            {columns.map((c) => (
              <th key={c.key} className="px-2 py-2 text-right text-[11px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--c-faint)' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderTop: '1px solid var(--c-border)' }}>
              <td className="px-2 py-2 text-[13px] whitespace-nowrap" style={{ color: 'var(--c-ink)' }}>
                <span className="t-num font-bold" style={{ color: 'var(--c-muted)', marginRight: 6 }}>{r.number ? `#${r.number}` : ''}</span>
                {r.name}
              </td>
              {columns.map((c) => (
                <td key={c.key} className={cell} style={{ color: c.key === 'pts' ? 'var(--c-ink-strong)' : c.key === 'pf' && r.line.pf >= 5 ? 'var(--c-danger-fg)' : 'var(--c-ink-soft)', fontWeight: c.key === 'pts' ? 700 : 500 }}>
                  {c.get(r.line)}
                </td>
              ))}
            </tr>
          ))}
          <tr style={{ borderTop: '1px solid var(--c-border-strong)', backgroundColor: 'var(--c-surface-2)' }}>
            <td className="px-2 py-2 text-[13px] font-bold" style={{ color: 'var(--c-ink)' }}>{totalLabel}</td>
            {columns.map((c) => (
              <td key={c.key} className={cell} style={{ color: 'var(--c-ink)', fontWeight: 700 }}>{c.key === 'min' ? '' : c.get(total)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function BoxScoreView({
  box,
  mode,
  roster,
  opponentRoster,
  teamName,
  opponentName,
}: {
  box: BoxScore;
  mode: GameMode;
  roster: GameRosterEntry[];
  opponentRoster: OpponentEntry[];
  teamName: string;
  opponentName: string;
}) {
  const ours = roster
    .filter((p) => box.players[p.playerId])
    .map((p) => ({ key: String(p.playerId), number: p.number, name: `${p.lastName} ${p.firstName}`.trim(), line: box.players[p.playerId] }))
    .sort((a, b) => b.line.pts - a.line.pts || Number(a.number || 99) - Number(b.number || 99));
  const theirs = opponentRoster
    .filter((o) => box.opponents[o.number])
    .map((o) => ({ key: o.number, number: o.number, name: o.name || '—', line: box.opponents[o.number] }))
    .sort((a, b) => b.line.pts - a.line.pts);

  return (
    <View className="gap-4">
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--c-border)', backgroundColor: 'var(--c-surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--c-surface-2)' }}>
              <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--c-faint)' }}>Echipa</th>
              {box.byPeriod.map((p) => (
                <th key={p.period} className="px-2 py-2 text-right text-[11px] font-bold" style={{ color: 'var(--c-faint)' }}>{p.period > 4 ? `P${p.period - 4}` : `S${p.period}`}</th>
              ))}
              <th className="px-3 py-2 text-right text-[11px] font-bold uppercase" style={{ color: 'var(--c-faint)' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {[{ name: teamName, key: 'us' as const }, { name: opponentName, key: 'them' as const }].map((t) => (
              <tr key={t.key} style={{ borderTop: '1px solid var(--c-border)' }}>
                <td className="px-3 py-2 text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }}>{t.name}</td>
                {box.byPeriod.map((p) => (
                  <td key={p.period} className="px-2 py-2 text-[13px] t-num text-right" style={{ color: 'var(--c-ink-soft)' }}>{p[t.key]}</td>
                ))}
                <td className="px-3 py-2 text-[15px] t-num text-right font-bold" style={{ color: 'var(--c-ink-strong)' }}>{box[t.key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <View className="gap-2">
        <Text className="text-[14px] font-bold" style={{ color: 'var(--c-ink)' }}>{teamName}</Text>
        <Table rows={ours} mode={mode} totalLabel="Echipa" />
      </View>

      {theirs.length ? (
        <View className="gap-2">
          <Text className="text-[14px] font-bold" style={{ color: 'var(--c-ink)' }}>{opponentName}</Text>
          <Table rows={theirs} mode="simple" totalLabel="Pe jucători" />
        </View>
      ) : null}

      {mode === 'full' ? (
        <Text className="t-meta" style={{ color: 'var(--c-faint)' }}>
          Min = minute jucate · 2P/3P/LL = reușite/încercate · Rec = recuperări · As = pase decisive · Fu = furturi · Ca = capace · Pi = pierderi · F = faulturi
        </Text>
      ) : null}
    </View>
  );
}
