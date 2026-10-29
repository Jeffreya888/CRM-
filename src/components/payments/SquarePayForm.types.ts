export type SquarePayKind = 'invoice' | 'deposit' | 'care_plan';

export type SquarePayFormProps = {
  /** What is being paid; care_plan saves the card and charges the first month. */
  kind: SquarePayKind;
  /** Public link token of the invoice, quote or care plan. */
  token: string;
  /** Web address of this same page, for opening it in a browser from the app. */
  pageUrl: string;
  buttonLabel: string;
  /** "paid" (card), "pending" (bank payment still settling) or "active" (care plan). */
  onDone: (status: 'paid' | 'pending' | 'active') => void;
};

/** Square's browser SDK (https://web.squarecdn.com/v1/square.js), the parts we use. */
export type SquareTokenResult = { status: string; token?: string; errors?: { message?: string }[] };
export type SquareMethod = {
  attach?: (selector: string) => Promise<void>;
  tokenize: (details?: Record<string, unknown>) => Promise<SquareTokenResult>;
  destroy?: () => Promise<void>;
};
export type SquarePayments = {
  card: (opts?: Record<string, unknown>) => Promise<SquareMethod>;
  paymentRequest: (req: Record<string, unknown>) => unknown;
  applePay: (req: unknown) => Promise<SquareMethod>;
  googlePay: (req: unknown) => Promise<SquareMethod>;
};
