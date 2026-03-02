# Base FE

Frontend boilerplate with React, Vite, TypeScript, Tailwind CSS, and shadcn/ui.

## Tech Stack

- **React 19** + **TypeScript**
- **Vite** - Build tool
- **Tailwind CSS v4** - Styling
- **shadcn/ui** - UI components
- **React Router v7** - Routing
- **Zustand** - State management (global store, theme)
- **React Query** - Data fetching
- **Axios** - HTTP client
- **React Hook Form** + **Zod** - Forms & validation
- **ESLint** + **Prettier** + **Husky** - Code quality
- **Storybook** - Component documentation

## Getting Started

### Prerequisites

- Node.js 18+
- npm / pnpm / yarn

### Install

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable       | Description                                     |
| -------------- | ----------------------------------------------- |
| `VITE_API_URL` | API base URL (default: `http://localhost:8080`) |

### Run development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Build

```bash
npm run build
```

Output: `dist/` directory

### Preview production build

```bash
npm run preview
```

## Scripts

| Script                    | Description                 |
| ------------------------- | --------------------------- |
| `npm run dev`             | Start dev server            |
| `npm run build`           | Production build            |
| `npm run preview`         | Preview production build    |
| `npm run lint`            | Run ESLint                  |
| `npm run format`          | Format with Prettier        |
| `npm run format:check`    | Check formatting            |
| `npm run storybook`       | Start Storybook (port 6006) |
| `npm run build-storybook` | Build Storybook static      |

## Project Structure

```
src/
├── components/
│   ├── form-controls/   # Form field components (TextField, NumberField, ...)
│   ├── layout/          # Layout (Header, Footer, MainLayout, Content)
│   └── ui/              # shadcn UI primitives
├── lib/                 # Utils, axios, currency formatter
├── pages/               # Route pages
├── providers/           # React Query provider
└── store/               # Zustand stores (theme)
```

## Docker

Build only (for host nginx to serve):

```bash
DOCKER_BUILDKIT=1 docker build --output type=local,dest=./dist .
```

Output: `./dist` — point host nginx `root` to this directory.

## Routes

- `/` - Home
- `/about` - About
- `/demo` - Demo page (UI components showcase)

## License

Private
