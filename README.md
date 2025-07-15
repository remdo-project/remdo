# Remdo: Collaborative Lexical Editor

Remdo is a real-time collaborative note-taking and document editing application built with **React**, **TypeScript**, and the **Lexical** editor framework. It uses **Yjs** for real-time synchronization and focuses on a structured note-taking experience with bullet-journal-style organization.

---

## 🚀 Key Features

* **🔄 Real-time Collaboration**: Seamless multi-user editing via Yjs.
* **🧠 Lexical Editor Core**: High-performance, extensible editing built on Lexical.
* **📚 Hierarchical Notes**:

  * ✅ Checking (complete tasks with checkboxes)
  * 📂 Folding/Unfolding notes
  * 🔀 Reordering via keyboard (`Meta + ArrowUp/Down`)
  * ↔️ Indentation (indent/outdent to change hierarchy)
* **🧩 Custom Plugins**:

  * ⚡ Quick Menu for rapid actions
  * 🔍 Search/filter notes
  * 🔗 Auto-link URLs/emails
  * 🖱️ Custom event handling (e.g., hover interactions)
* **🛠 Developer Tools**:

  * Debug UI via `/dev`
  * View Yjs state, Lexical state, and test results
* **🖼 Modern UI**:

  * Styled with Bootstrap + SCSS
  * Glass-effect visuals

---

## 🛠 Getting Started

### Prerequisites

* Node.js (LTS recommended)
* npm or Yarn

### Installation

```bash
git clone https://github.com/piotrlewalski/notes.git
cd notes
npm install  # or yarn
```

### Starting the App

```bash
npm run dev  # or yarn dev
```

App runs at: `http://localhost:5173`

---

## 🧪 Running Tests

### Unit Tests (Vitest)

```bash
npm run test-unit  # or yarn test-unit
```

Dev server + Vitest UI usually runs at: `http://localhost:51204/__vitest__/#/`

### Browser Tests (Playwright)

```bash
npm run test-browser  # or yarn test-browser
```

Results: `data/playwright-report/index.html`

---

## 🗂 Project Structure

```
src/
├─ components/              # React components
├─ Editor/                 # Lexical editor config + custom plugins
├─ plugins/remdo/          # Core Remdo Lexical plugins
├─ Dev/                    # Debug/dev tools
├─ utils/                  # Shared helpers (e.g., nanoid, patching Lexical)
├─ DocumentSelector/       # Yjs provider & document switching
├─ DebugContext.tsx        # Debug mode context
├─ Routes.tsx              # App routes
├─ App.tsx / index.tsx     # App entry
public/
├─ images/                 # Logos, icons
├─ yjs.html                # Yjs testing client
```

---

## ⚠️ Important Clarifications & TODOs

> These are things you should sync with Piotr or contributors about:

### 🔌 Yjs Server Setup

* Is there a custom **Hocuspocus** or **y-websocket** server?
* What port does it run on? (`:123` or `:8080`?)
* Is the server part of this repo or separate?

### 💾 Persistence

* `DocumentSelector.tsx` uses `y-indexeddb` for client-side persistence.
* Is there any backend storage?

### 🏗 Build & Deployment

* Likely:

```bash
npm run build  # or yarn build
```

* But confirm if any special flags or configs are needed.

### 🔍 Dev Ports (confirm)

* App: `5173`
* Vitest: `51204`
* Collab (Yjs): `123` or `8080`?

### 🧪 yjs.html

* Used for testing Yjs independently.
* Add instructions for how to run/use this file.

### 🧠 Custom Editor Internals

* `editor._remdoState.setFilter(...)` → Explain where `_remdoState` is defined
* `patch()` in `utils.ts` → Describe why Lexical is being patched and what the risks/benefits are

### 🎨 Styles

* SCSS files use:

```scss
@use "/node_modules/bootstrap-icons/font/bootstrap-icons";
```

* Confirm if this is portable or needs manual config

### 🧹 TODO Comments in Code

* `TODO merge and remove alias` in `api.ts`
* `globalThis.printStack` / `globalThis.remdoGenerateNoteID` → Document that they’re for dev only and should be sandboxed/removed in prod

---

## 🤝 Contributing

We welcome contributions! 🎉

1. Fork the repo
2. Create a branch
3. Commit your changes with meaningful messages
4. Push and open a PR
5. Describe your changes clearly in the PR

Please make sure to:

* Follow existing patterns and naming conventions
* Add/update tests if necessary
* Keep things readable and DRY

---

## 🙋‍♂️ Questions? Confused?

Don’t hesitate to ping Piotr or open an issue. If something feels unclear to you, it’s probably unclear to someone else too.

Let’s make Remdo awesome—together. 💪
