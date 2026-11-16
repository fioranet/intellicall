import { Chats } from "@phosphor-icons/react";

/**
 * Our own neutral icon, for the places WhatsApp's logo may not go: the
 * sidebar, which is our interface's own set of line icons, and small
 * indicators where the word "WhatsApp" is not beside it (WhatsApp's brand
 * rules: never use the logo to replace the word WhatsApp). Wherever WhatsApp
 * is named, WhatsAppMark in parts.tsx draws WhatsApp's own glyph instead.
 */
export const WhatsAppIcon = Chats;
