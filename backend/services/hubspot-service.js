const Settings = require('../models/Settings');
const Lead = require('../models/Lead');
const { getAccessTokenForUser, apiClient } = require('../utils/hubspot');

function splitName(name) {
    if (!name) return { firstname: '', lastname: '' };
    const parts = String(name).trim().split(/\s+/);
    return { firstname: parts[0] || '', lastname: parts.slice(1).join(' ') || '' };
}

function extractEmail(lead) {
    if (!lead?.fields?.length) return '';
    const f = lead.fields.find((x) => /email/i.test(x.name || ''));
    const val = f?.value;
    return typeof val === 'string' ? val.trim() : '';
}

async function getConnectedSettings(userId) {
    const settings = await Settings.findOne({ userId });
    if (!settings || !settings.hubspotConnected) return null;
    return settings;
}

async function searchContactByPhone(client, phone) {
    if (!phone) return null;
    try {
        const { data } = await client.post('/crm/v3/objects/contacts/search', {
            filterGroups: [{
                filters: [{ propertyName: 'phone', operator: 'EQ', value: phone }]
            }],
            properties: ['phone', 'firstname', 'lastname', 'email'],
            limit: 1
        });
        return data?.results?.[0] || null;
    } catch (err) {
        // Search may fail on schema issues; treat as not found
        return null;
    }
}

class HubSpotService {
    /**
     * Push a lead to HubSpot as a contact (create or update by phone).
     * Returns the HubSpot contact id, or null if skipped/failed.
     */
    static async upsertContactFromLead(userId, leadOrId) {
        try {
            const settings = await getConnectedSettings(userId);
            if (!settings || !settings.hubspotSyncLeads) return null;

            const lead = typeof leadOrId === 'object' && leadOrId?._id
                ? leadOrId
                : await Lead.findById(leadOrId);
            if (!lead) return null;
            if (!lead.phone) return null; // never push empty/identity-less contacts

            const accessToken = await getAccessTokenForUser(userId);
            if (!accessToken) return null;
            const client = apiClient(accessToken);

            const { firstname, lastname } = splitName(lead.name);
            const email = extractEmail(lead);
            const properties = {
                phone: lead.phone,
                firstname,
                lastname
            };
            if (email) properties.email = email;

            const existing = await searchContactByPhone(client, lead.phone);
            if (existing?.id) {
                await client.patch(`/crm/v3/objects/contacts/${existing.id}`, { properties });
                return existing.id;
            }
            const { data } = await client.post('/crm/v3/objects/contacts', { properties });
            return data?.id || null;
        } catch (err) {
            console.error('[HubSpot] upsertContactFromLead failed:', err.response?.data?.message || err.message);
            return null;
        }
    }

}

module.exports = HubSpotService;
