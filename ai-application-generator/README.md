# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.local.example](.env.local.example) to `.env.local` and set `GEMINI_API_KEY` to your Gemini API key (get one at https://aistudio.google.com/apikey)
3. Run the app:
   `npm run dev`

## Security notes

- `.env.local` is gitignored. Never commit it or paste the key into source files.
- `vite.config.ts` injects `GEMINI_API_KEY` into the client bundle at build
  time, so the key is visible to anyone who can load the app. Treat it as
  public: restrict the key to your own domains in AI Studio, and route calls
  through a small backend proxy if you need the key to stay private.
- If the key ever leaks, revoke and rotate it in AI Studio immediately.
