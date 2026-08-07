import QRCode from 'qrcode';

// Every document's QR points at the public verification page. Scanning it
// (or visiting the link, or typing the code in manually) shows
// "Verified Jedida Transaction" — see documentsController.verifyDocument.
export function verificationUrl(verificationCode) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${frontendUrl.split(',')[0].trim()}/verify/${verificationCode}`;
}

// Returns a data: URL (PNG, base64) so it can be embedded directly in the
// JSON response and in the generated PDF without a separate file upload.
export async function generateQrDataUrl(verificationCode) {
  try {
    return await QRCode.toDataURL(verificationUrl(verificationCode), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 260
    });
  } catch (err) {
    console.error('QR generation failed:', err);
    return null;
  }
}
