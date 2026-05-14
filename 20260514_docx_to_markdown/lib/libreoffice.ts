import { $ } from "bun";
import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, extname, join } from "node:path";

// Convert an office file to PDF using LibreOffice headless. Returns the PDF
// bytes plus a cleanup callback that removes the tmp directory. Throws an
// informative error if `soffice` isn't on PATH.
export async function officeToPdf(
  inputPath: string,
): Promise<{ pdfBuffer: Buffer; cleanup: () => Promise<void> }> {
  await ensureSofficeAvailable();
  const tmpDir = join(
    "fixtures",
    ".tmp",
    `pdf-${basename(inputPath, extname(inputPath))}-${Date.now()}`,
  );
  await mkdir(tmpDir, { recursive: true });
  // `--convert-to pdf` writes `<stem>.pdf` into --outdir.
  try {
    await $`soffice --headless --norestore --nologo --convert-to pdf --outdir ${tmpDir} ${inputPath}`.quiet();
  } catch (err: any) {
    await rm(tmpDir, { recursive: true, force: true });
    throw new Error(
      `soffice failed to convert ${inputPath} to PDF: ${err?.message ?? err}`,
    );
  }
  const stem = basename(inputPath, extname(inputPath));
  const pdfPath = join(tmpDir, `${stem}.pdf`);
  const pdfBuffer = await readFile(pdfPath);
  return {
    pdfBuffer,
    cleanup: () => rm(tmpDir, { recursive: true, force: true }),
  };
}

let sofficeCheck: Promise<void> | null = null;
function ensureSofficeAvailable(): Promise<void> {
  if (sofficeCheck) return sofficeCheck;
  sofficeCheck = (async () => {
    try {
      await $`soffice --version`.quiet();
    } catch {
      throw new Error(
        "soffice (LibreOffice) not found on PATH. The gemini-pdf backend " +
          "needs LibreOffice headless to render docx/xlsx/pptx to PDF. In " +
          "Docker, install with: apt-get install -y libreoffice (Debian/Ubuntu) " +
          "or alpine: apk add libreoffice.",
      );
    }
  })();
  return sofficeCheck;
}
