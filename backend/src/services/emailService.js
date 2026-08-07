import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return transporter;
}

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendPasswordResetEmail(toEmail, resetLink) {
  const transport = getTransporter();

  if (!transport) {
    console.log(`[JEDIDA][SANDBOX EMAIL] Password reset link for ${toEmail}: ${resetLink}`);
    return { sent: true, sandbox: true };
  }

  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM || 'no-reply@jedidamarketplace.com',
      to: toEmail,
      subject: 'Reset your JEDIDA Marketplace password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #0B3D24;">Reset your password</h2>
          <p>We received a request to reset your JEDIDA Marketplace password. This link expires in 15 minutes.</p>
          <p style="margin: 24px 0;">
            <a href="${resetLink}" style="background: #0B3D24; color: #F6FBF7; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              Reset Password
            </a>
          </p>
          <p style="color: #5B6760; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
      text: `Reset your JEDIDA Marketplace password: ${resetLink} (expires in 15 minutes)`
    });
    return { sent: true, sandbox: false };
  } catch (err) {
    console.error('Email send error:', err.message);
    return { sent: false, sandbox: false };
  }
}

export async function sendPartnerApplicationReceivedEmail(toEmail, { companyName, referenceCode }) {
  const transport = getTransporter();
  const subject = `We received your JEDIDA partner application (${referenceCode})`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #0B3D24;">Application received</h2>
      <p>Thanks for applying to partner with JEDIDA Marketplace, ${companyName}.</p>
      <p>Your reference number is <strong>${referenceCode}</strong>. Our partnerships team will review your application and get back to you by email.</p>
      <p style="color: #5B6760; font-size: 13px;">Keep this reference number for any follow-up.</p>
    </div>
  `;
  if (!transport) {
    console.log(`[JEDIDA][SANDBOX EMAIL] Partner application received for ${toEmail} (${referenceCode})`);
    return { sent: true, sandbox: true };
  }
  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM || 'no-reply@jedidamarketplace.com',
      to: toEmail,
      subject,
      html,
      text: `Thanks for applying to partner with JEDIDA Marketplace, ${companyName}. Your reference number is ${referenceCode}.`
    });
    return { sent: true, sandbox: false };
  } catch (err) {
    console.error('Email send error:', err.message);
    return { sent: false, sandbox: false };
  }
}

const PARTNER_STATUS_COPY = {
  approved: {
    subject: (ref) => `Your JEDIDA partner application was approved (${ref})`,
    heading: 'Application approved',
    body: () => 'Congratulations — your application to partner with JEDIDA Marketplace has been approved. Our team will follow up with onboarding details.'
  },
  rejected: {
    subject: (ref) => `Update on your JEDIDA partner application (${ref})`,
    heading: 'Application update',
    body: (ref) => `Your application to partner with JEDIDA Marketplace (${ref}) was not approved at this time.`
  },
  under_review: {
    subject: (ref) => `Your JEDIDA partner application is under review (${ref})`,
    heading: 'Application under review',
    body: () => 'Your application is now being reviewed by our partnerships team. We\'ll be in touch as soon as there\'s an update.'
  },
  technical_review: {
    subject: (ref) => `Your JEDIDA partner application: technical review (${ref})`,
    heading: 'Technical review in progress',
    body: () => 'Your application has moved to technical review. Our team is evaluating the integration and technical fit.'
  },
  business_review: {
    subject: (ref) => `Your JEDIDA partner application: business review (${ref})`,
    heading: 'Business review in progress',
    body: () => 'Your application has moved to business review, the final stage before a decision.'
  },
  more_info_requested: {
    subject: (ref) => `Action needed on your JEDIDA partner application (${ref})`,
    heading: 'More information needed',
    body: () => 'Our team needs some additional information to continue reviewing your application. Please see the note below and reply to this email or contact partnerships@jedidamarketplace.com.'
  },
  on_hold: {
    subject: (ref) => `Your JEDIDA partner application is on hold (${ref})`,
    heading: 'Application on hold',
    body: () => 'Your application has been placed on hold. We\'ll reach out once it\'s ready to continue.'
  },
  suspended: {
    subject: (ref) => `Your JEDIDA partnership has been suspended (${ref})`,
    heading: 'Partnership suspended',
    body: () => 'Your active partnership with JEDIDA Marketplace has been suspended. Please contact partnerships@jedidamarketplace.com for details.'
  }
};

export async function sendPartnerApplicationDecisionEmail(toEmail, { companyName, referenceCode, status, notes }) {
  const transport = getTransporter();
  const copy = PARTNER_STATUS_COPY[status] || PARTNER_STATUS_COPY.under_review;
  const subject = copy.subject(referenceCode);
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #0B3D24;">${copy.heading}</h2>
      <p>Hello ${companyName},</p>
      <p>${copy.body(referenceCode)}</p>
      ${notes ? `<p style="color: #5B6760;">${notes}</p>` : ''}
    </div>
  `;
  if (!transport) {
    console.log(`[JEDIDA][SANDBOX EMAIL] Partner application ${status} for ${toEmail} (${referenceCode})`);
    return { sent: true, sandbox: true };
  }
  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM || 'no-reply@jedidamarketplace.com',
      to: toEmail,
      subject,
      html,
      text: `Your JEDIDA partner application (${referenceCode}) status: ${status}.${notes ? ` ${notes}` : ''}`
    });
    return { sent: true, sandbox: false };
  } catch (err) {
    console.error('Email send error:', err.message);
    return { sent: false, sandbox: false };
  }
}

// Sent once, at the moment an application is approved and its Partner
// Portal login is provisioned. Carries the username + a one-time
// temporary password the partner must change on first sign-in.
export async function sendPartnerAccountProvisionedEmail(toEmail, { companyName, referenceCode, username, temporaryPassword, portalUrl }) {
  const transport = getTransporter();
  const subject = `Your JEDIDA Partner Portal account is ready (${referenceCode})`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #0B3D24;">Welcome to the JEDIDA Partner Portal</h2>
      <p>Hello ${companyName},</p>
      <p>Your partnership (${referenceCode}) has been approved. You can now sign in to the Partner Portal to manage your integration, API credentials, and support requests.</p>
      <p style="background:#F4F1EA; padding:14px 18px; border-radius:8px;">
        <strong>Username:</strong> ${username}<br/>
        <strong>Temporary password:</strong> ${temporaryPassword}
      </p>
      <p style="color:#c04a2c; font-size:13px;">For security, you'll be asked to set a new password the first time you sign in.</p>
      <p style="margin: 24px 0;">
        <a href="${portalUrl}" style="background: #0B3D24; color: #F6FBF7; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Go to the Partner Portal
        </a>
      </p>
    </div>
  `;
  if (!transport) {
    console.log(`[JEDIDA][SANDBOX EMAIL] Partner Portal account for ${toEmail}: username=${username} temp_password=${temporaryPassword}`);
    return { sent: true, sandbox: true };
  }
  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM || 'no-reply@jedidamarketplace.com',
      to: toEmail,
      subject,
      html,
      text: `Your JEDIDA Partner Portal account is ready. Username: ${username} / Temporary password: ${temporaryPassword}. Sign in at ${portalUrl}`
    });
    return { sent: true, sandbox: false };
  } catch (err) {
    console.error('Email send error:', err.message);
    return { sent: false, sandbox: false };
  }
}
