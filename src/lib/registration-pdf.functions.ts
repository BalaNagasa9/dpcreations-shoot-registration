import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const saveRegistrationPdf = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ registrationId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { saveRegistrationPdfToDrive } = await import("./registration-pdf.server");
    return saveRegistrationPdfToDrive(data.registrationId);
  });

export const uploadReceipt = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ image: z.string().min(100).max(14_000_000) }).parse(data))
  .handler(async ({ data }) => {
    const bytes = Uint8Array.from(atob(data.image), (c) => c.charCodeAt(0));
    if (bytes.length > 10 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      throw new Error("Please upload a JPG, PNG or WEBP payment screenshot.");
    }
    const id = crypto.randomUUID();
    const path = `${id}.jpg`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("payment-receipts")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (error) {
      console.error("Receipt upload failed:", error);
      throw new Error("Upload failed");
    }
    return { id, path };
  });
