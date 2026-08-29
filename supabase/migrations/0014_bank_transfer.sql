-- ============================================================================
-- 0014 — Datos bancarios para pagos por transferencia SPEI
--
-- Stripe cubre tarjeta y OXXO; SPEI es un flujo propio con validación manual:
-- el checkout muestra estos datos y la plantilla `spei_instructions` de
-- send-email los envía por correo. El admin confirma el pago en el panel y
-- eso dispara la guía. Editables sin redesplegar.
-- ============================================================================

insert into public.settings (key, value) values ('bank_transfer', jsonb_build_object(
  'enabled', true,
  'bank', 'BBVA',
  'beneficiary', 'Christian Palomino',
  'account', '019235796',
  'clabe', '012022001923579764',
  'whatsapp', '+526461164390',
  'email', 'ventas@aminosmx.com',
  'hours_to_pay', 48
))
on conflict (key) do update set value = excluded.value;
