import { registerTranslations } from '@plateia/web-kit';

const pt = {
  skipToContent: 'Pular para o conteúdo',
  home: 'Plateia, página inicial',
  language: 'Idioma',
  languageNames: { pt: 'Português', en: 'Inglês' },
  theme: { toDark: 'Usar tema escuro', toLight: 'Usar tema claro' },
  footer: 'Projeto de portfólio. Eventos fictícios e pagamentos simulados: nenhuma cobrança é feita.',
  remote: {
    loading: 'Carregando…',
    unavailableTitle: 'Esta parte do site está indisponível',
    unavailableBody: 'O restante continua funcionando. Tente novamente em instantes.',
    retry: 'Tentar novamente',
  },
  notFound: {
    title: 'Página não encontrada',
    body: 'O endereço pode ter mudado ou o evento saiu de cartaz.',
    back: 'Ver eventos',
  },
};

const en: typeof pt = {
  skipToContent: 'Skip to content',
  home: 'Plateia, home page',
  language: 'Language',
  languageNames: { pt: 'Portuguese', en: 'English' },
  theme: { toDark: 'Use dark theme', toLight: 'Use light theme' },
  footer: 'Portfolio project. Fictional events and simulated payments: nothing is ever charged.',
  remote: {
    loading: 'Loading…',
    unavailableTitle: 'This part of the site is unavailable',
    unavailableBody: 'Everything else keeps working. Please try again in a moment.',
    retry: 'Try again',
  },
  notFound: {
    title: 'Page not found',
    body: 'The address may have changed or the event is no longer listed.',
    back: 'Browse events',
  },
};

registerTranslations('shell', { pt, en });
