import { View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

/**
 * Compact dropdown for long option lists (teams, coaches).
 *
 * A club has 8-15 teams; as FilterChips they became a strip that ran off the
 * screen and cut names mid-word. A native <select> keeps the toolbar one
 * control wide at every breakpoint and opens the OS picker on phones.
 */
export type SelectOption<T extends string> = { key: T; label: string; count?: number };

export default function SelectField<T extends string>({
  options,
  value,
  onChange,
  label,
  icon,
  className,
}: {
  options: SelectOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Accessible name — the control has no visible label. */
  label: string;
  icon?: string;
  className?: string;
}) {
  return (
    <View className={`relative ${className ?? ''}`}>
      {icon ? (
        <View pointerEvents="none" className="absolute left-3 top-0 bottom-0 justify-center z-10">
          <MaterialIcons name={icon} size={16} color="var(--c-muted)" />
        </View>
      ) : null}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
        style={{
          width: '100%',
          height: 36,
          borderRadius: 10,
          border: '1px solid var(--c-border)',
          backgroundColor: 'var(--c-surface)',
          padding: `0 32px 0 ${icon ? 34 : 12}px`,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--c-ink)',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
          textOverflow: 'ellipsis',
        }}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.count != null ? `${option.label} (${option.count})` : option.label}
          </option>
        ))}
      </select>
      <View pointerEvents="none" className="absolute right-2.5 top-0 bottom-0 justify-center">
        <MaterialIcons name="expand-more" size={18} color="var(--c-faint)" />
      </View>
    </View>
  );
}
