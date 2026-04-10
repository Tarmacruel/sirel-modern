import {
  buildDfdHtml,
  buildMapaComparativoHtml,
  buildPrintableShell,
  buildTrHtml,
} from "@sirel/shared/document-templates/planejamento";
import {
  buildDossieFornecedorHtml,
  buildDossieHtml,
  buildDossieItemHtml,
} from "@sirel/shared/document-templates/dossie";
import { getRuntimeBrandingSnapshot, systemName } from "@/lib/branding";
import { resolveServerAssetUrl } from "@/lib/document-upload";

export {
  buildDossieFornecedorHtml,
  buildDossieHtml,
  buildDossieItemHtml,
  buildDfdHtml,
  buildMapaComparativoHtml,
  buildPrintableShell,
  buildTrHtml,
};

function buildPreviewStatusHtml(title: string, message: string) {
  const branding = getRuntimeBrandingSnapshot();
  return buildPrintableShell(
    title,
    `
      <section style="display:flex;min-height:60vh;align-items:center;justify-content:center;">
        <article style="max-width:32rem;border:1px solid #cbd5e1;border-radius:24px;padding:2rem;background:#fff;box-shadow:0 20px 40px rgba(15,23,42,.08);">
          <p style="margin:0 0 .75rem;font-size:.75rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#0f766e;">${systemName}</p>
          <h1 style="margin:0 0 .75rem;font-size:1.75rem;font-weight:900;color:#0f172a;">${title}</h1>
          <p style="margin:0;font-size:1rem;line-height:1.7;color:#475569;">${message}</p>
        </article>
      </section>
    `,
    {
      logoUrl:
        resolveServerAssetUrl(branding.prefeituraLogoUrl) ??
        branding.prefeituraLogoUrl,
      lines: branding.prefeituraLines,
      footerText: branding.systemFooterText,
    },
  );
}

export function openPreviewWindow(title = "Pré-visualização do documento") {
  const previewWindow = window.open("", "_blank");
  if (!previewWindow) {
    throw new Error("Não foi possível abrir a janela de pré-visualização.");
  }

  previewWindow.document.open();
  previewWindow.document.write(
    buildPreviewStatusHtml(title, "Preparando a visualização do documento..."),
  );
  previewWindow.document.close();
  previewWindow.focus();

  return previewWindow;
}

export function renderPreviewWindowMessage(
  previewWindow: Window,
  title: string,
  message: string,
) {
  previewWindow.document.open();
  previewWindow.document.write(buildPreviewStatusHtml(title, message));
  previewWindow.document.close();
  previewWindow.focus();
}

export function navigatePreviewWindow(previewWindow: Window, url: string) {
  previewWindow.location.replace(resolveServerAssetUrl(url) ?? url);
  previewWindow.focus();
}

export function openPrintableHtml({
  title,
  bodyHtml,
  autoPrint = false,
}: {
  title: string;
  bodyHtml: string;
  autoPrint?: boolean;
}) {
  const printWindow = openPreviewWindow(title);
  const branding = getRuntimeBrandingSnapshot();

  printWindow.document.open();
  printWindow.document.write(
    buildPrintableShell(title, bodyHtml, {
      logoUrl:
        resolveServerAssetUrl(branding.prefeituraLogoUrl) ??
        branding.prefeituraLogoUrl,
      lines: branding.prefeituraLines,
      footerText: branding.systemFooterText,
    }),
  );
  printWindow.document.close();
  printWindow.focus();

  if (autoPrint) {
    printWindow.addEventListener("load", () => {
      printWindow.print();
    });
  }
}
