import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createRegistrationPdf, type PhotoshootRegistration } from "@/lib/registration-pdf";

const onePixelPng = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

const registration: PhotoshootRegistration = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  name: "Test Applicant",
  mobile: "9876543210",
  alt_mobile: null,
  age: 24,
  gender: "Female",
  email: "applicant@example.com",
  receipt_path: "3fa85f64-5717-4562-b3fc-2c963f66afa6.jpg",
  agreed_terms: true,
  created_at: "2026-11-25T02:15:00.000Z",
};

describe("registration PDF", () => {
  it("creates one PDF with a details page and a payment screenshot page", async () => {
    const bytes = await createRegistrationPdf(registration, onePixelPng);
    const pdf = await PDFDocument.load(bytes);

    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getTitle()).toBe("Photo Shoot Registration - Test Applicant");
  });
});
