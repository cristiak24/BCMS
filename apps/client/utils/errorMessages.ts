/**
 * What a person sees from a server error. Older routes still answer in
 * English ("Event not found", "Invalid ID") and that text reached the screen
 * as is; those — and empty bodies — become a Romanian sentence for the HTTP
 * status. Romanian messages the server writes on purpose pass through.
 * Used by services/apiClient.ts for every ApiError.
 */

/** A plain Romanian sentence for an HTTP status, when the server's own text can't be shown. */
export function messageForStatus(status: number) {
  if (status === 400 || status === 422) return 'Datele trimise nu sunt valide. Verifică-le și încearcă din nou.';
  if (status === 401) return 'Sesiunea a expirat. Autentifică-te din nou.';
  if (status === 403) return 'Nu ai acces la această acțiune.';
  if (status === 404) return 'Nu am găsit ce cauți. Poate a fost șters între timp.';
  if (status === 409) return 'Între timp s-a schimbat ceva. Reîncarcă pagina și încearcă din nou.';
  if (status === 413) return 'Fișierul este prea mare.';
  if (status === 429) return 'Prea multe încercări într-un timp scurt. Mai încearcă peste un minut.';
  if (status >= 500) return 'A apărut o problemă pe server. Încearcă din nou peste câteva momente.';
  return 'Nu am putut finaliza acțiunea. Încearcă din nou.';
}

// Diacritics, or a common Romanian word, mean the server wrote it for people.
// Words that exist only in Romanian (not „club”, „data”, „cont…”, which English shares).
const ROMANIAN_HINT = /[ăâîșțşţĂÂÎȘȚŞŢ]|\b(nu|este|sunt|sau|trebuie|pentru|alege|poate|deja|timp|suma|numele|prenumele|codul|linkul|meciul|evenimentul|echipa|jucatorul|jucatori|plata|platii|clubul|contul|incorect[aă]?|lipseste|prea|valid[ae])\b/i;
const ENGLISH_HINT = /\b(the|not|is|are|was|invalid|required|found|failed|could|cannot|can't|access|you|your|please|error|unauthori[sz]ed|forbidden|missing|must|only|already|does|request|server|internal|token|allowed|exists?|with|status)\b/i;

export function userFacingMessage(message: string | null | undefined, status: number) {
  const text = String(message ?? '').trim();
  if (!text) return messageForStatus(status);
  if (ROMANIAN_HINT.test(text)) return text;
  if (ENGLISH_HINT.test(text)) return messageForStatus(status);
  return text;
}

/**
 * For a screen whose data didn't load: a 4xx keeps its sentence (already passed
 * through userFacingMessage), the network failure keeps its own, and a 5xx or a
 * broken reply becomes the plain server sentence — never the server's or the
 * browser's own text („boom: connection reset”, „Unexpected token <”).
 */
export function loadFailureMessage(error: unknown) {
  const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : null;
  if (status !== null && status < 500 && error instanceof Error) return error.message;
  return messageForStatus(500);
}
