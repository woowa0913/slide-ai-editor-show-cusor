<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1wgkcQ8co7TOpH4KcdkxrG4parKfhGfnf

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `GEMINI_API_KEY` in `.env.local` to your Gemini API key  
   (the app also accepts `API_KEY` for backward compatibility)
3. Run the app:
   `npm run dev`

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repository in Vercel.
3. Set Environment Variable (all scopes):
   - `GEMINI_API_KEY`: your Gemini API key
   - Apply to `Production`, `Preview`, and `Development`
4. Build settings (also pinned in `vercel.json`):
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Verify Framework preset is `Vite`.
6. Deploy.

## Security / Audit

- Check dependency vulnerabilities:
  - `npm audit`
- Auto-apply safe non-breaking fixes:
  - `npm audit fix`
- Re-validate build after any fix:
  - `npm run build`
