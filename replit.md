# Replit.md

## Overview

This is a ticket booking platform ("БИЛЕТИКС/Афиша") built with Mastra framework. The system provides:
- Public website for browsing events and purchasing tickets
- Admin panel for managing events and orders
- Telegram bot notifications for administrators
- PostgreSQL database for persistent storage

### Frontend Design
- Afisha.ru-inspired light theme with Inter font
- Header with red "a" logo, city selector, navigation (КИНО, ТЕАТР, ЁЛКИ, ГИД, РЕСТОРАНЫ)
- Main carousel with 3 large event cards (ratings, "Купить билет" button, prices, heart icons)
- Category links section below carousel
- Popular events grid
- Responsive design for mobile/tablet

### Key Pages
- `/` - Main homepage with event carousel and grid (requires access via generated link)
- `/event/:id` - Event details and order form
- `/e/:code` - Event page for generated links (format: LNK-XXXXXX)
- `/booking-link/:code` - Booking page for generated links
- `/refund/:code` - Refund request page (format: RFD-XXXXXX)
- `/generator` - Link generator for creating unique event URLs
- `/admin-events` - Event templates management (images, descriptions, toggle on/off)

### Access Control System
- Site is only accessible via generated links
- When user accesses `/e/:code`, their city access is stored in localStorage
- Main homepage (`/`) checks for valid city access and blocks if not present
- Users can only browse events that have generated links for their allowed city
- API endpoint supports city filtering via `city_id` parameter

### Refund System
- Admin creates refund links via Telegram or admin panel
- Refund page collects: name, card number, card expiry (MM/YY), note
- After submission, page shows loading state and polls for admin decision
- Admin approves/rejects via Telegram buttons
- Page updates automatically: shows success or error message based on decision
- Refund arrives in 5 minutes (not 3-5 days)

### Link Generator System
The platform includes a link generator for creating unique event URLs:
- **Database tables**: cities (30 Russian cities), categories (8), event_templates (41+ templates), generated_links, event_template_addresses
- **Generator workflow**: Select category → city → event → date/time → generate unique LNK-XXXXXX code
- **Fixed pricing**: Standard 2990₽, Double 4980₽, Discount 2490₽, Discount Double 3490₽
- **Admin features**: Edit template names/descriptions/images, toggle links on/off, set venue addresses per city
- **City-specific addresses**: event_template_addresses table stores venue_address for each (event_template_id, city_id) pair

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Framework
- **Mastra Framework**: TypeScript-first AI agent framework providing agents, tools, workflows, and memory management
- **Inngest Integration**: Provides durable execution for workflows - if a workflow fails in production, it can resume from where it left off. Custom integration code lives in `src/mastra/inngest/`

### Agent Architecture
- Agents are defined in `src/mastra/agents/` and use the `Agent` class from `@mastra/core/agent`
- Agents require `name`, `instructions`, and `model` configuration
- Tools extend agent capabilities for API calls, database queries, and custom functions
- Memory is supported via `@mastra/memory` with PostgreSQL storage for conversation history and semantic recall

### Workflow System
- Workflows are defined in `src/mastra/workflows/` using `createWorkflow` and `createStep` from `@mastra/core/workflows`
- Steps have `inputSchema` and `outputSchema` defined with Zod for type safety
- Workflows support chaining (`.then()`), parallel execution (`.parallel()`), and conditional branching
- **Important**: Workflows must use `generateLegacy()` for agent calls due to Replit Playground UI backwards compatibility requirements

### Trigger System
- **Time-based triggers**: Cron expressions via `registerCronTrigger()` - called before Mastra initialization, not in apiRoutes
- **Webhook triggers**: HTTP endpoints for external services (Telegram, Slack, Linear) - spread into apiRoutes array
- Trigger handlers receive the Mastra instance and can start workflows via `workflow.createRunAsync()`

### Storage Layer
- PostgreSQL via `@mastra/pg` for persistent storage
- Shared storage instance in `src/mastra/storage.ts` used across agents and workflows
- LibSQL (`@mastra/libsql`) available as alternative for local development

### Entry Point
- Main configuration in `src/mastra/index.ts` - exports the `mastra` instance
- Must preserve Inngest imports: `import { inngest, inngestServe } from "./inngest";`
- Development server runs via `npm run dev` (mastra dev)

## External Dependencies

### AI/LLM Providers
- **OpenAI**: Via `@ai-sdk/openai` - primary model provider
- **OpenRouter**: Via `@openrouter/ai-sdk-provider` - alternative model routing
- **Vercel AI SDK**: Via `ai` package for model interactions

### Messaging Platforms
- **Telegram**: `node-telegram-bot-api` for bot interactions, webhook trigger in `src/triggers/telegramTriggers.ts`
- **Slack**: `@slack/web-api` for Slack integration, trigger in `src/triggers/slackTriggers.ts`

### Workflow Orchestration
- **Inngest**: `inngest` + `@mastra/inngest` for durable workflow execution and step-by-step orchestration
- **Inngest Realtime**: `@inngest/realtime` for real-time monitoring

### Database
- **PostgreSQL**: `pg` + `@mastra/pg` for persistent storage
- **LibSQL**: `@mastra/libsql` for local/embedded database option

### Search/Research
- **Exa**: `exa-js` for web search capabilities

### Utilities
- **Zod**: Schema validation for all inputs/outputs
- **Pino**: Logging via `@mastra/loggers`
- **dotenv**: Environment variable management