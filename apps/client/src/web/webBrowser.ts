export async function openBrowserAsync(url: string) {
  window.location.assign(url);
  return { type: 'opened' };
}

