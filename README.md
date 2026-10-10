# Samwise's Gardening 🌱

A simple, offline-friendly gardening companion that runs in your browser, tailored for **Perth, Western Australia**.

**Live app:** https://jaspertwigg.github.io/Samwise-s-Gardening/

## Features

- **Today** – what needs watering, crops nearly ready to harvest, a garden to-do list, and what's good to sow this month
- **My Garden** – add the plants you're growing, track watering, and see progress towards harvest
- **Plant guide** – 35 common vegetables, herbs, fruit and flowers with sun, water, spacing, companions and growing tips
- **Planting calendar** – sow and harvest months tailored to Perth's Mediterranean climate (generic northern/southern hemisphere calendars are available in Settings)
- **Perth extras** – a monthly Perth jobs guide, sprinkler roster day reminders, the winter sprinkler switch-off (1 Jun – 31 Aug), and watering suggestions that adjust for summer heat and winter rain
- **Journal** – dated notes, optionally linked to a plant
- Installable on your phone (Add to Home Screen) and works offline
- Data stays in your browser; export/import a backup from ⚙️ Settings

## How it's built

Plain HTML, CSS and JavaScript in `app/` — no build step. Every push to `main`
deploys `app/` to GitHub Pages via `.github/workflows/deploy.yml`.

To try it locally: `cd app && python3 -m http.server` and open http://localhost:8000.
