-- ВРЕМЕННЫЙ СИД для проверки связки база -> API -> страница.
-- Удалить перед реальным импортом данных (не часть цепочки миграций).

INSERT INTO periods (period_start) VALUES ('2026-07-01'), ('2026-08-01');

INSERT INTO contracts (contract_num, client_name, legal_entity, status, manager, updated_at) VALUES
  ('TEST-001', 'ООО Ромашка (тест)', 'ООО Ромашка', 'Активен', 'Александр Солодин', '2026-08-17T00:00:00Z'),
  ('TEST-002', 'ИП Иванов (тест)', 'ИП Иванов И.И.', 'Активен', 'Алексей Жаворонков', '2026-08-17T00:00:00Z'),
  ('TEST-003', 'ООО Вектор (тест)', 'ООО Вектор', 'Блок', 'Сергей Золкин', '2026-08-17T00:00:00Z');

INSERT INTO invoices (contract_id, period_id, invoice_amount, invoice_number, paid_status, updated_at) VALUES
  ((SELECT id FROM contracts WHERE contract_num = 'TEST-001'), (SELECT id FROM periods WHERE period_start = '2026-07-01'), 15000.0, 'INV-1001', 'Да', '2026-08-17T00:00:00Z'),
  ((SELECT id FROM contracts WHERE contract_num = 'TEST-001'), (SELECT id FROM periods WHERE period_start = '2026-08-01'), 15000.0, 'INV-1002', 'Нет', '2026-08-17T00:00:00Z'),
  ((SELECT id FROM contracts WHERE contract_num = 'TEST-002'), (SELECT id FROM periods WHERE period_start = '2026-08-01'), 8000.0, 'INV-1003', 'Да', '2026-08-17T00:00:00Z'),
  ((SELECT id FROM contracts WHERE contract_num = 'TEST-003'), (SELECT id FROM periods WHERE period_start = '2026-07-01'), 22000.0, 'INV-1004', '', '2026-08-17T00:00:00Z');
