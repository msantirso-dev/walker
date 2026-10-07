export type ProviderStatus = "APPROVED" | "PENDING" | "REJECTED" | "CANCELLED" | "REFUNDED";

export type CheckoutRequest = {
  paymentId: string; // va como external_reference
  orderCode: string;
  title: string;
  amount: number; // centavos
  payerEmail: string;
  payerName: string;
  backUrl: string; // página privada del pedido
  notificationUrl: string;
  expiresAt: Date;
  statementDescriptor?: string;
};

export type CheckoutResult = { preferenceId: string; initPoint: string };

export type ProviderPayment = {
  id: string;
  status: ProviderStatus;
  statusDetail: string;
  amount: number; // centavos
  currency: string;
  externalReference: string | null;
};

export interface PaymentProvider {
  readonly name: "mercadopago" | "simulator";
  readonly simulated: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  getPayment(providerPaymentId: string): Promise<ProviderPayment | null>;
}

export class ProviderError extends Error {}
