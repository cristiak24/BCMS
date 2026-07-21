export default function DateTimePicker({ value, onChange, mode = 'date' }: any) {
  const date = value instanceof Date ? value : new Date();
  const inputValue =
    mode === 'time'
      ? date.toTimeString().slice(0, 5)
      : date.toISOString().slice(0, 10);

  return (
    <input
      type={mode === 'time' ? 'time' : 'date'}
      value={inputValue}
      onChange={(event) => {
        const next = mode === 'time'
          ? new Date(`${date.toISOString().slice(0, 10)}T${event.target.value}`)
          : new Date(event.target.value);
        onChange?.({ type: 'set' }, next);
      }}
    />
  );
}

