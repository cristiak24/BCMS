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
  hideIconOnMobile,
  className,
}: {
  options: SelectOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Accessible name — the control has no visible label. */
  label: string;
  icon?: string;
  /** Phones get the full control width for text (16px anti-zoom font). */
  hideIconOnMobile?: boolean;
  className?: string;
}) {
  const iconPad = icon ? (hideIconOnMobile ? undefined : 34) : 12;
  return (
    <View className={`relative ${className ?? ''}`}>
      {icon ? (
        <View pointerEvents="none" className={`absolute left-3 top-0 bottom-0 justify-center z-10 ${hideIconOnMobile ? 'hidden lg:flex' : ''}`}>
          <MaterialIcons name={icon} size={16} color="var(--c-muted)" />
        </View>
      ) : null}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
        className={iconPad == null ? 'pl-3 lg:pl-[34px]' : undefined}
        style={{
          width: '100%',
          height: 36,
          borderRadius: 10,
          border: '1px solid var(--c-border)',
          backgroundColor: 'var(--c-surface)',
          paddingRight: 32,
          ...(iconPad != null ? { paddingLeft: iconPad } : null),
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
