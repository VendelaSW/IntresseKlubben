# Frontend – Intresseklubben

React + Vite. Kör lokalt:

```
npm install
cp .env.example .env
npm run dev
```

## Deploy (Vercel)

Frontend deployas som ett eget Vercel-projekt, separat från backend:

1. Skapa ett nytt Vercel-projekt från repot och sätt **Root Directory** till `frontend`. Vite känns igen automatiskt (build-kommando `npm run build`, output `dist`).
2. Sätt miljövariabeln `VITE_API_URL` till backendens Vercel-URL (t.ex. `https://intresseklubben-backend.vercel.app`).
3. `vercel.json` i den här mappen lägger till en rewrite till `index.html` så att client-side routing (`react-router-dom`) fungerar på direktlänkar/refresh.
