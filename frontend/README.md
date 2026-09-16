This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Self-hosted / PM2 deployment

If you see **"Failed to find Server Action 'x'"** in the UI (e.g. in `intellicall-ui-error.log`), it usually means:

1. **Stale client after deploy** – Users have an old JS bundle that no longer matches the server. **Fix:** Rebuild the frontend, restart the UI process (e.g. `pm2 restart intellicall-ui`), and have users hard-refresh (Ctrl+Shift+R / Cmd+Shift+R) or clear cache.
2. **Multiple instances / encryption key mismatch** – When running multiple Next.js instances (or after rebuilds), server action IDs can change. **Fix:** Set a stable encryption key at **build time** so all instances use the same key:
   - Generate a key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - Set in the environment used when running `npm run build`: `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<that-base64-key>`
   - Use the same value for every build and on every server that serves this app.

After setting the key, run a fresh `npm run build` and restart the UI.
