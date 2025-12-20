# Bow-Wow: 3D Boat Hull Designer

A web-based tool for designing 3D-printable boat hulls. Adjust parameters with sliders, preview in real-time 3D, and export STL files for printing.

**Live Demo:** https://wmppaul.github.io/bow-wow/

## Features

- Parametric hull design (length, beam, height, wall thickness)
- Multiple bow types: Plumb, Raked, Deep V
- Bilge radius control for rounded hull corners
- Motor mount configuration
- Build plate fit visualization (diagonal placement on square plate)
- Waterline calculation based on weight inputs
- STL export for 3D printing
- Save/load designs as JSON

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
  - **Mac**: `brew install node` (if you have Homebrew) or download from nodejs.org
  - **Windows**: Download installer from nodejs.org and run it

### Installation & Running

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/bow-wow.git
cd bow-wow

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173 in your browser.

## Hosting on GitHub Pages (Free)

You can deploy this to GitHub Pages so anyone can use it without installing anything:

### Setup Steps

1. **Update `vite.config.ts`** - Add base path for your repo:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/bow-wow/',  // Replace 'bow-wow' with your repo name
  plugins: [react()],
})
```

2. **Create `.github/workflows/deploy.yml`**:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install and Build
        run: |
          npm ci
          npm run build

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

      - name: Deploy to GitHub Pages
        uses: actions/deploy-pages@v4
```

3. **Enable GitHub Pages**:
   - Go to your repo on GitHub
   - Settings > Pages
   - Under "Source", select "GitHub Actions"

4. **Push your changes** - The site will deploy automatically to `https://YOUR_USERNAME.github.io/bow-wow/`

### Alternative Hosting

- **Netlify**: Connect GitHub repo, build command `npm run build`, publish directory `dist`
- **Vercel**: Import from GitHub, auto-detects Vite
- **Any static host**: Upload the `dist/` folder after running `npm run build`

## Usage

### Camera Controls
- **Drag**: Rotate view
- **Scroll**: Zoom in/out
- **Keyboard**: P (perspective), O (orthographic), H (home), T (top), F (front), R (right)

### Build Plate Indicator
- **Green**: Hull fits on build plate (positioned diagonally)
- **Red**: Hull exceeds build plate size

### Workflow
1. Adjust hull parameters using sliders
2. Check that build plate shows green (or intentionally exceed if splitting)
3. Click "Export STL" to download
4. Import STL into your slicer (PrusaSlicer, Cura, etc.)

## Tech Stack

- React + TypeScript
- Three.js via React Three Fiber
- Vite
