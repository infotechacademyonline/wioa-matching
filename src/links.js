// External links shared by the server, emails, and the registration page.
// WhatsApp invite links get reset from time to time — set WHATSAPP_GROUP_URL
// in the environment to change it without a code deploy.

module.exports = {
  WHATSAPP_GROUP_URL:
    process.env.WHATSAPP_GROUP_URL || 'https://chat.whatsapp.com/HNOTFX0oHLv9sGhznZ7z5d?mode=gi_t',
};
