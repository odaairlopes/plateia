-- Demo data. Every event, artist and venue below is fictional.
INSERT INTO catalog.events (id, title, category, venue, city, starts_at, description, cover_hue) VALUES
  ('noite-de-vidro', 'Noite de Vidro — Turnê Reflexos', 'music', 'Teatro Aurora', 'São Paulo, SP', '2027-03-13T21:00:00-03:00',
   '{"pt": "O quarteto Noite de Vidro apresenta o álbum Reflexos na íntegra, com projeções ao vivo e participação de um naipe de cordas.", "en": "The quartet Noite de Vidro performs the album Reflexos in full, with live projections and a guest string section."}', 262),
  ('festival-maresia', 'Festival Maresia', 'festival', 'Arena do Cais', 'Recife, PE', '2027-04-24T16:00:00-03:00',
   '{"pt": "Doze horas de música à beira-mar: três palcos, vinte atrações e gastronomia regional.", "en": "Twelve hours of music by the sea: three stages, twenty acts and regional food."}', 188),
  ('o-ultimo-farol', 'O Último Farol', 'theater', 'Teatro das Marés', 'Rio de Janeiro, RJ', '2027-02-20T20:00:00-03:00',
   '{"pt": "Um faroleiro e sua filha aguardam um navio que nunca chega. Drama em dois atos, com trilha executada ao vivo.", "en": "A lighthouse keeper and his daughter wait for a ship that never arrives. A two-act drama with a live score."}', 22),
  ('riso-solto', 'Riso Solto — Stand-up Coletivo', 'comedy', 'Casa do Riso', 'Belo Horizonte, MG', '2027-01-30T20:30:00-03:00',
   '{"pt": "Cinco comediantes, um microfone e nenhum roteiro combinado. Classificação indicativa: 16 anos.", "en": "Five comedians, one microphone and no agreed script. Age rating: 16+."}', 42),
  ('orquestra-do-vale', 'Orquestra do Vale — Trilhas de Cinema', 'music', 'Sala Jatobá', 'Curitiba, PR', '2027-05-08T19:00:00-03:00',
   '{"pt": "Um passeio por temas clássicos do cinema, regidos por maestrina convidada, com coro de sessenta vozes.", "en": "A journey through classic film themes, led by a guest conductor, with a sixty-voice choir."}', 338),
  ('circuito-baixo-centro', 'Circuito Baixo Centro', 'festival', 'Galpão 9', 'Porto Alegre, RS', '2027-06-19T18:00:00-03:00',
   '{"pt": "Festival de música independente com dez bandas da cena local, feira de discos e arte urbana.", "en": "An independent music festival with ten bands from the local scene, a record fair and street art."}', 140);

INSERT INTO catalog.sections (event_id, id, position, name, price_cents, rows, seats_per_row) VALUES
  ('noite-de-vidro', 'plateia', 1, '{"pt": "Plateia", "en": "Stalls"}', 18000, 8, 14),
  ('noite-de-vidro', 'balcao', 2, '{"pt": "Balcão", "en": "Balcony"}', 12000, 5, 16),
  ('noite-de-vidro', 'camarote', 3, '{"pt": "Camarote", "en": "Box"}', 32000, 2, 8),

  ('festival-maresia', 'frontstage', 1, '{"pt": "Front Stage", "en": "Front Stage"}', 42000, 6, 16),
  ('festival-maresia', 'arquibancada', 2, '{"pt": "Arquibancada", "en": "Grandstand"}', 19000, 10, 18),

  ('o-ultimo-farol', 'plateia', 1, '{"pt": "Plateia", "en": "Stalls"}', 9000, 9, 12),
  ('o-ultimo-farol', 'balcao', 2, '{"pt": "Balcão", "en": "Balcony"}', 6000, 4, 14),

  ('riso-solto', 'mesas', 1, '{"pt": "Mesas", "en": "Tables"}', 7000, 5, 8),
  ('riso-solto', 'plateia', 2, '{"pt": "Plateia", "en": "Stalls"}', 5000, 6, 12),

  ('orquestra-do-vale', 'plateia', 1, '{"pt": "Plateia", "en": "Stalls"}', 15000, 10, 16),
  ('orquestra-do-vale', 'mezanino', 2, '{"pt": "Mezanino", "en": "Mezzanine"}', 11000, 4, 18),
  ('orquestra-do-vale', 'camarote', 3, '{"pt": "Camarote", "en": "Box"}', 26000, 2, 6),

  ('circuito-baixo-centro', 'pista', 1, '{"pt": "Pista", "en": "Floor"}', 8000, 8, 15),
  ('circuito-baixo-centro', 'mezanino', 2, '{"pt": "Mezanino", "en": "Mezzanine"}', 13000, 3, 12);
