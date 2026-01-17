# Visual Task Manage

A lightweight, visual task manager with a playful bubble board for organizing work across In, Do, and Out. It supports delegation, categories, priorities, due dates, and gamified progress stats.

## Features
- Visual bubble board with drag-and-drop positioning
- In / Do / Out workflow
- Task delegation with accept/decline flow
- Categories with colors
- Priority, effort, and due dates
- Completion tracking with XP, levels, and streaks
- Clerk authentication + user search for delegation

## Setup

### Requirements
- Node.js 20+
- PostgreSQL database
- Clerk account for authentication

### Environment variables
Create a `.env` file in the project root:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
CLERK_SECRET_KEY="sk_..."
CLERK_WEBHOOK_SECRET="whsec_..."
```

### Install and run
```bash
npm install
npx prisma migrate dev
npm run dev
```

App runs at `http://localhost:3000`.

## Notes
- Prisma uses `prisma.config.ts` and reads `DATABASE_URL` from `.env`.
- Delegated tasks can be accepted or declined by the recipient.
