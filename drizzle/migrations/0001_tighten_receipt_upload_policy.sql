DROP POLICY IF EXISTS "Anyone can upload receipts" ON storage.objects;
CREATE POLICY "Anyone can upload one new receipt image" ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'payment-receipts'
  AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|heic)$'
);