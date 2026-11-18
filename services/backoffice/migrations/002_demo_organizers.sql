-- Demo accounts (fictional companies). Password for both: see README,
-- "Painel do organizador". Hash: argon2id.
INSERT INTO backoffice.organizers (id, name, email, password_hash) VALUES
  ('a0c4e5d2-1f3b-4c8e-9a7d-2b6f8e1c3d50', 'Aurora Produções', 'ana@aurora.dev', '$argon2id$v=19$m=19456,t=2,p=1$WR4BGOqbQ4mnv9ooorQIRg$hOtNeKGn39j2Js0VlWleFQYWAgLuAV4htYttDHK4YC0'),
  ('b1d5f6e3-2a4c-4d9f-8b6e-3c7a9f2d4e61', 'Maré Alta Eventos', 'bruno@marealta.dev', '$argon2id$v=19$m=19456,t=2,p=1$WR4BGOqbQ4mnv9ooorQIRg$hOtNeKGn39j2Js0VlWleFQYWAgLuAV4htYttDHK4YC0');

INSERT INTO backoffice.organizer_events (event_id, organizer_id) VALUES
  ('noite-de-vidro', 'a0c4e5d2-1f3b-4c8e-9a7d-2b6f8e1c3d50'),
  ('orquestra-do-vale', 'a0c4e5d2-1f3b-4c8e-9a7d-2b6f8e1c3d50'),
  ('o-ultimo-farol', 'a0c4e5d2-1f3b-4c8e-9a7d-2b6f8e1c3d50'),
  ('festival-maresia', 'b1d5f6e3-2a4c-4d9f-8b6e-3c7a9f2d4e61'),
  ('circuito-baixo-centro', 'b1d5f6e3-2a4c-4d9f-8b6e-3c7a9f2d4e61'),
  ('riso-solto', 'b1d5f6e3-2a4c-4d9f-8b6e-3c7a9f2d4e61');
