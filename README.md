# First Sale AI System for Moms

This repository hosts the website and documentation portal for the "First Sale AI System for Moms" program. The goal is to help single-income moms build AI-powered digital businesses from scratch and validate their ideas, create simple products, and make their first sale within 30 days.

## Structure

- `index.html` – the homepage for the documentation portal.
- `docs/` – additional pages and resources for each section of the system.
- `assets/` – place for images, CSS, and other static files (create as needed).

## Getting Started

To view the documentation locally, open `index.html` in a web browser.

## Development

This project now uses **Eleventy** to build the static site from Markdown sources.

## Deployment

You can publish `./_site` to any static hosting service. Two simple options:

1. **GitHub Pages** – push this repo to GitHub, enable Pages in repo settings, and use the `gh-pages` branch or `main`/`/docs` folder.  
   A workflow is included at `.github/workflows/deploy.yml` which builds the site and deploys when `main` is updated.
2. **Netlify / Vercel** – connect your GitHub repo via the dashboard and set the build command to `npm run build` with output directory `_site`. Every push will trigger a deploy.

Other providers (S3/CloudFront, Firebase, etc.) are supported as long as they can serve static files. When hosting, make sure `search.json` and `rss.xml` remain accessible.


### Building the site

1. Install Node.js (already done).  
2. Run `npm install` to install dependencies.  
3. Use `npm run build` to generate `./_site` directory.  
4. Use `npm run serve` for a local development server with live reload.

Source files are mostly Markdown (`.md`) under the root, `docs/` and `blog/`.  
Layouts and partials live in `_includes/`.

### Blog system

- Add markdown posts to `blog/posts/` with frontmatter (`title`, `layout`).  
- The blog index at `blog/index.md` iterates the `collections.blog` posts.  
- Run `npm run build` to update the site; Eleventy will generate HTML automatically.

(The previous `scripts/generate_blog.js` script is now optional and can be removed.)

### Marketing & Email

- Templates, graphics, and Canva files live under `marketing/assets/`.  
- AI prompts for blog, social media, and email are in `marketing/prompts.md`.  
- A sample email subscription form is included as a partial (`_includes/subscription.njk`). Replace the form action URL with your service (Mailchimp, ConvertKit, etc.).

### Search

A simple client‑side search is available in the nav. Eleventy generates a `search.json` file, and `assets/search.js` handles indexing/filtering. No build steps required beyond `npm run build`.

### Older instructions

If you prefer manual updates, simply create or edit `.md` files and rebuild with Eleventy.
