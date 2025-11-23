<!-- Auto-generated guidance for AI coding agents working on this repo -->
# Copilot instructions for AgendaU (React + Vite)

This project is a small React + Vite app (TailwindCSS) for a university planner. The goal of these instructions is to help AI coding agents become productive quickly by pointing out the repository's architecture, conventions, and important patterns discovered in the codebase.

Key commands
- `npm run dev` — start Vite dev server with HMR.
- `npm run build` — produce a production build (`vite build`).
- `npm run preview` — preview a production build (`vite preview`).
- `npm run lint` — run ESLint (`eslint .`).

High-level architecture and why
- Single-page React app served by Vite. Entry: `index.html` -> `src/main.jsx`.
- UI and most logic live in a single main component: `src/App.jsx`. Expect much of the app's behavior (calendar, modal, reminders, local persistence) to be in that file.
- Styling uses Tailwind; Tailwind entrypoint is `src/index.css` (`@tailwind base; @tailwind components; @tailwind utilities;`). Configuration is in `tailwind.config.js`.

Important data flows & conventions
- Persistence: events are saved to `localStorage` under the key `uniEvents`. Value is a JSON array of event objects.
  - Event shape (observed): `{ id: number, date: "YYYY-MM-DD", time: "HH:MM", title: string, type: string, description?: string }`.
  - Date formatting uses `YYYY-MM-DD` (ISO date without timezone) and events are read/written as `event.date + 'T' + event.time` to construct Date objects.
- Reminder loop: a `useEffect` in `src/App.jsx` runs an interval every 30 seconds to scan events and push short-lived in-app notifications when an event is within 30 minutes. If modifying reminder timing or logic, update that effect.
- UI language: many labels, comments and strings are in Spanish. Keep UI text consistent with Spanish unless asked otherwise.

Coding patterns and file layout
- Small codebase with minimal abstraction. `src/App.jsx` contains UI, state and helpers; when adding features prefer extracting smaller components into `src/components/` and keeping `App.jsx` as a coordinator.
- Icons are provided by `lucide-react` (imported in `App.jsx`). Add icon imports at top of components when needed.
- Tailwind classes are used directly in JSX rather than CSS-in-JS. To add or edit styles, update classes in JSX and, if necessary, extend `tailwind.config.js`.

Where to look first when debugging or adding features
- `src/App.jsx` — calendar generation, event add/delete, reminders, modal and layout.
- `src/main.jsx` — React bootstrap; note `index.css` import is required for Tailwind to work.
- `src/index.css` & `tailwind.config.js` — Tailwind setup and content paths.
- `package.json` — scripts and dependency list (Vite, React, Tailwind, ESLint).

Project-specific pitfalls and gotchas
- Because events are stored as strings in localStorage, parsing/formatting is easy to get wrong. Use the observed `YYYY-MM-DD` + `T` + `HH:MM` construction to create Date objects consistently.
- The app relies on client time for reminders; tests and features that depend on time should mock Date where appropriate.
- UI strings are Spanish; PRs that add English text should consider translations or keep consistent language.

Examples
- Read saved events (from `src/App.jsx`):
  - `const saved = localStorage.getItem('uniEvents'); const events = saved ? JSON.parse(saved) : []`.
- Reminder check (behavior summary): runs every 30s, computes `new Date(event.date + 'T' + event.time')`, and if `0 < diff <= 1800000` (30 minutes) it raises an in-app notification.

Contributing guidance for AI agents
- Prefer minimal, focused changes. If a feature increases complexity (new state slices, big UI changes), extract components into `src/components/` and add brief tests or manual test instructions in the PR description.
- Keep Tailwind content paths updated when adding new file types or directories to avoid purging styles.
- Run `npm run lint` and `npm run dev` locally to sanity-check changes and HMR behavior.

Missing or unknowns (ask the human)
- Should new UI copy be in Spanish-only or support multiple locales?
- Are there plans to split `App.jsx` into components (preferred filenames/structure)?

If anything in these notes is unclear or you want a different emphasis (for example, more testing or design-system guidance), tell me what to add or change.
