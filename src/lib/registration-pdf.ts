import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Tables } from "@/integrations/supabase/types";

export type PhotoshootRegistration = Tables<"photoshoot_registrations">;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const ink = rgb(0.12, 0.11, 0.1);
const muted = rgb(0.42, 0.39, 0.35);
const gold = rgb(0.55, 0.39, 0.13);

// Standard PDF fonts keep the file small. Accented characters are transliterated;
// the original, unmodified registration remains in the database.
function printable(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";

  for (const word of printable(text).split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";

    let chunk = "";
    for (const character of word) {
      const next = chunk + character;
      if (chunk && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk = next;
      }
    }
    line = chunk;
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawWrapped(
  page: PDFPage,
  text: string,
  options: { x: number; y: number; maxWidth: number; font: PDFFont; size: number; lineHeight?: number },
): number {
  const lineHeight = options.lineHeight ?? options.size * 1.35;
  let y = options.y;
  for (const line of wrapLines(text, options.font, options.size, options.maxWidth)) {
    page.drawText(line, {
      x: options.x,
      y,
      size: options.size,
      font: options.font,
      color: ink,
    });
    y -= lineHeight;
  }
  return y;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function createRegistrationPdf(
  registration: PhotoshootRegistration,
  receiptBytes: Uint8Array,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Photo Shoot Registration - ${registration.name}`);
  pdf.setAuthor("DP Creations x SP Casting");
  pdf.setSubject("Photo shoot registration and payment screenshot");
  pdf.setCreator("DP Creations Registration");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  page.drawText("DP CREATIONS x SP CASTING", { x: MARGIN, y: 786, size: 20, font: bold, color: gold });
  page.drawText("PHOTO SHOOT REGISTRATION", { x: MARGIN, y: 760, size: 11, font: regular, color: muted });
  page.drawLine({
    start: { x: MARGIN, y: 740 },
    end: { x: PAGE_WIDTH - MARGIN, y: 740 },
    thickness: 1,
    color: rgb(0.82, 0.77, 0.66),
  });

  const registeredAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(registration.created_at));

  const fields = [
    ["NAME", registration.name],
    ["MOBILE NUMBER", registration.mobile],
    ["ALTERNATIVE NUMBER", registration.alt_mobile || "Not provided"],
    ["AGE", String(registration.age)],
    ["GENDER", registration.gender],
    ["MAIL ID", registration.email],
    ["REGISTERED AT (IST)", registeredAt],
    ["TERMS & CONDITIONS", "Accepted"],
  ] as const;

  let y = 710;
  for (const [label, value] of fields) {
    page.drawText(label, { x: MARGIN, y, size: 8, font: bold, color: muted });
    y = drawWrapped(page, value, {
      x: MARGIN,
      y: y - 19,
      maxWidth: PAGE_WIDTH - MARGIN * 2,
      font: regular,
      size: 12,
      lineHeight: 16,
    });
    y -= 22;
  }

  page.drawLine({
    start: { x: MARGIN, y: 245 },
    end: { x: PAGE_WIDTH - MARGIN, y: 245 },
    thickness: 1,
    color: rgb(0.82, 0.77, 0.66),
  });
  page.drawText("REGISTRATION ID", { x: MARGIN, y: 222, size: 8, font: bold, color: muted });
  page.drawText(registration.id, { x: MARGIN, y: 204, size: 9, font: regular, color: ink });
  page.drawText("Payment screenshot attached on page 2.", {
    x: MARGIN,
    y: 92,
    size: 10,
    font: regular,
    color: muted,
  });
  page.drawText("DP Creations x SP Casting", {
    x: MARGIN,
    y: 54,
    size: 9,
    font: bold,
    color: gold,
  });

  const receiptPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  receiptPage.drawText("PAYMENT SCREENSHOT", { x: MARGIN, y: 786, size: 18, font: bold, color: gold });
  receiptPage.drawText(printable(registration.name), { x: MARGIN, y: 760, size: 11, font: regular, color: muted });
  receiptPage.drawLine({
    start: { x: MARGIN, y: 740 },
    end: { x: PAGE_WIDTH - MARGIN, y: 740 },
    thickness: 1,
    color: rgb(0.82, 0.77, 0.66),
  });

  const image = isPng(receiptBytes)
    ? await pdf.embedPng(receiptBytes)
    : isJpeg(receiptBytes)
      ? await pdf.embedJpg(receiptBytes)
      : null;

  if (!image) throw new Error("The payment screenshot must be a JPG or PNG image.");

  const availableWidth = PAGE_WIDTH - MARGIN * 2;
  const availableHeight = 650;
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  receiptPage.drawImage(image, {
    x: (PAGE_WIDTH - width) / 2,
    y: 70 + (availableHeight - height) / 2,
    width,
    height,
  });

  return pdf.save();
}
