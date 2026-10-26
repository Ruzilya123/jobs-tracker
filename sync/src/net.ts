/**
 * fetch с тайм-аутом и понятной ошибкой: какой сервис не ответил и что с этим делать.
 * Без этого Node пишет только «The operation was aborted due to timeout».
 */
export async function request(label: string, url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    const host = new URL(url).host;
    if (err.name === 'TimeoutError' || err.name === 'AbortError')
      throw new Error(`${label}: ${host} не ответил за ${Math.round(timeoutMs / 1000)} с. ${hint(host)}`);
    throw new Error(`${label}: не удалось подключиться к ${host} (${err.cause?.code ?? err.message}). ${hint(host)}`);
  }
}

function hint(host: string) {
  if (host.includes('telegram'))
    return 'Похоже, Telegram API недоступен из этой сети (в РФ его часто замедляют). Варианты: запустить с VPN, указать TELEGRAM_API_URL (свой прокси) или оставить бота только на GitHub Actions — там Telegram доступен.';
  if (host.includes('google')) return 'Проверьте интернет/VPN: Google API должен открываться из этой сети.';
  return '';
}
