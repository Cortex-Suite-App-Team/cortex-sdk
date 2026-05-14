export function readSdkDebugFlag(): boolean {
  try {
    return (
      (globalThis as typeof globalThis & { localStorage?: { getItem(key: string): string | null } })
        .localStorage?.getItem('cortex_debug')
    ) === '1';
  } catch {
    return false;
  }
}

export function debugLog(
  enabled: boolean,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!enabled) {
    return;
  }
  if (data === undefined) {
    console.debug(message);
    return;
  }
  console.debug(message, data);
}
