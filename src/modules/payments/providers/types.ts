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
  amount: number; // centavos: importe de la operación (transaction_amount)
  currency: string;
  externalReference: string | null;
  totalPaid: number | null; // pagado por el comprador, incluye intereses de financiación
  net: number | null; // neto acreditado al vendedor
  fees: unknown; // detalle de cargos tal como lo informa el proveedor
  installments: number | null;
};

export interface PaymentProvider {
  readonly name: "mercadopago" | "simulator";
  readonly simulated: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  getPayment(providerPaymentId: string): Promise<ProviderPayment | null>;
}

export class ProviderError extends Error {}
