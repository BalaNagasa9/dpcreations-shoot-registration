import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const saveRegistrationPdf = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ registrationId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { saveRegistrationPdfToDrive } = await import("./registration-pdf.server");
    return saveRegistrationPdfToDrive(data.registrationId);
  });
