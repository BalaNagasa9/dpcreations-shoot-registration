import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createRegistrationPdf } from "./registration-pdf";

const DRIVE_GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const REGISTRATIONS_FOLDER_ID = "18iLnhlQ0lm3Z3pCobOfvpyX92umwHfIW";

type DriveFile = { id: string; name: string; webViewLink?: string };

async function driveFetch(path: string, init?: RequestInit): Promise<Response> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !connectionKey) throw new Error("Google Drive is not connected.");

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${lovableKey}`);
  headers.set("X-Connection-Api-Key", connectionKey);

  const response = await fetch(`${DRIVE_GATEWAY}${path}`, {
    ...init,
    headers,
    redirect: "manual",
  });
  if (!response.ok) {
    const body = await response.text();
    console.error(`Google Drive request failed [${response.status}]: ${body}`);
    throw new Error(`Google Drive could not save the PDF (status ${response.status}).`);
  }
  return response;
}

function safeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "Registration";
}

export async function saveRegistrationPdfToDrive(registrationId: string) {
  // Repeating the request returns the original PDF instead of creating duplicates.
  const { data: registration, error: registrationError } = await supabaseAdmin
    .from("photoshoot_registrations")
    .select("*")
    .eq("id", registrationId)
    .single();

  if (registrationError || !registration) {
    console.error("Could not read registration for Drive PDF:", registrationError);
    throw new Error("Registration not found.");
  }

  const fileName = `DP-Creations-${safeName(registration.name)}-${registration.id}.pdf`;
  const search = new URLSearchParams({
    q: `name = '${fileName}' and '${REGISTRATIONS_FOLDER_ID}' in parents and trashed = false`,
    fields: "files(id,name,webViewLink)",
    pageSize: "1",
  });
  const existingResponse = await driveFetch(`/drive/v3/files?${search.toString()}`);
  const existing = (await existingResponse.json()) as { files?: DriveFile[] };
  const existingFile = existing.files?.[0];
  if (existingFile) {
    return {
      fileId: existingFile.id,
      fileName: existingFile.name,
      fileUrl: existingFile.webViewLink ?? `https://drive.google.com/file/d/${existingFile.id}/view`,
    };
  }

  const { data: receipt, error: receiptError } = await supabaseAdmin.storage
    .from("payment-receipts")
    .download(registration.receipt_path);
  if (receiptError || !receipt) {
    console.error("Could not read payment screenshot for Drive PDF:", receiptError);
    throw new Error("Payment screenshot not found.");
  }

  const pdfBytes = await createRegistrationPdf(registration, new Uint8Array(await receipt.arrayBuffer()));
  const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(pdfBytes);
  const form = new FormData();
  form.append(
    "metadata",
    new Blob(
      [JSON.stringify({ name: fileName, parents: [REGISTRATIONS_FOLDER_ID], mimeType: "application/pdf" })],
      { type: "application/json" },
    ),
  );
  form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), fileName);

  const uploadResponse = await driveFetch(
    "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    { method: "POST", body: form },
  );
  const uploaded = (await uploadResponse.json()) as DriveFile;
  if (!uploaded.id) throw new Error("Google Drive did not return the saved PDF.");

  return {
    fileId: uploaded.id,
    fileName: uploaded.name,
    fileUrl: uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view`,
  };
}
