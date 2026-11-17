import { registerTranslations } from '@plateia/web-kit';

export const NAMESPACE = 'catalog';

const pt = {
  list: {
    eyebrow: 'Em cartaz',
    title: 'Ao vivo é outra história.',
    subtitle: 'Escolha o evento, veja o mapa da casa e garanta o seu lugar em tempo real.',
    filterLabel: 'Filtrar por categoria',
    all: 'Todos',
    empty: 'Nenhum evento nesta categoria por enquanto.',
    count_one: '{{count}} evento',
    count_other: '{{count}} eventos',
  },
  category: { music: 'Música', theater: 'Teatro', comedy: 'Comédia', festival: 'Festival' },
  card: { from: 'a partir de' },
  detail: {
    back: 'Todos os eventos',
    about: 'Sobre o evento',
    when: 'Quando',
    where: 'Onde',
    sections: 'Setores e preços',
    sectionColumn: 'Setor',
    seatsColumn: 'Lugares',
    priceColumn: 'Preço',
    chooseSeats: 'Escolher assentos',
    from: 'Ingressos a partir de',
    notFoundTitle: 'Evento não encontrado',
    notFoundBody: 'Ele pode ter saído de cartaz.',
  },
  error: { title: 'Não foi possível carregar os eventos', retry: 'Tentar novamente' },
  loading: 'Carregando eventos…',
};

const en: typeof pt = {
  list: {
    eyebrow: 'Now showing',
    title: 'Live is a different story.',
    subtitle: 'Pick an event, see the venue map and secure your seat in real time.',
    filterLabel: 'Filter by category',
    all: 'All',
    empty: 'No events in this category yet.',
    count_one: '{{count}} event',
    count_other: '{{count}} events',
  },
  category: { music: 'Music', theater: 'Theater', comedy: 'Comedy', festival: 'Festival' },
  card: { from: 'from' },
  detail: {
    back: 'All events',
    about: 'About the event',
    when: 'When',
    where: 'Where',
    sections: 'Sections and prices',
    sectionColumn: 'Section',
    seatsColumn: 'Seats',
    priceColumn: 'Price',
    chooseSeats: 'Choose seats',
    from: 'Tickets from',
    notFoundTitle: 'Event not found',
    notFoundBody: 'It may no longer be listed.',
  },
  error: { title: 'Could not load the events', retry: 'Try again' },
  loading: 'Loading events…',
};

registerTranslations(NAMESPACE, { pt, en });
