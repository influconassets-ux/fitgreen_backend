const axios = require('axios');

/**
 * Sends a notification message to the configured Telegram bot.
 * 
 * @param {Object} order - The order object that was just paid/placed.
 */
async function sendTelegramOrderNotification(order) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.log('⚠️ Telegram credentials not configured. Skipping notification.');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    // Constructing a nice looking message
    let message = `🚨 *NEW PAID ORDER RECEIVED!* 🚨\n\n`;
    message += `*Order ID:* \`${order.id || order._id}\`\n`;
    message += `*Customer:* ${order.customerName || 'N/A'}\n`;
    message += `*Phone:* ${order.phone || 'N/A'}\n`;
    message += `*Amount:* ₹${order.total}\n`;
    message += `*Type:* ${order.deliveryMethod || 'delivery'}\n`;
    
    if (order.deliveryMethod === 'delivery' && order.address) {
      message += `*Address:* ${order.address}, ${order.pinCode || ''}\n`;
    }

    message += `\n*Items:*\n`;
    if (order.items && order.items.length > 0) {
      order.items.forEach((item, index) => {
        message += `${index + 1}. ${item.name} (x${item.quantity})\n`;
      });
    }

    // foreach chat id in user model and send notification
    
    
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    };

    await axios.post(url, payload);
    console.log(`✅ Telegram notification sent for order ${order.id || order._id}`);
  } catch (error) {
    console.error('❌ Failed to send Telegram notification:', error.message);
  }
}

/**
 * Sends a delayed status check notification to Telegram.
 * 
 * @param {Object} order - The order object fetched from DB after delay.
 */
async function sendTelegramDelayedCheck(order) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    let emoji = '⏳';
    let displayStatus = order.status || 'pending';
    if (displayStatus.toLowerCase() === 'paid') emoji = '✅';
    if (displayStatus.toLowerCase() === 'failed') emoji = '❌';

    let message = `${emoji} *ORDER STATUS UPDATE (40s Check)* ${emoji}\n\n`;
    message += `*Order ID:* \`${order.id || order._id}\`\n`;
    message += `*Current Status:* ${displayStatus.toUpperCase()}\n\n`;
    message += `Please check your Admin Dashboard for details.`;

    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    };

    await axios.post(url, payload);
    console.log(`✅ Telegram delayed check sent for order ${order.id || order._id}`);
  } catch (error) {
    console.error('❌ Failed to send Telegram delayed check:', error.message);
  }
}

module.exports = {
  sendTelegramOrderNotification,
  sendTelegramDelayedCheck
};
