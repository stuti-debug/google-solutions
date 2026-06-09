import html2pdf from 'html2pdf.js';

/**
 * Export a DOM element to a branded CrisisGrid PDF.
 * @param {string} elementId - The ID of the DOM element to export.
 * @param {string} filename - The PDF filename (without .pdf extension).
 */
export const exportToPdf = (elementId, filename = 'CrisisGrid-Report') => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element #${elementId} not found`);
    return Promise.reject(new Error('Element not found'));
  }

  // Create a wrapper with branding
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding: 20px; font-family: "Inter", "Segoe UI", sans-serif;';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #0A6C74;';
  header.innerHTML = `
    <div>
      <div style="font-size: 22px; font-weight: 800; color: #0A6C74; letter-spacing: -0.02em;">CRISISGRID</div>
      <div style="font-size: 11px; color: #888; margin-top: 2px;">Where every crisis meets clarity</div>
    </div>
    <div style="text-align: right; font-size: 11px; color: #888;">
      <div>Generated: ${new Date().toLocaleString()}</div>
      <div>crisisgrid.app</div>
    </div>
  `;

  // Clone the content
  const content = element.cloneNode(true);
  // Remove action buttons from the clone
  content.querySelectorAll('.sitrep-actions, .btn').forEach(el => el.remove());
  // Ensure text is dark for PDF
  content.style.color = '#1a1a1a';

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 10px; color: #999;';
  footer.innerHTML = `
    <span>CRISISGRID — WHERE EVERY CRISIS MEETS CLARITY</span>
    <span>Confidential — For authorized personnel only</span>
  `;

  wrapper.appendChild(header);
  wrapper.appendChild(content);
  wrapper.appendChild(footer);

  const opt = {
    margin: [10, 12, 10, 12],
    filename: `${filename}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
    },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  };

  return html2pdf().set(opt).from(wrapper).save();
};
