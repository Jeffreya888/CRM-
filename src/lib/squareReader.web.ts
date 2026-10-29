// In-person payments use phone hardware (Tap to Pay / Square readers): app only.
export const inPersonSupported = (): boolean => false;

export type InPersonResult = { status: 'paid' } | { status: 'canceled' } | { status: 'failed'; message: string };

export async function takeInPersonPayment(_invoiceId: string, _amount?: number): Promise<InPersonResult> {
  return { status: 'failed', message: 'Take in-person payments from the iPhone or Android app.' };
}

export async function openReaderSettings() {
  throw new Error('Pair card readers from the iPhone or Android app.');
}
