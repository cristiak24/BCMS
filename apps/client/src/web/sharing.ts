export async function isAvailableAsync() {
  return Boolean(navigator.share);
}

export async function shareAsync(url: string) {
  if (navigator.share) {
    await navigator.share({ url });
  }
}

