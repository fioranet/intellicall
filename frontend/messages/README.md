# Translations

Every string the dashboard shows lives in this folder. There is one directory per
language and one JSON file per product area.

```
messages/
  en/          ← source of truth. Never delete a key here.
  es/  fr/  de/  ar/
```

## Adding a language

1. Add an entry to `LOCALES` in `frontend/i18n/config.ts`:

   ```ts
   { code: "pt", label: "Português", dir: "ltr" },
   ```

   `code` is both the folder name and the value stored in the cookie. `label` is
   what the language switcher shows — write it in its own language. `dir` is
   `"rtl"` for Arabic, Hebrew, Persian and Urdu; `"ltr"` for everything else.

2. Copy `messages/en/` to `messages/<code>/` and translate the values.

3. Rebuild (`npm run build`). The new language appears in the switcher.

**You do not have to translate everything up front.** Any key you leave out —
or any file you don't copy — falls back to English, so a half-finished language
still ships a working app. Nothing ever renders a raw key like
`settings.apiKeys.title` to a user.

## Rules for translators

- **Keep the placeholders.** `{count}`, `{name}`, `{date}` and friends are filled
  in at runtime. Move them around the sentence freely, but do not rename or drop
  them — `npm run i18n:keys` fails the build if they stop matching English.
- **Keep the tags.** Some strings contain `<b>`, `<code>` or `<em>`. They become
  real formatting; leave them paired and intact.
- **Plurals use ICU.** For example:

  ```
  "{count, plural, one {# lead selected} other {# leads selected}}"
  ```

  Use whichever categories your language needs. Arabic, for instance, uses
  `zero`, `one`, `two`, `few`, `many` and `other`; German only needs `one` and
  `other`. `#` is replaced by the number.
- **Brand names stay as they are** — Twilio, Slack, HubSpot, WhatsApp, Deepgram,
  ElevenLabs, OpenRouter, Sarvam AI, n8n, Google Sheets.

## Checking your work

```bash
npm run i18n:keys       # coverage, orphaned keys, placeholder mismatches
npm run i18n:literals   # finds UI text that was never routed through a translation
npm run i18n:unused     # finds catalog keys nothing references any more
```

`i18n:keys` is the one that matters: it exits non-zero on a key your language has
that English does not (usually a typo), and on any string whose placeholders
stopped matching the English original.

## What is *not* translated

- **Error messages coming from the server.** The API replies in English, and the
  dashboard shows the server's own wording when it has one. Only the fallback
  text is translated. This is deliberate — it keeps the API contract stable.
- **The public marketing pages** (landing, about, contact, terms, privacy) and
  the SEO metadata. Those stay English.
- **Agent voice language** is a separate setting. The dropdown inside an agent
  controls what language the AI *speaks on a call*; it has nothing to do with the
  dashboard language and lives under `agents.voiceLanguage.*`.

## Right-to-left

Setting `dir: "rtl"` on a locale is all that is needed. The layout mirrors
automatically: the sidebar moves to the right, spacing and alignment flip, and
directional icons rotate. Latin data inside Arabic text — phone numbers, e-mail
addresses, API keys — is isolated with the `.ltr-data` class so it stays readable.

If you add new UI, use Tailwind's logical utilities (`ms-`/`me-`, `ps-`/`pe-`,
`start-`/`end-`, `text-start`/`text-end`) rather than the physical ones
(`ml-`, `mr-`, `left-`, `right-`, `text-left`). They flip on their own.
