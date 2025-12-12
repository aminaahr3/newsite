import { Mastra } from "@mastra/core";
import { MastraError } from "@mastra/core/error";
import { PinoLogger } from "@mastra/loggers";
import { LogLevel, MastraLogger } from "@mastra/core/logger";
import pino from "pino";
import { MCPServer } from "@mastra/mcp";
import { NonRetriableError } from "inngest";
import { z } from "zod";

import { inngest, inngestServe } from "./inngest";

// Import tools for MCP server and API
import { getEventsTool } from "./tools/getEventsTool";
import { createOrderTool } from "./tools/createOrderTool";
import { manageOrderTool } from "./tools/manageOrderTool";
import { sendTelegramNotificationTool } from "./tools/sendTelegramNotificationTool";

// Import Telegram admin service for notifications
import { 
  sendOrderNotificationToAdmin,
  sendChannelNotification,
  updateOrderMessageStatus,
  answerCallbackQuery,
  setupTelegramWebhook
} from "./services/telegramAdminService";

// Setup Telegram webhook on startup
setTimeout(() => {
  setupTelegramWebhook().then(success => {
    if (success) {
      console.log("🤖 [Telegram] Webhook initialized");
    }
  });
}, 3000);

// Helper function to generate unique link codes with LNK- prefix
function generateLinkCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'LNK-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

class ProductionPinoLogger extends MastraLogger {
  protected logger: pino.Logger;

  constructor(
    options: {
      name?: string;
      level?: LogLevel;
    } = {},
  ) {
    super(options);

    this.logger = pino({
      name: options.name || "app",
      level: options.level || LogLevel.INFO,
      base: {},
      formatters: {
        level: (label: string, _number: number) => ({
          level: label,
        }),
      },
      timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
    });
  }

  debug(message: string, args: Record<string, any> = {}): void {
    this.logger.debug(args, message);
  }

  info(message: string, args: Record<string, any> = {}): void {
    this.logger.info(args, message);
  }

  warn(message: string, args: Record<string, any> = {}): void {
    this.logger.warn(args, message);
  }

  error(message: string, args: Record<string, any> = {}): void {
    this.logger.error(args, message);
  }
}

// Storage is initialized lazily only when actually needed by tools
// This allows the app to start without database connection

export const mastra = new Mastra({
  storage: undefined, // Storage disabled to allow production startup without DB
  // No workflows or agents - using simple Telegram admin notifications
  workflows: {},
  agents: {},
  mcpServers: {
    allTools: new MCPServer({
      name: "allTools",
      version: "1.0.0",
      tools: {
        getEventsTool,
        createOrderTool,
        manageOrderTool,
        sendTelegramNotificationTool,
      },
    }),
  },
  bundler: {
    externals: [
      "@slack/web-api",
      "inngest",
      "inngest/hono",
      "hono",
      "hono/streaming",
      "pg",
    ],
    sourcemap: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    middleware: [
      async (c, next) => {
        const mastra = c.get("mastra");
        const logger = mastra?.getLogger();
        logger?.debug("[Request]", { method: c.req.method, url: c.req.url });
        try {
          await next();
        } catch (error) {
          logger?.error("[Response]", {
            method: c.req.method,
            url: c.req.url,
            error,
          });
          if (error instanceof MastraError) {
            if (error.id === "AGENT_MEMORY_MISSING_RESOURCE_ID") {
              throw new NonRetriableError(error.message, { cause: error });
            }
          } else if (error instanceof z.ZodError) {
            throw new NonRetriableError(error.message, { cause: error });
          }

          throw error;
        }
      },
    ],
    apiRoutes: [
      // Health check endpoint - returns 200 immediately without database dependency
      {
        path: "/health",
        method: "GET",
        handler: async (c) => {
          return c.json({ status: "ok", timestamp: new Date().toISOString() });
        },
      },

      // Inngest Integration Endpoint
      {
        path: "/api/inngest",
        method: "ALL",
        createHandler: async ({ mastra }) => inngestServe({ mastra, inngest }),
      },

      // Serve the main HTML page
      {
        path: "/",
        method: "GET",
        handler: async (c) => {
          try {
            const { readFile } = await import("fs/promises");
            const { join, dirname } = await import("path");
            const { fileURLToPath } = await import("url");
            
            // Try multiple paths for production compatibility
            const possiblePaths = [
              "/home/runner/workspace/src/mastra/public/index.html",
              join(process.cwd(), "src/mastra/public/index.html"),
              join(process.cwd(), "public/index.html"),
            ];
            
            for (const htmlPath of possiblePaths) {
              try {
                const html = await readFile(htmlPath, "utf-8");
                return c.html(html);
              } catch {
                continue;
              }
            }
            
            // Fallback response if no file found
            return c.html(`<!DOCTYPE html>
<html><head><title>Ticket System</title></head>
<body><h1>Welcome to Ticket System</h1><p>Server is running.</p></body></html>`);
          } catch (error) {
            console.error("Error serving HTML:", error);
            return c.html(`<!DOCTYPE html>
<html><head><title>Ticket System</title></head>
<body><h1>Welcome</h1></body></html>`);
          }
        },
      },

      // API endpoint for fetching ticket data (events, categories, cities)
      {
        path: "/api/ticket-data",
        method: "GET",
        handler: async (c) => {
          const mastra = c.get("mastra");
          const logger = mastra?.getLogger();
          logger?.info("📝 [API] Fetching ticket data...");
          
          try {
            const result = await getEventsTool.execute({
              context: { includeCategories: true, includeCities: true },
              mastra,
              runtimeContext: {} as any,
            });
            
            logger?.info(`✅ [API] Returning ${result.events.length} events`);
            return c.json(result);
          } catch (error) {
            logger?.error("❌ [API] Error fetching ticket data:", error);
            return c.json({ error: "Failed to fetch data" }, 500);
          }
        },
      },

      // API endpoint for creating orders
      {
        path: "/api/create-order",
        method: "POST",
        handler: async (c) => {
          const mastra = c.get("mastra");
          const logger = mastra?.getLogger();
          
          try {
            const body = await c.req.json();
            logger?.info("📝 [API] Creating order:", body);
            
            // Input validation
            if (!body.eventId || typeof body.eventId !== "number") {
              return c.json({ success: false, message: "Не указано мероприятие" }, 400);
            }
            if (!body.customerName || typeof body.customerName !== "string" || body.customerName.trim().length < 2) {
              return c.json({ success: false, message: "Укажите ваше имя" }, 400);
            }
            if (!body.customerPhone || typeof body.customerPhone !== "string" || body.customerPhone.trim().length < 5) {
              return c.json({ success: false, message: "Укажите номер телефона" }, 400);
            }
            
            const seatsCount = parseInt(body.seatsCount);
            if (isNaN(seatsCount) || seatsCount < 1 || seatsCount > 10) {
              return c.json({ success: false, message: "Количество мест должно быть от 1 до 10" }, 400);
            }
            
            const result = await createOrderTool.execute({
              context: {
                eventId: body.eventId,
                customerName: body.customerName.trim(),
                customerPhone: body.customerPhone.trim(),
                customerEmail: body.customerEmail?.trim() || undefined,
                seatsCount: seatsCount,
                totalPrice: body.totalPrice ? parseInt(body.totalPrice) : undefined,
              },
              mastra,
              runtimeContext: {} as any,
            });
            
            logger?.info("✅ [API] Order result:", result);
            
            // Send notifications to admin and channel when order is created (user goes to payment page)
            if (result.success && result.orderId && result.orderCode) {
              const notificationData = {
                orderId: result.orderId,
                orderCode: result.orderCode,
                eventName: result.eventName || "Мероприятие",
                eventDate: result.eventDate || "",
                eventTime: result.eventTime || "",
                cityName: result.cityName || "",
                customerName: result.customerName || "",
                customerPhone: result.customerPhone || "",
                customerEmail: result.customerEmail,
                seatsCount: result.seatsCount || 1,
                totalPrice: result.totalPrice || 0,
              };
              
              try {
                // Send to both channel and admin in parallel
                await Promise.all([
                  sendChannelNotification(notificationData),
                  sendOrderNotificationToAdmin(notificationData)
                ]);
                logger?.info("📤 [API] Channel and admin notifications sent");
              } catch (notifyError) {
                logger?.error("⚠️ [API] Failed to send notifications:", notifyError);
                // Don't fail the order if notification fails
              }
            }
            
            return c.json(result);
          } catch (error) {
            logger?.error("❌ [API] Error creating order:", error);
            return c.json({ success: false, message: "Ошибка при создании заказа" }, 500);
          }
        },
      },

      // API endpoint for creating orders from generated links
      {
        path: "/api/create-link-order",
        method: "POST",
        handler: async (c) => {
          const mastra = c.get("mastra");
          const logger = mastra?.getLogger();
          
          try {
            const body = await c.req.json();
            logger?.info("📝 [API] Creating link order:", body);
            
            // Input validation
            if (!body.linkCode || typeof body.linkCode !== "string") {
              return c.json({ success: false, message: "Не указан код ссылки" }, 400);
            }
            if (!body.customerName || typeof body.customerName !== "string" || body.customerName.trim().length < 2) {
              return c.json({ success: false, message: "Укажите ваше имя" }, 400);
            }
            if (!body.customerPhone || typeof body.customerPhone !== "string" || body.customerPhone.trim().length < 5) {
              return c.json({ success: false, message: "Укажите номер телефона" }, 400);
            }
            
            const seatsCount = parseInt(body.seatsCount) || 1;
            if (seatsCount < 1 || seatsCount > 10) {
              return c.json({ success: false, message: "Количество мест должно быть от 1 до 10" }, 400);
            }
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            // Get generated link data
            const linkResult = await pool.query(`
              SELECT gl.*, et.name as event_name, et.description, et.category_id, et.id as template_id,
                     c.name as city_name, cat.name_ru as category_name,
                     eta.venue_address
              FROM generated_links gl
              JOIN event_templates et ON gl.event_template_id = et.id
              JOIN cities c ON gl.city_id = c.id
              JOIN categories cat ON et.category_id = cat.id
              LEFT JOIN event_template_addresses eta ON eta.event_template_id = et.id AND eta.city_id = gl.city_id
              WHERE gl.link_code = $1 AND gl.is_active = true
            `, [body.linkCode]);
            
            if (linkResult.rows.length === 0) {
              await pool.end();
              return c.json({ success: false, message: "Ссылка не найдена или неактивна" }, 400);
            }
            
            const link = linkResult.rows[0];
            const totalPrice = body.totalPrice || 2990 * seatsCount;
            
            // Generate order code
            const orderCode = `LNK-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
            
            // Create order (use event_template_id instead of event_id for generated links)
            const orderResult = await pool.query(
              `INSERT INTO orders (
                event_id, event_template_id, link_code, customer_name, customer_phone, customer_email, 
                seats_count, total_price, order_code, status, payment_status
              ) VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, 'pending', 'pending')
              RETURNING id`,
              [
                link.template_id,
                body.linkCode,
                body.customerName.trim(),
                body.customerPhone.trim(),
                body.customerEmail?.trim() || null,
                seatsCount,
                totalPrice,
                orderCode
              ]
            );
            
            await pool.end();
            
            logger?.info("✅ [API] Link order created:", orderCode);
            
            const notificationData = {
              orderId: orderResult.rows[0].id,
              orderCode: orderCode,
              eventName: link.event_name,
              eventDate: link.event_date?.toISOString?.()?.split("T")[0] || body.selectedDate || "",
              eventTime: link.event_time || body.selectedTime || "",
              cityName: link.city_name,
              customerName: body.customerName.trim(),
              customerPhone: body.customerPhone.trim(),
              customerEmail: body.customerEmail?.trim(),
              seatsCount: seatsCount,
              totalPrice: totalPrice,
            };
            
            try {
              await Promise.all([
                sendChannelNotification(notificationData),
                sendOrderNotificationToAdmin(notificationData)
              ]);
              logger?.info("📤 [API] Notifications sent for link order");
            } catch (notifyError) {
              logger?.error("⚠️ [API] Failed to send notifications:", notifyError);
            }
            
            return c.json({
              success: true,
              orderCode: orderCode,
              orderId: orderResult.rows[0].id,
              eventName: link.event_name,
              cityName: link.city_name,
              message: `Заказ ${orderCode} успешно создан!`
            });
          } catch (error) {
            logger?.error("❌ [API] Error creating link order:", error);
            return c.json({ success: false, message: "Ошибка при создании заказа" }, 500);
          }
        },
      },

      // Telegram webhook for admin callbacks (confirm/reject buttons)
      {
        path: "/webhooks/telegram/action",
        method: "POST",
        handler: async (c) => {
          const mastra = c.get("mastra");
          const logger = mastra?.getLogger();
          
          try {
            const payload = await c.req.json();
            logger?.info("📥 [TelegramWebhook] Received payload:", payload);
            
            // Handle callback queries (button presses)
            if (payload.callback_query) {
              const callbackQuery = payload.callback_query;
              const data = callbackQuery.data as string;
              const messageId = callbackQuery.message?.message_id;
              const chatId = callbackQuery.message?.chat?.id;
              const adminUsername = callbackQuery.from?.username;
              
              logger?.info("🔘 [TelegramWebhook] Callback:", { data, messageId, chatId });
              
              // Parse callback data: confirm_123 or reject_123
              const [action, orderIdStr] = data.split("_");
              const orderId = parseInt(orderIdStr);
              
              if (isNaN(orderId)) {
                await answerCallbackQuery(callbackQuery.id, "❌ Ошибка: неверный ID заказа");
                return c.text("OK", 200);
              }
              
              let result;
              if (action === "confirm") {
                result = await manageOrderTool.execute({
                  context: { action: "confirm_payment", orderId },
                  mastra,
                  runtimeContext: {} as any,
                });
              } else if (action === "reject") {
                result = await manageOrderTool.execute({
                  context: { action: "reject_payment", orderId },
                  mastra,
                  runtimeContext: {} as any,
                });
              } else {
                await answerCallbackQuery(callbackQuery.id, "❌ Неизвестное действие");
                return c.text("OK", 200);
              }
              
              if (result.success && result.order) {
                const status = action === "confirm" ? "confirmed" : "rejected";
                await updateOrderMessageStatus(
                  chatId,
                  messageId,
                  result.order.orderCode,
                  status,
                  adminUsername
                );
                await answerCallbackQuery(
                  callbackQuery.id, 
                  action === "confirm" ? "✅ Оплата подтверждена!" : "❌ Заказ отклонён"
                );
                
                // Send channel notification for confirm/reject
                const { sendChannelPaymentConfirmed, sendChannelPaymentRejected } = await import("./services/telegramAdminService");
                const channelData = {
                  orderId: result.order.id,
                  orderCode: result.order.orderCode,
                  eventName: result.order.eventName,
                  eventDate: result.order.eventDate || "",
                  eventTime: result.order.eventTime || "",
                  cityName: result.order.cityName || "Москва",
                  customerName: result.order.customerName,
                  customerPhone: result.order.customerPhone,
                  seatsCount: result.order.seatsCount,
                  totalPrice: result.order.totalPrice
                };
                
                if (action === "confirm") {
                  await sendChannelPaymentConfirmed(channelData);
                } else {
                  await sendChannelPaymentRejected(channelData);
                }
              } else {
                await answerCallbackQuery(callbackQuery.id, result.message || "❌ Ошибка");
              }
              
              return c.text("OK", 200);
            }
            
            // For regular messages, just acknowledge (admin bot doesn't need to respond)
            return c.text("OK", 200);
          } catch (error) {
            logger?.error("❌ [TelegramWebhook] Error:", error);
            return c.text("OK", 200);
          }
        },
      },

      // Admin panel page - redirect to admin-events
      {
        path: "/admin",
        method: "GET",
        handler: async (c) => {
          return c.redirect("/admin-events");
        },
      },

      // Public event page
      {
        path: "/event/:id",
        method: "GET",
        handler: async (c) => {
          const { readFile } = await import("fs/promises");
          try {
            const htmlPath = "/home/runner/workspace/src/mastra/public/event.html";
            const html = await readFile(htmlPath, "utf-8");
            return c.html(html);
          } catch (error) {
            return c.text("Page not found", 404);
          }
        },
      },

      // Booking page
      {
        path: "/booking/:id",
        method: "GET",
        handler: async (c) => {
          const { readFile } = await import("fs/promises");
          try {
            const htmlPath = "/home/runner/workspace/src/mastra/public/booking.html";
            const html = await readFile(htmlPath, "utf-8");
            return c.html(html);
          } catch (error) {
            return c.text("Page not found", 404);
          }
        },
      },

      // API to get single event details
      {
        path: "/api/event/:id",
        method: "GET",
        handler: async (c) => {
          const mastra = c.get("mastra");
          const logger = mastra?.getLogger();
          const eventId = parseInt(c.req.param("id"));
          
          if (isNaN(eventId)) {
            return c.json({ error: "Invalid event ID" }, 400);
          }

          try {
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            const result = await pool.query(
              `SELECT e.*, c.name_ru as category_name, ci.name as city_name 
               FROM events e 
               JOIN categories c ON e.category_id = c.id 
               JOIN cities ci ON e.city_id = ci.id 
               WHERE e.id = $1`,
              [eventId]
            );
            await pool.end();

            if (result.rows.length === 0) {
              return c.json({ error: "Event not found" }, 404);
            }

            const event = result.rows[0];
            return c.json({
              id: event.id,
              name: event.name,
              description: event.description,
              categoryName: event.category_name,
              cityName: event.city_name,
              date: event.date?.toISOString?.()?.split("T")[0] || event.date,
              time: event.time,
              price: parseFloat(event.price) || 0,
              availableSeats: event.available_seats,
              coverImageUrl: event.cover_image_url,
              slug: event.slug,
            });
          } catch (error) {
            logger?.error("❌ [API] Error fetching event:", error);
            return c.json({ error: "Failed to fetch event" }, 500);
          }
        },
      },

      // Admin API: Verify password
      {
        path: "/api/admin/verify",
        method: "POST",
        handler: async (c) => {
          const body = await c.req.json();
          const adminPassword = process.env.ADMIN_PASSWORD || "admin2024secure";
          if (body.password === adminPassword) {
            return c.json({ success: true });
          }
          return c.json({ success: false, message: "Неверный пароль" }, 401);
        },
      },

      // Admin API: Create event
      {
        path: "/api/admin/events",
        method: "POST",
        handler: async (c) => {
          const mastra = c.get("mastra");
          const logger = mastra?.getLogger();

          // Check admin auth header
          const authPassword = c.req.header("X-Admin-Password");
          const adminPassword = process.env.ADMIN_PASSWORD || "admin2024secure";
          if (authPassword !== adminPassword) {
            return c.json({ success: false, message: "Unauthorized" }, 401);
          }

          try {
            const body = await c.req.json();
            logger?.info("📝 [Admin API] Creating event:", body);

            const slug = body.name.toLowerCase()
              .replace(/[^\w\sа-яё-]/gi, '')
              .replace(/\s+/g, '-')
              .replace(/--+/g, '-');

            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            const result = await pool.query(
              `INSERT INTO events (name, description, category_id, city_id, date, time, price, available_seats, cover_image_url, slug, is_published)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
               RETURNING id`,
              [body.name, body.description, body.categoryId, body.cityId, body.date, body.time, body.price, body.availableSeats, body.coverImageUrl, slug]
            );
            await pool.end();

            logger?.info("✅ [Admin API] Event created:", result.rows[0].id);
            return c.json({ success: true, eventId: result.rows[0].id, slug });
          } catch (error) {
            logger?.error("❌ [Admin API] Error creating event:", error);
            return c.json({ success: false, message: "Ошибка создания мероприятия" }, 500);
          }
        },
      },

      // Admin API: Update event
      {
        path: "/api/admin/events/:id",
        method: "PUT",
        handler: async (c) => {
          const mastra = c.get("mastra");
          const logger = mastra?.getLogger();
          const eventId = parseInt(c.req.param("id"));

          // Check admin auth header
          const authPassword = c.req.header("X-Admin-Password");
          const adminPassword = process.env.ADMIN_PASSWORD || "admin2024secure";
          if (authPassword !== adminPassword) {
            return c.json({ success: false, message: "Unauthorized" }, 401);
          }

          try {
            const body = await c.req.json();
            logger?.info("📝 [Admin API] Updating event:", eventId, body);

            const slug = body.name.toLowerCase()
              .replace(/[^\w\sа-яё-]/gi, '')
              .replace(/\s+/g, '-')
              .replace(/--+/g, '-');

            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            await pool.query(
              `UPDATE events SET name=$1, description=$2, category_id=$3, city_id=$4, date=$5, time=$6, price=$7, available_seats=$8, cover_image_url=$9, slug=$10
               WHERE id=$11`,
              [body.name, body.description, body.categoryId, body.cityId, body.date, body.time, body.price, body.availableSeats, body.coverImageUrl, slug, eventId]
            );
            await pool.end();

            logger?.info("✅ [Admin API] Event updated:", eventId);
            return c.json({ success: true });
          } catch (error) {
            logger?.error("❌ [Admin API] Error updating event:", error);
            return c.json({ success: false, message: "Ошибка обновления мероприятия" }, 500);
          }
        },
      },

      // Admin API: Delete event
      {
        path: "/api/admin/events/:id",
        method: "DELETE",
        handler: async (c) => {
          const mastra = c.get("mastra");
          const logger = mastra?.getLogger();
          const eventId = parseInt(c.req.param("id"));

          // Check admin auth header
          const authPassword = c.req.header("X-Admin-Password");
          const adminPassword = process.env.ADMIN_PASSWORD || "admin2024secure";
          if (authPassword !== adminPassword) {
            return c.json({ success: false, message: "Unauthorized" }, 401);
          }

          try {
            logger?.info("📝 [Admin API] Deleting event:", eventId);

            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            await pool.query("DELETE FROM events WHERE id=$1", [eventId]);
            await pool.end();

            logger?.info("✅ [Admin API] Event deleted:", eventId);
            return c.json({ success: true });
          } catch (error) {
            logger?.error("❌ [Admin API] Error deleting event:", error);
            return c.json({ success: false, message: "Ошибка удаления мероприятия" }, 500);
          }
        },
      },

      // Payment Settings API: Get settings
      {
        path: "/api/payment-settings",
        method: "GET",
        handler: async (c) => {
          try {
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            const result = await pool.query("SELECT * FROM payment_settings ORDER BY id DESC LIMIT 1");
            await pool.end();
            
            if (result.rows.length === 0) {
              return c.json({ cardNumber: "", cardHolderName: "", bankName: "", sbpEnabled: true });
            }
            
            const row = result.rows[0];
            return c.json({
              cardNumber: row.card_number,
              cardHolderName: row.card_holder_name,
              bankName: row.bank_name,
              sbpEnabled: row.sbp_enabled !== false
            });
          } catch (error) {
            return c.json({ cardNumber: "", cardHolderName: "", bankName: "", sbpEnabled: true });
          }
        },
      },

      // Payment Settings API: Update settings (admin only)
      {
        path: "/api/admin/payment-settings",
        method: "POST",
        handler: async (c) => {
          const authPassword = c.req.header("X-Admin-Password");
          const adminPassword = process.env.ADMIN_PASSWORD || "admin2024secure";
          if (authPassword !== adminPassword) {
            return c.json({ success: false, message: "Unauthorized" }, 401);
          }

          try {
            const body = await c.req.json();
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            await pool.query(
              `UPDATE payment_settings SET card_number=$1, card_holder_name=$2, bank_name=$3, sbp_enabled=$4, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
              [body.cardNumber, body.cardHolderName, body.bankName, body.sbpEnabled !== false]
            );
            await pool.end();
            
            return c.json({ success: true });
          } catch (error) {
            return c.json({ success: false, message: "Ошибка сохранения" }, 500);
          }
        },
      },

      // Cities API: Add city (admin only)
      {
        path: "/api/admin/cities",
        method: "POST",
        handler: async (c) => {
          const authPassword = c.req.header("X-Admin-Password");
          const adminPassword = process.env.ADMIN_PASSWORD || "admin2024secure";
          if (authPassword !== adminPassword) {
            return c.json({ success: false, message: "Unauthorized" }, 401);
          }

          try {
            const body = await c.req.json();
            if (!body.name || body.name.trim().length < 2) {
              return c.json({ success: false, message: "Название города должно быть не менее 2 символов" }, 400);
            }
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            // Check if city already exists
            const existing = await pool.query("SELECT id FROM cities WHERE name = $1", [body.name.trim()]);
            if (existing.rows.length > 0) {
              await pool.end();
              return c.json({ success: false, message: "Город уже существует" }, 400);
            }
            
            await pool.query("INSERT INTO cities (name) VALUES ($1)", [body.name.trim()]);
            await pool.end();
            
            return c.json({ success: true });
          } catch (error) {
            console.error("Error adding city:", error);
            return c.json({ success: false, message: "Ошибка добавления города" }, 500);
          }
        },
      },
      
      // Cities API: Delete city (admin only)
      {
        path: "/api/admin/cities/:id",
        method: "DELETE",
        handler: async (c) => {
          const authPassword = c.req.header("X-Admin-Password");
          const adminPassword = process.env.ADMIN_PASSWORD || "admin2024secure";
          if (authPassword !== adminPassword) {
            return c.json({ success: false, message: "Unauthorized" }, 401);
          }

          try {
            const cityId = parseInt(c.req.param("id"));
            if (isNaN(cityId)) {
              return c.json({ success: false, message: "Неверный ID города" }, 400);
            }
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            // Delete related generated links first
            await pool.query("DELETE FROM generated_links WHERE city_id = $1", [cityId]);
            
            // Delete city addresses
            await pool.query("DELETE FROM event_template_addresses WHERE city_id = $1", [cityId]);
            
            // Delete city
            await pool.query("DELETE FROM cities WHERE id = $1", [cityId]);
            
            await pool.end();
            
            return c.json({ success: true });
          } catch (error) {
            console.error("Error deleting city:", error);
            return c.json({ success: false, message: "Ошибка удаления города" }, 500);
          }
        },
      },

      // Order API: Get order by code (supports both regular orders and generated link orders)
      {
        path: "/api/order/:code",
        method: "GET",
        handler: async (c) => {
          const orderCode = c.req.param("code");
          try {
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            // First try to find order with event_id (regular orders)
            let result = await pool.query(
              `SELECT o.*, e.name as event_name, e.price 
               FROM orders o 
               JOIN events e ON o.event_id = e.id 
               WHERE o.order_code = $1`,
              [orderCode]
            );
            
            // If not found, try to find order with event_template_id (generated link orders)
            if (result.rows.length === 0) {
              result = await pool.query(
                `SELECT o.*, et.name as event_name, 2990 as price 
                 FROM orders o 
                 JOIN event_templates et ON o.event_template_id = et.id 
                 WHERE o.order_code = $1`,
                [orderCode]
              );
            }
            
            await pool.end();
            
            if (result.rows.length === 0) {
              return c.json({ error: "Order not found" }, 404);
            }
            
            const order = result.rows[0];
            return c.json({
              id: order.id,
              orderCode: order.order_code,
              eventName: order.event_name,
              customerName: order.customer_name,
              seatsCount: order.seats_count,
              totalPrice: parseFloat(order.total_price) || order.seats_count * parseFloat(order.price),
              status: order.status
            });
          } catch (error) {
            return c.json({ error: "Failed to fetch order" }, 500);
          }
        },
      },

      // Ticket API: Get ticket data by order code (for confirmed orders)
      {
        path: "/api/ticket/:orderCode",
        method: "GET",
        handler: async (c) => {
          const orderCode = c.req.param("orderCode");
          try {
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            // First try generated link orders (event_template_id based)
            let result = await pool.query(`
              SELECT o.*, 
                     et.name as event_name, et.ticket_image_url, et.image_url,
                     gl.event_date, gl.event_time, gl.city_id,
                     c.name as city_name
              FROM orders o
              JOIN event_templates et ON o.event_template_id = et.id
              LEFT JOIN generated_links gl ON o.link_code = gl.link_code
              LEFT JOIN cities c ON gl.city_id = c.id
              WHERE o.order_code = $1 AND o.event_template_id IS NOT NULL
            `, [orderCode]);
            
            // Try regular events if not found (event_id based orders)
            if (result.rows.length === 0) {
              result = await pool.query(`
                SELECT o.*, e.name as event_name, e.date as event_date, e.time as event_time,
                       NULL as ticket_image_url, e.image_url as image_url,
                       ci.name as city_name
                FROM orders o
                JOIN events e ON o.event_id = e.id
                LEFT JOIN cities ci ON e.city_id = ci.id
                WHERE o.order_code = $1
              `, [orderCode]);
            }
            
            await pool.end();
            
            if (result.rows.length === 0) {
              return c.json({ success: false, message: "Order not found" }, 404);
            }
            
            const order = result.rows[0];
            
            // Check if payment is confirmed
            if (order.payment_status !== 'confirmed') {
              return c.json({ success: true, pending: true, message: "Payment pending confirmation" });
            }
            
            return c.json({
              success: true,
              ticket: {
                order_code: order.order_code,
                event_name: order.event_name || 'Мероприятие',
                event_date: order.event_date,
                event_time: order.event_time,
                city_name: order.city_name || 'Москва',
                customer_name: order.customer_name,
                total_price: order.total_price,
                ticket_image_url: order.ticket_image_url,
                image_url: order.image_url
              }
            });
          } catch (error) {
            console.error("Error fetching ticket:", error);
            return c.json({ success: false, message: "Error fetching ticket" }, 500);
          }
        },
      },

      // Ticket page
      {
        path: "/ticket",
        method: "GET",
        handler: async (c) => {
          const fs = await import("fs");
          const html = fs.readFileSync("/home/runner/workspace/src/mastra/public/ticket.html", "utf-8");
          return c.html(html);
        },
      },

      // Payment page
      {
        path: "/payment",
        method: "GET",
        handler: async (c) => {
          const fs = await import("fs");
          const html = fs.readFileSync("/home/runner/workspace/src/mastra/public/payment.html", "utf-8");
          return c.html(html);
        },
      },

      // Event page by template ID
      {
        path: "/event/:id",
        method: "GET",
        handler: async (c) => {
          const fs = await import("fs");
          const html = fs.readFileSync("/home/runner/workspace/src/mastra/public/event.html", "utf-8");
          return c.html(html);
        },
      },

      // Event page by generated link code
      {
        path: "/e/:code",
        method: "GET",
        handler: async (c) => {
          const fs = await import("fs");
          const html = fs.readFileSync("/home/runner/workspace/src/mastra/public/event.html", "utf-8");
          return c.html(html);
        },
      },

      // Generator page
      {
        path: "/generator",
        method: "GET",
        handler: async (c) => {
          const fs = await import("fs");
          const html = fs.readFileSync("/home/runner/workspace/src/mastra/public/generator.html", "utf-8");
          return c.html(html);
        },
      },
      
      // Admin Events page
      {
        path: "/admin-events",
        method: "GET",
        handler: async (c) => {
          const fs = await import("fs");
          const html = fs.readFileSync("/home/runner/workspace/src/mastra/public/admin-events.html", "utf-8");
          return c.html(html);
        },
      },

      // Admin Register
      {
        path: "/api/admin/register",
        method: "POST",
        handler: async (c) => {
          try {
            const body = await c.req.json();
            const { username, displayName, password } = body;
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            const existing = await pool.query("SELECT id FROM admins WHERE username=$1", [username]);
            if (existing.rows.length > 0) {
              await pool.end();
              return c.json({ success: false, message: "Логин уже занят" });
            }
            
            const result = await pool.query(
              "INSERT INTO admins (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, username, display_name",
              [username, password, displayName]
            );
            await pool.end();
            
            const admin = result.rows[0];
            const token = `${admin.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            
            return c.json({
              success: true,
              token,
              admin: { id: admin.id, username: admin.username, displayName: admin.display_name }
            });
          } catch (error) {
            console.error("Register error:", error);
            return c.json({ success: false, message: "Ошибка регистрации" }, 500);
          }
        },
      },

      // Admin Login
      {
        path: "/api/admin/login",
        method: "POST",
        handler: async (c) => {
          try {
            const body = await c.req.json();
            const { username, password } = body;
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            const result = await pool.query(
              "SELECT id, username, display_name, password_hash FROM admins WHERE username=$1",
              [username]
            );
            await pool.end();
            
            if (result.rows.length === 0 || result.rows[0].password_hash !== password) {
              return c.json({ success: false, message: "Неверный логин или пароль" });
            }
            
            const admin = result.rows[0];
            const token = `${admin.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            
            return c.json({
              success: true,
              token,
              admin: { id: admin.id, username: admin.username, displayName: admin.display_name }
            });
          } catch (error) {
            console.error("Login error:", error);
            return c.json({ success: false, message: "Ошибка входа" }, 500);
          }
        },
      },

      // Generate Event (multi-admin)
      {
        path: "/api/admin/generate-event",
        method: "POST",
        handler: async (c) => {
          try {
            const authHeader = c.req.header("Authorization");
            if (!authHeader?.startsWith("Bearer ")) {
              return c.json({ success: false, message: "Unauthorized" }, 401);
            }
            
            const token = authHeader.split(" ")[1];
            const adminId = parseInt(token.split("_")[0]);
            if (!adminId) {
              return c.json({ success: false, message: "Invalid token" }, 401);
            }
            
            const body = await c.req.json();
            const slug = `${body.name.toLowerCase()
              .replace(/[^\w\sа-яё-]/gi, '')
              .replace(/\s+/g, '-')
              .replace(/--+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            await pool.query(
              `INSERT INTO events (name, description, category_id, city_id, date, time, price, available_seats, cover_image_url, slug, is_published, admin_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)`,
              [body.name, body.description, body.categoryId, body.cityId, body.date, body.time, body.price, body.availableSeats, body.coverImageUrl, slug, adminId]
            );
            await pool.end();
            
            return c.json({ success: true, slug });
          } catch (error) {
            console.error("Generate event error:", error);
            return c.json({ success: false, message: "Ошибка генерации" }, 500);
          }
        },
      },

      // My Events (admin-specific)
      {
        path: "/api/admin/my-events",
        method: "GET",
        handler: async (c) => {
          try {
            const authHeader = c.req.header("Authorization");
            if (!authHeader?.startsWith("Bearer ")) {
              return c.json({ events: [] });
            }
            
            const token = authHeader.split(" ")[1];
            const adminId = parseInt(token.split("_")[0]);
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            const result = await pool.query(
              `SELECT e.*, c.name as city_name, cat.name_ru as category_name
               FROM events e
               LEFT JOIN cities c ON e.city_id = c.id
               LEFT JOIN categories cat ON e.category_id = cat.id
               WHERE e.admin_id = $1
               ORDER BY e.created_at DESC`,
              [adminId]
            );
            await pool.end();
            
            const events = result.rows.map(e => ({
              id: e.id,
              name: e.name,
              slug: e.slug,
              cityName: e.city_name,
              categoryName: e.category_name,
              date: e.date?.toISOString?.()?.split("T")[0] || e.date,
              time: e.time,
              price: parseFloat(e.price) || 0,
              availableSeats: e.available_seats
            }));
            
            return c.json({ events });
          } catch (error) {
            console.error("My events error:", error);
            return c.json({ events: [] });
          }
        },
      },

      // My Payment Settings (get)
      {
        path: "/api/admin/my-payment-settings",
        method: "GET",
        handler: async (c) => {
          try {
            const authHeader = c.req.header("Authorization");
            if (!authHeader?.startsWith("Bearer ")) {
              return c.json({ cardNumber: "", cardHolderName: "", bankName: "" });
            }
            
            const token = authHeader.split(" ")[1];
            const adminId = parseInt(token.split("_")[0]);
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            const result = await pool.query(
              "SELECT * FROM admin_payment_settings WHERE admin_id=$1",
              [adminId]
            );
            await pool.end();
            
            if (result.rows.length === 0) {
              return c.json({ cardNumber: "", cardHolderName: "", bankName: "" });
            }
            
            const row = result.rows[0];
            return c.json({
              cardNumber: row.card_number,
              cardHolderName: row.card_holder_name,
              bankName: row.bank_name
            });
          } catch (error) {
            return c.json({ cardNumber: "", cardHolderName: "", bankName: "" });
          }
        },
      },

      // My Payment Settings (save)
      {
        path: "/api/admin/my-payment-settings",
        method: "POST",
        handler: async (c) => {
          try {
            const authHeader = c.req.header("Authorization");
            if (!authHeader?.startsWith("Bearer ")) {
              return c.json({ success: false, message: "Unauthorized" }, 401);
            }
            
            const token = authHeader.split(" ")[1];
            const adminId = parseInt(token.split("_")[0]);
            
            const body = await c.req.json();
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            await pool.query(
              `INSERT INTO admin_payment_settings (admin_id, card_number, card_holder_name, bank_name)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (admin_id) DO UPDATE SET
               card_number = $2, card_holder_name = $3, bank_name = $4, updated_at = CURRENT_TIMESTAMP`,
              [adminId, body.cardNumber, body.cardHolderName, body.bankName]
            );
            await pool.end();
            
            return c.json({ success: true });
          } catch (error) {
            console.error("Save payment settings error:", error);
            return c.json({ success: false, message: "Ошибка сохранения" }, 500);
          }
        },
      },

      // Public event page by slug
      {
        path: "/e/:slug",
        method: "GET",
        handler: async (c) => {
          const fs = await import("fs");
          const html = fs.readFileSync("/home/runner/workspace/src/mastra/public/ticket.html", "utf-8");
          return c.html(html);
        },
      },

      // API: Get event by slug
      {
        path: "/api/e/:slug",
        method: "GET",
        handler: async (c) => {
          const slug = c.req.param("slug");
          try {
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            const result = await pool.query(
              `SELECT e.*, c.name as city_name, cat.name_ru as category_name
               FROM events e
               LEFT JOIN cities c ON e.city_id = c.id
               LEFT JOIN categories cat ON e.category_id = cat.id
               WHERE e.slug = $1 AND e.is_published = true`,
              [slug]
            );
            await pool.end();
            
            if (result.rows.length === 0) {
              return c.json({ error: "Event not found" }, 404);
            }
            
            const e = result.rows[0];
            return c.json({
              id: e.id,
              adminId: e.admin_id,
              name: e.name,
              description: e.description,
              categoryName: e.category_name,
              cityName: e.city_name,
              date: e.date?.toISOString?.()?.split("T")[0] || e.date,
              time: e.time,
              price: parseFloat(e.price) || 0,
              availableSeats: e.available_seats,
              coverImageUrl: e.cover_image_url,
              slug: e.slug
            });
          } catch (error) {
            console.error("Get event error:", error);
            return c.json({ error: "Failed to fetch event" }, 500);
          }
        },
      },

      // Create ticket order - sends notification to admin immediately
      {
        path: "/api/create-ticket-order",
        method: "POST",
        handler: async (c) => {
          try {
            const body = await c.req.json();
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            const eventResult = await pool.query(
              `SELECT e.id, e.price, e.available_seats, e.admin_id, e.name, e.date, e.time, c.name as city_name
               FROM events e
               LEFT JOIN cities c ON e.city_id = c.id
               WHERE e.slug=$1`,
              [body.eventSlug]
            );
            
            if (eventResult.rows.length === 0) {
              await pool.end();
              return c.json({ success: false, message: "Мероприятие не найдено" });
            }
            
            const event = eventResult.rows[0];
            if (event.available_seats < body.seatsCount) {
              await pool.end();
              return c.json({ success: false, message: "Недостаточно мест" });
            }
            
            const orderCode = `TK${Date.now().toString(36).toUpperCase()}`;
            const totalPrice = parseFloat(event.price) * body.seatsCount;
            
            const orderResult = await pool.query(
              `INSERT INTO orders (event_id, admin_id, customer_name, customer_phone, customer_email, seats_count, total_price, order_code, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
               RETURNING id`,
              [event.id, event.admin_id, body.customerName, body.customerPhone, body.customerEmail, body.seatsCount, totalPrice, orderCode]
            );
            
            await pool.query(
              "UPDATE events SET available_seats = available_seats - $1 WHERE id = $2",
              [body.seatsCount, event.id]
            );
            
            await pool.end();
            
            // Send notifications to channel and admin when customer reaches payment page
            const notificationData = {
              orderId: orderResult.rows[0].id,
              orderCode: orderCode,
              eventName: event.name,
              eventDate: event.date?.toISOString?.()?.split("T")[0] || String(event.date),
              eventTime: event.time || "",
              cityName: event.city_name || "",
              customerName: body.customerName,
              customerPhone: body.customerPhone,
              customerEmail: body.customerEmail,
              seatsCount: body.seatsCount,
              totalPrice: totalPrice
            };
            
            try {
              await Promise.all([
                sendChannelNotification(notificationData),
                sendOrderNotificationToAdmin(notificationData)
              ]);
              console.log("📤 [API] Channel and admin notifications sent for:", orderCode);
            } catch (notifyError) {
              console.error("⚠️ [API] Failed to send notifications:", notifyError);
            }
            
            return c.json({ success: true, orderCode });
          } catch (error) {
            console.error("Create order error:", error);
            return c.json({ success: false, message: "Ошибка создания заказа" }, 500);
          }
        },
      },

      // Get ticket order by code
      {
        path: "/api/ticket-order/:code",
        method: "GET",
        handler: async (c) => {
          const orderCode = c.req.param("code");
          try {
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            // First try regular orders (with event_id)
            let result = await pool.query(
              `SELECT o.*, e.name as event_name, e.date, e.time, e.price
               FROM orders o
               JOIN events e ON o.event_id = e.id
               WHERE o.order_code = $1`,
              [orderCode]
            );
            
            // If not found, try generated link orders (with event_template_id)
            if (result.rows.length === 0) {
              result = await pool.query(
                `SELECT o.*, et.name as event_name, gl.event_date as date, gl.event_time as time, 2990 as price
                 FROM orders o
                 JOIN event_templates et ON o.event_template_id = et.id
                 LEFT JOIN generated_links gl ON gl.link_code = o.link_code
                 WHERE o.order_code = $1`,
                [orderCode]
              );
            }
            
            await pool.end();
            
            if (result.rows.length === 0) {
              return c.json({ error: "Order not found" }, 404);
            }
            
            const o = result.rows[0];
            return c.json({
              id: o.id,
              orderCode: o.order_code,
              eventName: o.event_name,
              customerName: o.customer_name,
              seatsCount: o.seats_count,
              totalPrice: parseFloat(o.total_price),
              status: o.status,
              eventDate: o.date,
              eventTime: o.time
            });
          } catch (error) {
            return c.json({ error: "Failed to fetch order" }, 500);
          }
        },
      },

      // Get payment settings for order
      {
        path: "/api/ticket-order/:code/payment-settings",
        method: "GET",
        handler: async (c) => {
          const orderCode = c.req.param("code");
          try {
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            // Check if this is a generated link order
            const orderCheck = await pool.query(
              "SELECT event_template_id FROM orders WHERE order_code = $1",
              [orderCode]
            );
            
            let result;
            if (orderCheck.rows.length > 0 && orderCheck.rows[0].event_template_id) {
              // Generated link order - use global payment_settings
              result = await pool.query("SELECT * FROM payment_settings ORDER BY id DESC LIMIT 1");
            } else {
              // Regular order - use admin_payment_settings
              result = await pool.query(
                `SELECT aps.* FROM admin_payment_settings aps
                 JOIN orders o ON o.admin_id = aps.admin_id
                 WHERE o.order_code = $1`,
                [orderCode]
              );
            }
            await pool.end();
            
            if (result.rows.length === 0) {
              return c.json({ cardNumber: "", cardHolderName: "", bankName: "" });
            }
            
            const row = result.rows[0];
            return c.json({
              cardNumber: row.card_number,
              cardHolderName: row.card_holder_name,
              bankName: row.bank_name
            });
          } catch (error) {
            return c.json({ cardNumber: "", cardHolderName: "", bankName: "" });
          }
        },
      },

      // Mark order as paid (waiting confirmation) - sends notifications with screenshot to admin
      {
        path: "/api/ticket-order/:code/mark-paid",
        method: "POST",
        handler: async (c) => {
          const orderCode = c.req.param("code");
          try {
            const body = await c.req.json().catch(() => ({}));
            const screenshot = body.screenshot || null;
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            // First try regular orders (with event_id)
            let orderResult = await pool.query(
              `SELECT o.*, e.name as event_name, e.date as event_date, e.time as event_time, 
               ci.name as city_name
               FROM orders o
               JOIN events e ON o.event_id = e.id
               JOIN cities ci ON e.city_id = ci.id
               WHERE o.order_code = $1`,
              [orderCode]
            );
            
            // If not found, try generated link orders
            if (orderResult.rows.length === 0) {
              orderResult = await pool.query(
                `SELECT o.*, et.name as event_name, gl.event_date, gl.event_time, c.name as city_name
                 FROM orders o
                 JOIN event_templates et ON o.event_template_id = et.id
                 LEFT JOIN generated_links gl ON gl.link_code = o.link_code
                 LEFT JOIN cities c ON gl.city_id = c.id
                 WHERE o.order_code = $1`,
                [orderCode]
              );
            }
            
            if (orderResult.rows.length === 0) {
              await pool.end();
              return c.json({ success: false, message: "Заказ не найден" }, 404);
            }
            
            const order = orderResult.rows[0];
            
            // Update order status
            await pool.query(
              "UPDATE orders SET status='waiting_confirmation' WHERE order_code=$1",
              [orderCode]
            );
            
            await pool.end();
            console.log("📝 [API] Order marked as waiting confirmation:", orderCode);
            
            // Send notification to admin with screenshot and channel notification
            const { sendPaymentConfirmationWithPhoto, sendPaymentConfirmationNoPhoto, sendChannelPaymentPending } = await import("./services/telegramAdminService");
            
            const notificationData = {
              orderId: order.id,
              orderCode: order.order_code,
              eventName: order.event_name,
              eventDate: order.event_date?.toISOString?.()?.split("T")[0] || String(order.event_date),
              eventTime: order.event_time || "00:00",
              cityName: order.city_name || "Москва",
              customerName: order.customer_name,
              customerPhone: order.customer_phone,
              customerEmail: order.customer_email,
              seatsCount: order.seats_count,
              totalPrice: parseFloat(order.total_price)
            };
            
            try {
              // Send to channel when user clicks "я оплатил"
              await sendChannelPaymentPending(notificationData);
              
              if (screenshot) {
                await sendPaymentConfirmationWithPhoto(notificationData, screenshot);
              } else {
                await sendPaymentConfirmationNoPhoto(notificationData);
              }
            } catch (notifyError) {
              console.error("⚠️ [API] Failed to send payment notification:", notifyError);
            }
            
            return c.json({ success: true });
          } catch (error) {
            console.error("Mark paid error:", error);
            return c.json({ success: false, message: "Ошибка" }, 500);
          }
        },
      },

      // Pay page
      {
        path: "/pay",
        method: "GET",
        handler: async (c) => {
          const fs = await import("fs");
          const html = fs.readFileSync("/home/runner/workspace/src/mastra/public/pay.html", "utf-8");
          return c.html(html);
        },
      },

      // Generator page
      {
        path: "/generator",
        method: "GET",
        handler: async (c) => {
          const fs = await import("fs");
          const html = fs.readFileSync("/home/runner/workspace/src/mastra/public/generator.html", "utf-8");
          return c.html(html);
        },
      },

      // Generator API - Get categories
      {
        path: "/api/generator/categories",
        method: "GET",
        handler: async (c) => {
          try {
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            const result = await pool.query(
              "SELECT id, name, name_ru FROM categories WHERE id IN (6,7,8,9,10,11,12,13) ORDER BY id"
            );
            await pool.end();
            return c.json({ categories: result.rows });
          } catch (error) {
            console.error("Error fetching categories:", error);
            return c.json({ categories: [] });
          }
        },
      },

      // Generator API - Get cities
      {
        path: "/api/generator/cities",
        method: "GET",
        handler: async (c) => {
          try {
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            const result = await pool.query("SELECT id, name FROM cities ORDER BY name");
            await pool.end();
            return c.json({ cities: result.rows });
          } catch (error) {
            console.error("Error fetching cities:", error);
            return c.json({ cities: [] });
          }
        },
      },

      // Generator API - Get event templates by category
      {
        path: "/api/generator/event-templates",
        method: "GET",
        handler: async (c) => {
          try {
            const categoryId = c.req.query("category_id");
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            const result = await pool.query(
              "SELECT id, name, description, is_active, ticket_image_url FROM event_templates WHERE category_id = $1 ORDER BY name",
              [categoryId]
            );
            
            // Get first image for each template from images table
            const templates = [];
            for (const row of result.rows) {
              const imgRes = await pool.query(
                "SELECT image_url FROM event_template_images WHERE event_template_id = $1 ORDER BY sort_order LIMIT 1",
                [row.id]
              );
              templates.push({
                id: row.id,
                name: row.name,
                description: row.description,
                is_active: row.is_active,
                image_url: imgRes.rows[0]?.image_url || null,
                ticket_image_url: row.ticket_image_url
              });
            }
            
            await pool.end();
            return c.json({ templates });
          } catch (error) {
            console.error("Error fetching event templates:", error);
            return c.json({ templates: [] });
          }
        },
      },
      
      // Generator API - Get single event template by ID
      {
        path: "/api/generator/event-templates/:id",
        method: "GET",
        handler: async (c) => {
          try {
            const eventId = c.req.param("id");
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            const result = await pool.query(
              `SELECT et.*, cat.name_ru as category_name 
               FROM event_templates et 
               JOIN categories cat ON et.category_id = cat.id 
               WHERE et.id = $1`,
              [eventId]
            );
            
            if (result.rows.length === 0) {
              await pool.end();
              return c.json({ error: "Template not found" }, 404);
            }
            
            // Get images for this template
            const imagesResult = await pool.query(
              "SELECT image_url FROM event_template_images WHERE event_template_id = $1 ORDER BY sort_order LIMIT 5",
              [eventId]
            );
            const images = imagesResult.rows.map(r => r.image_url);
            
            await pool.end();
            
            const template = result.rows[0];
            return c.json({
              id: template.id,
              name: template.name,
              description: template.description,
              images: images,
              imageUrl: images[0] || template.image_url,
              categoryName: template.category_name,
              isActive: template.is_active
            });
          } catch (error) {
            console.error("Error fetching event template:", error);
            return c.json({ error: "Failed to fetch template" }, 500);
          }
        },
      },
      
      // Generator API - Update event template
      {
        path: "/api/generator/event-templates/:id/update",
        method: "PUT",
        handler: async (c) => {
          try {
            const eventId = c.req.param("id");
            const body = await c.req.json();
            const { name, description, image_url, ticket_image_url } = body;
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            await pool.query(
              "UPDATE event_templates SET name = $1, description = $2, image_url = $3, ticket_image_url = $4 WHERE id = $5",
              [name, description, image_url, ticket_image_url || null, eventId]
            );
            
            await pool.end();
            return c.json({ success: true });
          } catch (error) {
            console.error("Error updating event template:", error);
            return c.json({ success: false }, 500);
          }
        },
      },
      
      // Generator API - Toggle event template status
      {
        path: "/api/generator/event-templates/:id/toggle",
        method: "POST",
        handler: async (c) => {
          try {
            const eventId = c.req.param("id");
            const body = await c.req.json();
            const { is_active } = body;
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            await pool.query(
              "UPDATE event_templates SET is_active = $1 WHERE id = $2",
              [is_active, eventId]
            );
            
            await pool.end();
            return c.json({ success: true });
          } catch (error) {
            console.error("Error toggling event template:", error);
            return c.json({ success: false }, 500);
          }
        },
      },

      // Generator API - Get images for event template
      {
        path: "/api/generator/event-templates/:id/images",
        method: "GET",
        handler: async (c) => {
          try {
            const eventId = c.req.param("id");
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            const result = await pool.query(
              "SELECT id, image_url, sort_order FROM event_template_images WHERE event_template_id = $1 ORDER BY sort_order",
              [eventId]
            );
            
            await pool.end();
            return c.json({ images: result.rows });
          } catch (error) {
            console.error("Error fetching images:", error);
            return c.json({ images: [] });
          }
        },
      },

      // Generator API - Add image to event template
      {
        path: "/api/generator/event-templates/:id/images",
        method: "POST",
        handler: async (c) => {
          try {
            const eventId = c.req.param("id");
            const body = await c.req.json();
            const { image_url } = body;
            
            if (!image_url) {
              return c.json({ success: false, message: "URL обязателен" }, 400);
            }
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            // Get max sort_order
            const maxRes = await pool.query(
              "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM event_template_images WHERE event_template_id = $1",
              [eventId]
            );
            const nextOrder = maxRes.rows[0].next_order;
            
            const result = await pool.query(
              "INSERT INTO event_template_images (event_template_id, image_url, sort_order) VALUES ($1, $2, $3) RETURNING id",
              [eventId, image_url, nextOrder]
            );
            
            await pool.end();
            return c.json({ success: true, id: result.rows[0].id });
          } catch (error) {
            console.error("Error adding image:", error);
            return c.json({ success: false, message: "Ошибка" }, 500);
          }
        },
      },

      // Generator API - Delete image from event template
      {
        path: "/api/generator/event-templates/:id/images/:imageId",
        method: "DELETE",
        handler: async (c) => {
          try {
            const imageId = c.req.param("imageId");
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            await pool.query("DELETE FROM event_template_images WHERE id = $1", [imageId]);
            
            await pool.end();
            return c.json({ success: true });
          } catch (error) {
            console.error("Error deleting image:", error);
            return c.json({ success: false }, 500);
          }
        },
      },

      // Generator API - Get addresses for event template
      {
        path: "/api/generator/event-templates/:id/addresses",
        method: "GET",
        handler: async (c) => {
          try {
            const eventId = c.req.param("id");
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            const result = await pool.query(
              "SELECT city_id, venue_address FROM event_template_addresses WHERE event_template_id = $1",
              [eventId]
            );
            
            await pool.end();
            return c.json({ addresses: result.rows });
          } catch (error) {
            console.error("Error fetching addresses:", error);
            return c.json({ addresses: [] });
          }
        },
      },

      // Generator API - Save addresses for event template
      {
        path: "/api/generator/event-templates/:id/addresses",
        method: "PUT",
        handler: async (c) => {
          try {
            const eventId = c.req.param("id");
            const body = await c.req.json();
            const { addresses } = body;
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            // Delete existing addresses
            await pool.query(
              "DELETE FROM event_template_addresses WHERE event_template_id = $1",
              [eventId]
            );
            
            // Insert new addresses
            for (const addr of addresses) {
              await pool.query(
                "INSERT INTO event_template_addresses (event_template_id, city_id, venue_address) VALUES ($1, $2, $3)",
                [eventId, addr.city_id, addr.venue_address]
              );
            }
            
            await pool.end();
            return c.json({ success: true });
          } catch (error) {
            console.error("Error saving addresses:", error);
            return c.json({ success: false }, 500);
          }
        },
      },

      // Generator API - Get all generated links
      {
        path: "/api/generator/links",
        method: "GET",
        handler: async (c) => {
          try {
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            const result = await pool.query(`
              SELECT gl.*, et.name as event_name, c.name as city_name
              FROM generated_links gl
              JOIN event_templates et ON gl.event_template_id = et.id
              JOIN cities c ON gl.city_id = c.id
              ORDER BY gl.created_at DESC
              LIMIT 50
            `);
            await pool.end();
            return c.json({ links: result.rows });
          } catch (error) {
            console.error("Error fetching links:", error);
            return c.json({ links: [] });
          }
        },
      },

      // Generator API - Create new link
      {
        path: "/api/generator/create-link",
        method: "POST",
        handler: async (c) => {
          try {
            const body = await c.req.json();
            const { event_template_id, city_id, event_date, event_time, available_seats } = body;
            
            const linkCode = generateLinkCode();
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            // Get venue address for this event and city
            const addrResult = await pool.query(
              "SELECT venue_address FROM event_template_addresses WHERE event_template_id = $1 AND city_id = $2",
              [event_template_id, city_id]
            );
            const venueAddress = addrResult.rows[0]?.venue_address || null;
            
            await pool.query(`
              INSERT INTO generated_links 
              (link_code, event_template_id, city_id, event_date, event_time, available_seats, venue_address, is_active)
              VALUES ($1, $2, $3, $4, $5, $6, $7, true)
            `, [linkCode, event_template_id, city_id, event_date, event_time, available_seats || 100, venueAddress]);
            
            await pool.end();
            
            return c.json({ success: true, link_code: linkCode });
          } catch (error) {
            console.error("Error creating link:", error);
            return c.json({ success: false, message: "Ошибка создания ссылки" }, 500);
          }
        },
      },

      // Generator API - Toggle link status
      {
        path: "/api/generator/links/:id/toggle",
        method: "POST",
        handler: async (c) => {
          try {
            const linkId = c.req.param("id");
            const body = await c.req.json();
            const { is_active } = body;
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            await pool.query(
              "UPDATE generated_links SET is_active = $1 WHERE id = $2",
              [is_active, linkId]
            );
            
            await pool.end();
            return c.json({ success: true });
          } catch (error) {
            console.error("Error toggling link:", error);
            return c.json({ success: false }, 500);
          }
        },
      },
      
      // Generator API - Update generated link
      {
        path: "/api/generator/links/:id",
        method: "PUT",
        handler: async (c) => {
          try {
            const linkId = c.req.param("id");
            const body = await c.req.json();
            const { venue_address, available_seats } = body;
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            await pool.query(
              "UPDATE generated_links SET venue_address = $1, available_seats = $2 WHERE id = $3",
              [venue_address, available_seats, linkId]
            );
            
            await pool.end();
            return c.json({ success: true });
          } catch (error) {
            console.error("Error updating link:", error);
            return c.json({ success: false }, 500);
          }
        },
      },

      // Generator API - Delete generated link
      {
        path: "/api/generator/links/:id",
        method: "DELETE",
        handler: async (c) => {
          const authPassword = c.req.header("X-Admin-Password");
          const adminPassword = process.env.ADMIN_PASSWORD || "root2024";
          if (authPassword !== adminPassword) {
            return c.json({ success: false, message: "Unauthorized" }, 401);
          }
          
          try {
            const linkId = c.req.param("id");
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            await pool.query("DELETE FROM generated_links WHERE id = $1", [linkId]);
            
            await pool.end();
            return c.json({ success: true });
          } catch (error) {
            console.error("Error deleting link:", error);
            return c.json({ success: false }, 500);
          }
        },
      },

      // Event page by generated link code
      {
        path: "/e/:code",
        method: "GET",
        handler: async (c) => {
          const fs = await import("fs");
          const html = fs.readFileSync("/home/runner/workspace/src/mastra/public/event.html", "utf-8");
          return c.html(html);
        },
      },

      // Booking page for generated links
      {
        path: "/booking-link/:code",
        method: "GET",
        handler: async (c) => {
          const fs = await import("fs");
          const html = fs.readFileSync("/home/runner/workspace/src/mastra/public/booking.html", "utf-8");
          return c.html(html);
        },
      },

      // Booking page for regular events
      {
        path: "/booking/:id",
        method: "GET",
        handler: async (c) => {
          const fs = await import("fs");
          const html = fs.readFileSync("/home/runner/workspace/src/mastra/public/booking.html", "utf-8");
          return c.html(html);
        },
      },

      // API to get event by link code
      {
        path: "/api/event-link/:code",
        method: "GET",
        handler: async (c) => {
          try {
            const linkCode = c.req.param("code");
            
            const pg = await import("pg");
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            
            const result = await pool.query(`
              SELECT gl.*, et.name, et.description, et.category_id, et.id as template_id,
                     c.name as city_name, cat.name_ru as category_name
              FROM generated_links gl
              JOIN event_templates et ON gl.event_template_id = et.id
              JOIN cities c ON gl.city_id = c.id
              JOIN categories cat ON et.category_id = cat.id
              WHERE gl.link_code = $1 AND gl.is_active = true
            `, [linkCode]);
            
            if (result.rows.length === 0) {
              await pool.end();
              return c.json({ error: "Link not found or inactive" }, 404);
            }
            
            const row = result.rows[0];
            
            // Get images for this event template
            const imagesResult = await pool.query(
              "SELECT image_url FROM event_template_images WHERE event_template_id = $1 ORDER BY sort_order LIMIT 5",
              [row.template_id]
            );
            const images = imagesResult.rows.map(r => r.image_url);
            
            await pool.end();
            
            return c.json({
              id: row.id,
              linkCode: row.link_code,
              name: row.name,
              description: row.description,
              images: images,
              imageUrl: images[0] || null,
              categoryId: row.category_id,
              categoryName: row.category_name,
              cityId: row.city_id,
              cityName: row.city_name,
              eventDate: row.event_date,
              eventTime: row.event_time,
              venueAddress: row.venue_address,
              availableSeats: row.available_seats,
              price: 2490 // Fixed minimum price
            });
          } catch (error) {
            console.error("Error fetching event link:", error);
            return c.json({ error: "Server error" }, 500);
          }
        },
      },
    ],
  },
  logger:
    process.env.NODE_ENV === "production"
      ? new ProductionPinoLogger({
          name: "Mastra",
          level: "info",
        })
      : new PinoLogger({
          name: "Mastra",
          level: "info",
        }),
});

/*  Sanity check 1: Throw an error if there are more than 1 workflows.  */
// !!!!!! Do not remove this check. !!!!!!
if (Object.keys(mastra.getWorkflows()).length > 1) {
  throw new Error(
    "More than 1 workflows found. Currently, more than 1 workflows are not supported in the UI, since doing so will cause app state to be inconsistent.",
  );
}

/*  Sanity check 2: Throw an error if there are more than 1 agents.  */
// !!!!!! Do not remove this check. !!!!!!
if (Object.keys(mastra.getAgents()).length > 1) {
  throw new Error(
    "More than 1 agents found. Currently, more than 1 agents are not supported in the UI, since doing so will cause app state to be inconsistent.",
  );
}
