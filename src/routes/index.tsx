import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import paymentQr from "@/assets/payment-qr.jpeg.asset.json";
import { saveRegistrationPdf, uploadReceipt } from "@/lib/registration-pdf.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Photo Shoot Registration | DP Creations × SP Casting" },
      { name: "description", content: "Register for the DP Creations and SP Casting collaboration photo shoot." },
      { property: "og:title", content: "Photo Shoot Registration | DP Creations × SP Casting" },
      { property: "og:description", content: "Register for the DP Creations and SP Casting collaboration photo shoot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const phone = z.string().trim().regex(/^[0-9+ ]{10,15}$/, "Enter a valid mobile number");
const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  mobile: phone,
  alt_mobile: z.union([z.literal(""), phone]),
  age: z.coerce.number().int().min(1, "Enter a valid age").max(100, "Enter a valid age"),
  gender: z.enum(["Male", "Female", "Other"], { message: "Select gender" }),
  email: z.string().trim().email("Enter a valid email").max(255),
});

const terms = [
  "Shoot date will be fixed by the management, but it will be on a Sunday only.",
  "Payment is non-refundable.",
  "Shoot management provides only makeup and hair styling. We can't provide any costume.",
  "You will receive 6 to 7 pictures, delivered within 7 days after the shoot.",
  "Please take care of your belongings at the shoot place.",
  "We can't provide any food at the location. We provide water only.",
  "You can change costumes up to 3 times.",
];

const field = "w-full rounded-md border border-input bg-background px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const label = "mb-1.5 block text-sm font-medium";

async function receiptAsJpeg(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Please upload a JPG, PNG or WEBP payment screenshot.");
  }

  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("We could not read that screenshot. Please try another image.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("We could not read that screenshot. Please try another image."))),
      "image/jpeg",
      0.92,
    );
  });
}

function Index() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [qrOk, setQrOk] = useState(true);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const savePdf = useServerFn(saveRegistrationPdf);
  const sendReceipt = useServerFn(uploadReceipt);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const r = schema.safeParse(data);
    const errs: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) errs[String(i.path[0])] ??= i.message;
    if (!file) errs["receipt"] = "Upload your payment screenshot";
    else if (file.size > 10 * 1024 * 1024) errs["receipt"] = "File must be under 10MB";
    if (!agree) errs["agree"] = "Please accept the terms and conditions";
    setErrors(errs);
    if (Object.keys(errs).length || !r.success || !file) return;
    setBusy(true);
    let savedId = registrationId;
    try {
      if (!savedId) {
        const receipt = await receiptAsJpeg(file);
        const buf = new Uint8Array(await receipt.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const { id: newId, path } = await sendReceipt({ data: { image: btoa(bin) } });
        const { alt_mobile, ...rest } = r.data;
        const ins = await supabase.from("photoshoot_registrations").insert({
          id: newId,
          ...rest,
          alt_mobile: alt_mobile || null,
          receipt_path: path,
          agreed_terms: true,
        });
        if (ins.error) throw ins.error;
        savedId = newId;
        setRegistrationId(savedId);
      }

      await savePdf({ data: { registrationId: savedId } });
      setDone(true);
    } catch (error) {
      console.error(error);
      setErrors({
        form: savedId
          ? "Your registration is saved, but the Google Drive PDF was not. Please click Retry PDF Save."
          : error instanceof Error && (error.message.startsWith("Please upload") || error.message.startsWith("We could not"))
            ? error.message
            : "Something went wrong. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  const Err = ({ k }: { k: string }) => (errors[k] ? <p className="mt-1 text-sm text-destructive">{errors[k]}</p> : null);

  return (
    <main className="min-h-screen px-4 py-12 font-sans">
      <div className="mx-auto max-w-2xl">
        <header className="mb-10 text-center">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">Photo Shoot Registration</p>
          <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
            <span className="text-gold">DP Creations</span>
            <span className="mx-3 text-muted-foreground">×</span>
            <span className="text-gold">SP Casting</span>
          </h1>
          <p className="mt-3 text-muted-foreground">Collaboration</p>
        </header>

        {done ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <h2 className="font-display text-3xl text-gold">Registration received!</h2>
            <p className="mt-3 text-muted-foreground">Thank you. We will contact you with your Sunday shoot date.</p>
            <p className="mt-2 text-sm text-muted-foreground">Your details and payment screenshot are saved together as a PDF in our Google Drive.</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-8 rounded-xl border border-border bg-card p-6 sm:p-8">
            <section className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className={label} htmlFor="name">Name *</label><input id="name" name="name" className={field} maxLength={100} /><Err k="name" /></div>
              <div><label className={label} htmlFor="mobile">Mobile Number *</label><input id="mobile" name="mobile" type="tel" className={field} maxLength={15} /><Err k="mobile" /></div>
              <div><label className={label} htmlFor="alt_mobile">Alternative Number <span className="text-muted-foreground">(optional)</span></label><input id="alt_mobile" name="alt_mobile" type="tel" className={field} maxLength={15} /><Err k="alt_mobile" /></div>
              <div><label className={label} htmlFor="age">Age *</label><input id="age" name="age" type="number" min={1} max={100} className={field} /><Err k="age" /></div>
              <div><label className={label} htmlFor="gender">Gender *</label>
                <select id="gender" name="gender" defaultValue="" className={field}>
                  <option value="" disabled>Select</option><option>Male</option><option>Female</option><option>Other</option>
                </select><Err k="gender" /></div>
              <div className="sm:col-span-2"><label className={label} htmlFor="email">Mail ID *</label><input id="email" name="email" type="email" className={field} maxLength={255} /><Err k="email" /></div>
            </section>

            <section className="rounded-lg border border-border bg-secondary p-6 text-center">
              <h2 className="font-display text-2xl">Payment</h2>
              <p className="mt-1 text-sm text-muted-foreground">Scan the QR code below to pay</p>
              <div className="mx-auto mt-4 flex aspect-square w-56 items-center justify-center overflow-hidden rounded-lg bg-white p-2">
                {qrOk ? (
                  <img src={paymentQr.url} alt="Payment QR Code" className="h-full w-full object-contain" onError={() => setQrOk(false)} />
                ) : (
                  <span className="text-sm text-background">Payment QR Code</span>
                )}
              </div>
            </section>

            <section>
              <label className={label} htmlFor="receipt">Upload Payment Screenshot *</label>
              <input id="receipt" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:font-medium file:text-primary-foreground" />
              <Err k="receipt" />
            </section>

            <section>
              <h2 className="mb-3 font-display text-2xl">Terms & Conditions</h2>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                {terms.map((t) => <li key={t}>{t}</li>)}
              </ol>
              <label className="mt-5 flex items-center gap-3 text-sm">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="h-4 w-4 accent-primary" />
                I have read and agree to the terms and conditions
              </label>
              <Err k="agree" />
            </section>

            <Err k="form" />
            <button type="submit" disabled={busy} className="w-full rounded-md bg-gold py-3 text-lg font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
              {busy ? "Saving..." : registrationId ? "Retry PDF Save" : "Send"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
