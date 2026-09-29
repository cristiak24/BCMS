export async function isAvailableAsync() {
  return Boolean(navigator.share);
}

export async function shareAsync(url: string, _options?: { UTI?: string; mimeType?: string; dialogTitle?: string }) {
  if (navigator.share) {
    await navigator.share({ url });
  }
}

