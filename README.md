# Spanish for School Liaisons

Plain HTML/CSS/JS PWA. No build step.

## Edit content
Edit `data/cards.json`, `data/phrases.json`, `data/tips.json`. Add `"flag": "reason"` to any item you want marked "Verify". Then bump `VERSION` in `sw.js` (e.g. `v3`) so phones refresh.

## Run locally
```
node -e "require('http').createServer((q,r)=>require('fs').readFile('.'+(q.url.split('?')[0]==='/'?'/index.html':q.url.split('?')[0]),(e,d)=>{r.end(d)})).listen(5180)"
```
Then open http://localhost:5180.

## Deploy to GitHub Pages
1. Create a new GitHub repo and push this folder to it (`git init`, `git add .`, `git commit`, `git remote add origin ...`, `git push -u origin main`).
2. Repo Settings, Pages, Source: "Deploy from a branch", Branch: `main`, folder `/ (root)`.
3. Open `https://<you>.github.io/<repo>/` on your phone.
4. iPhone: Safari, Share, Add to Home Screen. Android: Chrome menu, Install app.
5. Open it once online so it caches; afterwards it works offline.

Notes: offline audio needs a Spanish voice installed on the phone (iOS: Settings, Accessibility, Spoken Content, Voices; Android: text-to-speech settings). Edits show up after the app is opened twice (it refreshes in the background).
