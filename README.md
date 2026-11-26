# Route Analyser

Take or upload a photo of a bouldering wall, have Gemini locate the holds by colour, pick a route, and get an approach guide.

## Features

- Photo capture or upload, downscaled in the browser before sending
- Hold detection by route colour, with an overlay to check the detection
- Approach guide: grade estimate, start, sequence, crux, footwork, body position, alternatives and caveats

## Requirements

- Node.js 18 or later (uses the built-in `fetch`)
- A Google Gemini API key (free from Google AI Studio)

There are no npm dependencies.

## Running locally

```bash
cp .env.example .env        # then add your GEMINI_API_KEY
export $(grep -v '^#' .env | xargs)
npm start
```

Open http://localhost:3000 in your browser.

## How it works

- `public/index.html` is the whole front end: photo handling, colour chips, overlay drawing and rendering.
- `server.js` serves the front end and forwards `POST /api/messages` to the Google Gemini API. The key is read from the environment and never reaches the browser.
- The server fixes the model and token limit, so the browser can't override them.

## Security notes

- Keep `.env` out of version control. `.gitignore` already excludes it.
- This server has no authentication or rate limiting. If you deploy it publicly, add both, or anyone who finds the URL can spend your API credits.
- Photos are sent to the Google Gemini API. Avoid photographing people, or check that your use is acceptable to you.

## Limits and expectations

- Hold detection from photos is approximate. Check the overlay before trusting the guide.
- Grade estimates are rough. Photos flatten angles and hide steepness.
- The guide can't see holds outside the frame.

## Licence

MIT. Change this in `package.json` and add a `LICENSE` file if you want different terms.

## Deploying

### Option A: one host (simplest)

Deploy the whole project to a Node host such as Render or Railway. The server serves the front end and the API from one URL.

1. Push the repository to GitHub.
2. Create a Web Service from the repository.
3. Build command: `npm install`. Start command: `npm start`.
4. Add `GEMINI_API_KEY` as an environment variable.

### Option B: front end on GitHub Pages, server elsewhere

1. Deploy the server as in Option A.
2. Set `ALLOWED_ORIGINS` on the server to your Pages origin, e.g. `https://yourname.github.io`. Separate several origins with commas.
3. In `public/index.html`, set the `api-base` meta tag to your server URL, e.g. `https://route-analyser.onrender.com`.
4. Publish `public/` to GitHub Pages. Options include the `gh-pages` branch or Pages settings pointing at a `docs/` folder.

Without `ALLOWED_ORIGINS`, cross-origin requests are refused by the browser.
