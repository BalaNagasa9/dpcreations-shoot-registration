CREATE TABLE public.photoshoot_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  mobile text NOT NULL CHECK (mobile ~ '^[0-9+ ]{10,15}$'),
  alt_mobile text CHECK (alt_mobile IS NULL OR alt_mobile ~ '^[0-9+ ]{10,15}$'),
  age int NOT NULL CHECK (age BETWEEN 1 AND 100),
  gender text NOT NULL CHECK (gender IN ('Male','Female','Other')),
  email text NOT NULL CHECK (char_length(email) <= 255),
  receipt_path text NOT NULL,
  agreed_terms boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.photoshoot_registrations TO anon, authenticated;
GRANT ALL ON public.photoshoot_registrations TO service_role;
ALTER TABLE public.photoshoot_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can register" ON public.photoshoot_registrations FOR INSERT TO anon, authenticated WITH CHECK (agreed_terms = true);
CREATE POLICY "Anyone can upload receipts" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'payment-receipts');