import { describe, expect, it } from 'vitest';
import { createEvent, type DomainEvent, type PaymentScenario } from '@plateia/contracts';
import { makePaymentHandlers, type Payment, type PaymentRepository } from './handlers';

class InMemoryPayments implements PaymentRepository {
  readonly payments = new Map<string, Payment>();
  readonly published: DomainEvent[] = [];

  async record(payment: Payment, outcome: DomainEvent): Promise<boolean> {
    if (this.payments.has(payment.orderId)) return false;
    this.payments.set(payment.orderId, payment);
    this.published.push(outcome);
    return true;
  }

  async refund(orderId: string): Promise<boolean> {
    const payment = this.payments.get(orderId);
    if (payment?.status !== 'approved') return false;
    payment.status = 'refunded';
    return true;
  }
}

const ORDER_ID = '33333333-3333-4333-8333-333333333333';

function setup() {
  const payments = new InMemoryPayments();
  let counter = 0;
  const handlers = makePaymentHandlers({
    payments,
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    simulateProvider: async () => {},
  });
  const orderCreated = (paymentScenario: PaymentScenario) =>
    createEvent('order.created', {
      orderId: ORDER_ID,
      eventId: 'show',
      seatIds: ['vip:1:1'],
      totalCents: 20000,
      paymentScenario,
    });
  return { payments, handlers, orderCreated };
}

describe('payment handlers', () => {
  it('approves the payment and announces it', async () => {
    const { payments, handlers, orderCreated } = setup();
    await handlers['order.created']?.(orderCreated('approve'));

    expect(payments.payments.get(ORDER_ID)).toMatchObject({ status: 'approved', amountCents: 20000 });
    expect(payments.published).toMatchObject([{ type: 'payment.succeeded', payload: { orderId: ORDER_ID } }]);
  });

  it('declines the payment and announces it', async () => {
    const { payments, handlers, orderCreated } = setup();
    await handlers['order.created']?.(orderCreated('decline'));

    expect(payments.payments.get(ORDER_ID)?.status).toBe('declined');
    expect(payments.published).toMatchObject([{ type: 'payment.failed', payload: { orderId: ORDER_ID } }]);
  });

  it('charges only once when the event is delivered twice', async () => {
    const { payments, handlers, orderCreated } = setup();
    const event = orderCreated('approve');
    await handlers['order.created']?.(event);
    await handlers['order.created']?.(event);

    expect(payments.payments.size).toBe(1);
    expect(payments.published).toHaveLength(1);
  });

  it('refunds an approved payment when the order is cancelled', async () => {
    const { payments, handlers, orderCreated } = setup();
    await handlers['order.created']?.(orderCreated('approve'));
    await handlers['order.cancelled']?.(createEvent('order.cancelled', { orderId: ORDER_ID, reason: 'seat_conflict' }));

    expect(payments.payments.get(ORDER_ID)?.status).toBe('refunded');
  });

  it('has nothing to refund when the payment was declined', async () => {
    const { payments, handlers, orderCreated } = setup();
    await handlers['order.created']?.(orderCreated('decline'));
    await handlers['order.cancelled']?.(
      createEvent('order.cancelled', { orderId: ORDER_ID, reason: 'payment_declined' }),
    );

    expect(payments.payments.get(ORDER_ID)?.status).toBe('declined');
  });
});
