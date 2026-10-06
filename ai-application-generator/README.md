# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Prerequisites

- Node.js 20 or newer (Vite 6 supports Node 18, 20, and 22+). Check with
  `node --version`.
- An npm-compatible package manager (npm ships with Node).

## npm scripts

| Script          | Command         | Description                                      |
| --------------- | --------------- | ------------------------------------------------ |
| `npm run dev`   | `vite`          | Start the dev server with hot reload.            |
| `npm run build` | `vite build`    | Build an optimized production bundle to `dist/`. |
| `npm run preview` | `vite preview` | Serve the built bundle from `dist/` locally.    |

## Run Locally

1. Install dependencies:
   `npm install`
2. Copy [.env.local.example](.env.local.example) to `.env.local` and set `GEMINI_API_KEY` to your Gemini API key (get one at https://aistudio.google.com/apikey)
3. Run the app:
   `npm run dev`

## Production build

`npm run build` outputs static files to `dist/`. Because the app is a static
bundle, deploy `dist/` to any static host. You can verify the build locally
with `npm run preview`. The API key is baked in at build time - see the
Security notes below.

## Troubleshooting

- **API calls fail / key errors**: make sure `.env.local` exists next to
  `package.json` and contains a valid `GEMINI_API_KEY=` value. Restart the
  dev server after changing it; Vite only reads `.env.local` at startup.

## Security notes

- `.env.local` is gitignored. Never commit it or paste the key into source files.
- `vite.config.ts` injects `GEMINI_API_KEY` into the client bundle at build
  time, so the key is visible to anyone who can load the app. Treat it as
  public: restrict the key to your own domains in AI Studio, and route calls
  through a small backend proxy if you need the key to stay private.
- If the key ever leaks, revoke and rotate it in AI Studio immediately.
