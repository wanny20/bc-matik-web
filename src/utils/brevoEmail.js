// src/utils/brevoEmail.js

const BREVO_API_KEY = import.meta.env.VITE_BREVO_API_KEY || '';
const SENDER_EMAIL = import.meta.env.VITE_BREVO_SENDER_EMAIL || 'michaeljohnromano.lubiano@bicol-u.edu.ph';
const SENDER_NAME = import.meta.env.VITE_BREVO_SENDER_NAME || 'Bicol College BCMatik';

/**
 * Core Brevo Transactional Email Sender
 */
export async function sendBrevoEmail({ toEmail, toName = 'BCMatik Client', subject, htmlContent }) {
  if (!toEmail || !toEmail.includes('@')) {
    return { ok: false, reason: 'Invalid recipient email' };
  }
  if (!BREVO_API_KEY || !SENDER_EMAIL) {
    console.warn('Brevo API Key or Sender Email missing in .env');
    return { ok: false, reason: 'Missing Brevo configuration in .env' };
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: toEmail.trim(), name: toName }],
        subject,
        htmlContent
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Brevo API Error:', errData);
      return { ok: false, reason: errData.message || 'Brevo API rejected request' };
    }

    return { ok: true };
  } catch (error) {
    console.error('Network error sending Brevo email:', error);
    return { ok: false, reason: error.message };
  }
}

/**
 * 1. Send 6-Digit Email Verification OTP Code
 */
export async function sendOtpVerificationEmail({ toEmail, studentId, otpCode }) {
  const subject = `BCMatik Verification Code: ${otpCode}`;
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; border: 2px solid #9E0B03; border-radius: 18px; overflow: hidden; background: #FFFFFF;">
      <div style="background: #9E0B03; color: #FFFFFF; padding: 20px 24px; text-align: center; border-bottom: 4px solid #FACC15;">
        <div style="font-size: 11px; font-weight: 800; color: #FACC15; letter-spacing: 0.12em; text-transform: uppercase;">Bicol College • Main Campus</div>
        <h2 style="margin: 6px 0 0; font-size: 22px;">BCMatik Email Verification</h2>
      </div>
      <div style="padding: 28px 24px; color: #0F172A; text-align: center;">
        <p style="font-size: 14px; color: #475569; margin-top: 0;">
          Use the 6-digit verification code below to link this email address to your BCMatik account (ID: <strong>${studentId || 'Student'}</strong>):
        </p>
        <div style="margin: 22px auto; padding: 16px 24px; background: #FCEAE9; border: 2px dashed #9E0B03; border-radius: 14px; display: inline-block;">
          <div style="font-size: 34px; font-weight: 900; letter-spacing: 0.18em; color: #9E0B03; font-family: Consolas, monospace;">
            ${otpCode}
          </div>
        </div>
        <p style="font-size: 12px; color: #64748B; margin-bottom: 0;">
          Enter this code inside the BCMatik Mobile App to enable automated queue and document release alerts.
        </p>
      </div>
    </div>
  `;
  return sendBrevoEmail({ toEmail, toName: `Student ${studentId}`, subject, htmlContent });
}

/**
 * 2. Send "Ticket Called / Now Serving" Alert Email
 */
export async function sendTicketCalledEmail({ toEmail, studentName, queueNumber, officeName, windowName, purpose }) {
  const subject = `🎉 Now Serving Ticket ${queueNumber} at ${officeName} (${windowName})`;
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; border: 2px solid #9E0B03; border-radius: 18px; overflow: hidden; background: #FFFFFF;">
      <div style="background: #9E0B03; color: #FFFFFF; padding: 20px 24px; text-align: center; border-bottom: 4px solid #FACC15;">
        <div style="font-size: 11px; font-weight: 800; color: #FACC15; letter-spacing: 0.12em; text-transform: uppercase;">Bicol College • Smart Queuing Alert</div>
        <h2 style="margin: 6px 0 0; font-size: 22px;">It's Your Turn! Proceed to Counter</h2>
      </div>
      <div style="padding: 26px 24px; color: #0F172A; text-align: center;">
        <p style="font-size: 14px; color: #334155; margin-top: 0;">Hello <strong>${studentName || 'Valued Client'}</strong>,</p>
        <p style="font-size: 14px; color: #475569;">Your queue ticket is now being called! Please proceed immediately to:</p>
        <div style="margin: 18px 0; padding: 18px; background: #FCEAE9; border-radius: 14px; border: 1px solid #F5D0CE;">
          <div style="font-size: 11px; font-weight: 800; color: #9E0B03; text-transform: uppercase;">Ticket Number</div>
          <div style="font-size: 42px; font-weight: 900; color: #9E0B03; margin: 4px 0;">${queueNumber}</div>
          <div style="font-size: 16px; font-weight: 800; color: #0F172A;">${officeName} — ${windowName || 'Window 1'}</div>
          <div style="font-size: 12px; color: #64748B; margin-top: 4px;">Transaction: ${purpose || 'Campus Service'}</div>
        </div>
        <p style="font-size: 12px; color: #DC2626; font-weight: 700; margin-bottom: 0;">
          Please present your valid ID or requirements at the service window promptly.
        </p>
      </div>
    </div>
  `;
  return sendBrevoEmail({ toEmail, toName: studentName, subject, htmlContent });
}

/**
 * 3. Send "Document Ready for Release / Pickup" Alert Email
 */
export async function sendDocumentReadyEmail({ toEmail, studentName, queueNumber, officeName, purpose, claimDeadlineText = '' }) {
  const subject = `📄 Document Ready for Pickup: ${purpose} (${officeName})`;
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; border: 2px solid #16A34A; border-radius: 18px; overflow: hidden; background: #FFFFFF;">
      <div style="background: #16A34A; color: #FFFFFF; padding: 20px 24px; text-align: center;">
        <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;">Bicol College • Document Release</div>
        <h2 style="margin: 6px 0 0; font-size: 22px;">Your Document is Ready for Claiming!</h2>
      </div>
      <div style="padding: 26px 24px; color: #0F172A;">
        <p style="font-size: 14px; color: #334155; margin-top: 0;">Hello <strong>${studentName || 'Student'}</strong>,</p>
        <p style="font-size: 14px; color: #475569;">
          Good news! Your requested document has finished processing and is now ready for release at <strong>${officeName}</strong>.
        </p>
        <div style="margin: 18px 0; padding: 16px; background: #F0FDF4; border-radius: 14px; border: 1px solid #BBF7D0;">
          <div style="font-size: 13px; margin: 4px 0;"><strong>Reference Ticket:</strong> ${queueNumber}</div>
          <div style="font-size: 13px; margin: 4px 0;"><strong>Releasing Office:</strong> ${officeName}</div>
          <div style="font-size: 13px; margin: 4px 0;"><strong>Document / Purpose:</strong> ${purpose}</div>
          ${claimDeadlineText ? `<div style="font-size: 13px; margin: 4px 0; color: #DC2626;"><strong>Claim Notice:</strong> ${claimDeadlineText}</div>` : ''}
        </div>
        <p style="font-size: 12.5px; color: #475569; margin-bottom: 0;">
          Open the <strong>BCMatik Mobile App</strong>, tap your ticket under the <strong>Documents</strong> tab, and scan the Hallway QR Code upon arriving at ${officeName} for priority claiming!
        </p>
      </div>
    </div>
  `;
  return sendBrevoEmail({ toEmail, toName: studentName, subject, htmlContent });
}