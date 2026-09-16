const axios = require('axios');

// Meta WhatsApp Cloud API (Graph API). Users bring their own access token +
// phone number ID from a Meta developer app — no platform-level OAuth app needed.
const GRAPH_BASE = 'https://graph.facebook.com/v23.0';

/**
 * Normalize a phone number for the Cloud API: digits only, with country code.
 * Meta expects E.164 without the leading '+' (e.g. '15551234567').
 */
function normalizeNumber(input) {
    return String(input || '').replace(/\D/g, '');
}

/**
 * Map common Graph API errors to messages a non-developer can act on.
 */
function describeGraphError(err) {
    const gerr = err.response?.data?.error;
    if (!gerr) return err.message || 'WhatsApp request failed';

    const code = gerr.code;
    const sub = gerr.error_subcode;

    if (code === 190) return 'Access token is invalid or expired. Generate a new permanent token in your Meta app.';
    if (code === 100 && /phone number/i.test(gerr.message || '')) return 'Phone Number ID not found. Copy it from WhatsApp > API Setup in your Meta app.';
    if (code === 100) return `Invalid request: ${gerr.message}`;
    if (code === 10 || code === 200 || code === 299) return 'The access token is missing WhatsApp permissions (whatsapp_business_messaging).';
    if (code === 131030 || sub === 131030) return 'Recipient is not in the allowed list. Test numbers can only message recipients added under WhatsApp > API Setup in your Meta app.';
    if (code === 131047 || code === 131026) return 'Message could not be delivered — send any WhatsApp message from the recipient number to your business number first to open the 24-hour window.';
    if (code === 131056) return 'Too many messages sent to this recipient in a short time. Try again in a moment.';
    if (code === 133010) return 'The business phone number is not registered with the Cloud API. Complete registration in your Meta app.';
    if (code === 132001) return 'Template not found. Check the template name and language, and make sure the template is approved in Meta Business Manager.';
    if (code === 132000) return 'Template parameter count mismatch. The template must have exactly 3 body variables: {{1}} name, {{2}} date, {{3}} time.';
    if (code === 132012) return 'Template parameter format mismatch. Use plain text body variables: {{1}} name, {{2}} date, {{3}} time.';
    if (code === 132015 || code === 132016) return 'The template is paused or disabled due to quality. Check its status in Meta Business Manager.';

    return gerr.message || 'WhatsApp request failed';
}

/**
 * Verify credentials by fetching the business phone number details.
 * Returns { displayPhoneNumber, verifiedName } on success, throws otherwise.
 */
async function getPhoneNumberInfo(accessToken, phoneNumberId) {
    const { data } = await axios.get(`${GRAPH_BASE}/${phoneNumberId}`, {
        params: { fields: 'display_phone_number,verified_name' },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
    });
    return {
        displayPhoneNumber: data.display_phone_number || '',
        verifiedName: data.verified_name || ''
    };
}

/**
 * Send a plain text message to a single recipient.
 */
async function sendTextMessage(accessToken, phoneNumberId, to, body) {
    const { data } = await axios.post(
        `${GRAPH_BASE}/${phoneNumberId}/messages`,
        {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: normalizeNumber(to),
            type: 'text',
            text: { preview_url: false, body }
        },
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        }
    );
    return data;
}

/**
 * Send a pre-approved template message (works outside the 24-hour session
 * window — required for business-initiated messages like reminders).
 * bodyParams are positional: {{1}}, {{2}}, ...
 */
async function sendTemplateMessage(accessToken, phoneNumberId, to, templateName, languageCode, bodyParams = []) {
    const template = {
        name: templateName,
        language: { code: languageCode || 'en' }
    };
    if (bodyParams.length) {
        template.components = [{
            type: 'body',
            parameters: bodyParams.map((p) => ({ type: 'text', text: String(p) }))
        }];
    }
    const { data } = await axios.post(
        `${GRAPH_BASE}/${phoneNumberId}/messages`,
        {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: normalizeNumber(to),
            type: 'template',
            template
        },
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        }
    );
    return data;
}

module.exports = {
    GRAPH_BASE,
    normalizeNumber,
    describeGraphError,
    getPhoneNumberInfo,
    sendTextMessage,
    sendTemplateMessage
};
