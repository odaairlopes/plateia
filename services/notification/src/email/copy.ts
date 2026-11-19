import type { EventCategory, Locale } from '@plateia/contracts';

/** All wording of the confirmation email, per language. */
export interface ConfirmationCopy {
  subject: (eventTitle: string) => string;
  preview: (orderCode: string, date: string) => string;
  eyebrow: string;
  greeting: (firstName: string) => string;
  intro: string;
  when: string;
  where: string;
  doors: string;
  seats: string;
  total: string;
  orderCode: string;
  qrHint: string;
  addToCalendar: string;
  viewEvent: string;
  beforeTheShow: string;
  tips: (doorsTime: string, holderName: string) => string[];
  calendarDetails: (seats: string, orderCode: string) => string;
  footerReason: string;
  footerDemo: string;
  categories: Record<EventCategory, string>;
}

export const copy: Record<Locale, ConfirmationCopy> = {
  pt: {
    subject: (title) => `Seus ingressos para ${title}`,
    preview: (code, date) => `Pedido ${code} confirmado · ${date}`,
    eyebrow: 'Ingresso confirmado',
    greeting: (name) => `Tudo certo, ${name}!`,
    intro: 'Seu pagamento foi aprovado e seus lugares estão garantidos. Guarde este e-mail: ele é o seu ingresso.',
    when: 'Quando',
    where: 'Onde',
    doors: 'Abertura dos portões',
    seats: 'Assentos',
    total: 'Total pago',
    orderCode: 'Código do pedido',
    qrHint: 'Apresente este QR code na entrada',
    addToCalendar: 'Adicionar à agenda',
    viewEvent: 'Ver o evento',
    beforeTheShow: 'Antes do show',
    tips: (doors, holder) => [
      `Os portões abrem às ${doors}. Chegue com antecedência para evitar filas.`,
      `Leve um documento oficial com foto: os ingressos estão em nome de ${holder}.`,
      'O QR code vale uma entrada por assento. Não compartilhe este e-mail.',
    ],
    calendarDetails: (seats, code) => `Assentos: ${seats}\nPedido: ${code}`,
    footerReason: 'Você recebeu este e-mail porque comprou ingressos na Plateia.',
    footerDemo: 'Projeto de portfólio: evento fictício e pagamento simulado. Nenhum valor foi cobrado.',
    categories: { music: 'Música', theater: 'Teatro', comedy: 'Comédia', festival: 'Festival' },
  },
  en: {
    subject: (title) => `Your tickets for ${title}`,
    preview: (code, date) => `Order ${code} confirmed · ${date}`,
    eyebrow: 'Ticket confirmed',
    greeting: (name) => `You're all set, ${name}!`,
    intro: 'Your payment was approved and your seats are secured. Keep this email: it is your ticket.',
    when: 'When',
    where: 'Where',
    doors: 'Doors open',
    seats: 'Seats',
    total: 'Total paid',
    orderCode: 'Order code',
    qrHint: 'Show this QR code at the entrance',
    addToCalendar: 'Add to calendar',
    viewEvent: 'View the event',
    beforeTheShow: 'Before the show',
    tips: (doors, holder) => [
      `Doors open at ${doors}. Arrive early to avoid queues.`,
      `Bring an official photo ID: the tickets are in ${holder}'s name.`,
      'The QR code is valid for one entry per seat. Do not share this email.',
    ],
    calendarDetails: (seats, code) => `Seats: ${seats}\nOrder: ${code}`,
    footerReason: 'You received this email because you bought tickets on Plateia.',
    footerDemo: 'Portfolio project: fictional event and simulated payment. Nothing was charged.',
    categories: { music: 'Music', theater: 'Theater', comedy: 'Comedy', festival: 'Festival' },
  },
};
