import TelegramBot from "node-telegram-bot-api";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

let bot: TelegramBot | null = null;

function getBot(): TelegramBot | null {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("❌ [TelegramAdmin] TELEGRAM_BOT_TOKEN not configured");
    return null;
  }
  if (!bot) {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
  }
  return bot;
}

export interface OrderNotificationData {
  orderId: number;
  orderCode: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  cityName: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  seatsCount: number;
  totalPrice: number;
}

export async function sendOrderNotificationToAdmin(
  order: OrderNotificationData
): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot) {
    console.error("❌ [TelegramAdmin] Bot not initialized");
    return false;
  }

  if (!ADMIN_CHAT_ID) {
    console.error("❌ [TelegramAdmin] TELEGRAM_ADMIN_CHAT_ID not configured");
    return false;
  }

  console.log("📤 [TelegramAdmin] Sending order notification to admin:", order.orderCode);

  const message = `🎫 *Клиент на странице оплаты!*

📋 *Код заказа:* \`${order.orderCode}\`

🎭 *Мероприятие:* ${escapeMarkdown(order.eventName)}
📍 *Город:* ${escapeMarkdown(order.cityName)}
📅 *Дата:* ${order.eventDate}
⏰ *Время:* ${order.eventTime}

👤 *Покупатель:* ${escapeMarkdown(order.customerName)}
📞 *Телефон:* ${escapeMarkdown(order.customerPhone)}
${order.customerEmail ? `📧 *Email:* ${escapeMarkdown(order.customerEmail)}` : ""}

🎟 *Мест:* ${order.seatsCount}
💰 *Сумма:* ${order.totalPrice} ₽

⏳ *Статус:* Клиент выбирает способ оплаты`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Подтвердить оплату", callback_data: `confirm_${order.orderId}` },
        { text: "❌ Отклонить", callback_data: `reject_${order.orderId}` },
      ],
    ],
  };

  try {
    await telegramBot.sendMessage(ADMIN_CHAT_ID, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
    console.log("✅ [TelegramAdmin] Notification sent successfully");
    return true;
  } catch (error) {
    console.error("❌ [TelegramAdmin] Failed to send notification:", error);
    return false;
  }
}

export async function updateOrderMessageStatus(
  chatId: string | number,
  messageId: number,
  orderCode: string,
  status: "confirmed" | "rejected",
  adminUsername?: string
): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot) {
    return false;
  }

  const statusText = status === "confirmed" 
    ? "✅ *ОПЛАТА ПОДТВЕРЖДЕНА*" 
    : "❌ *ЗАКАЗ ОТКЛОНЁН*";
  
  const adminInfo = adminUsername ? `\n👤 Обработал: @${adminUsername}` : "";
  const timestamp = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

  const newText = `${statusText}

📋 *Код заказа:* \`${orderCode}\`
📅 *Обработано:* ${timestamp}${adminInfo}`;

  try {
    await telegramBot.editMessageText(newText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
    });
    console.log(`✅ [TelegramAdmin] Message updated for order ${orderCode}`);
    return true;
  } catch (error) {
    console.error("❌ [TelegramAdmin] Failed to update message:", error);
    return false;
  }
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text: string
): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot) {
    return false;
  }

  try {
    await telegramBot.answerCallbackQuery(callbackQueryId, { text });
    return true;
  } catch (error) {
    console.error("❌ [TelegramAdmin] Failed to answer callback:", error);
    return false;
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
