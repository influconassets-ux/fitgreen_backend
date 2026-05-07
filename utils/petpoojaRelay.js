const axios = require('axios');

async function relayOrderToPetpooja(orderData) {
  try {
    console.log(`🚀 Relaying Order ${orderData.id} to Petpooja...`);

    // Prepare Save Order payload for Petpooja
    const petpoojaPayload = {
      app_key: process.env.PETPOOJA_APP_KEY,
      app_secret: process.env.PETPOOJA_APP_SECRET,
      access_token: process.env.PETPOOJA_ACCESS_TOKEN,
      restID: 'f871uxkp', // Mapped restID from plan
      orderinfo: {
        OrderInfo: {
          Restaurant: {
            details: {
              res_name: "FitGreen",
              address: "FitGreen Address",
              contact_information: "9999999999",
              restID: "f871uxkp"
            }
          },
          Customer: {
            details: {
              name: orderData.customerName || 'Customer',
              email: orderData.customerEmail || '',
              phone: orderData.phone || '9999999999',
              address: orderData.address || 'N/A'
            }
          },
          Order: {
            details: {
              orderID: orderData.id || `FG${Date.now()}`,
              order_type: "Delivery",
              payment_type: "Prepaid",
              total: parseFloat(typeof orderData.total === 'string' ? orderData.total.replace(/[^\d.-]/g, '') : orderData.total) || 0,
              tax_total: 0,
              created_on: new Date().toISOString()
            }
          },
          OrderItem: {
            details: orderData.items.map(item => ({
              id: item.itemId || item.id, // Must be the Petpooja itemId
              name: item.name,
              price: parseFloat(typeof item.price === 'string' ? item.price.replace(/[^\d.-]/g, '') : item.price) || 0,
              final_price: parseFloat(typeof item.price === 'string' ? item.price.replace(/[^\d.-]/g, '') : item.price) || 0,
              quantity: item.quantity || 1,
              variation_id: item.variation_id || item.variantId || "",
              item_tax: []
            }))
          }
        }
      }
    };

    const saveOrderUrl = process.env.PETPOOJA_SAVE_ORDER_URL || 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/save_order';
    
    const petpoojaRes = await axios.post(saveOrderUrl, petpoojaPayload);
    console.log('✅ Petpooja Relay Response:', petpoojaRes.data);
    return petpoojaRes.data;
  } catch (error) {
    console.error('❌ Petpooja Relay Failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

module.exports = { relayOrderToPetpooja };
