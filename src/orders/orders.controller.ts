import { Controller, Post, Body, Get, Param, Req, Res, Delete } from '@nestjs/common';
import { OrdersService } from './orders.service';
import type { Request, Response } from 'express'; 

// Fis sayfasina basilan veriler HTML'e kacislanir.
const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post() 
  async createOrder(@Body() body: any) {
    return this.ordersService.createOrder(body);
  }

  @Get()
  async getAllOrders() {
    return this.ordersService.getAllOrders();
  }

  @Post(':orderCode/status')
  async updateOrderStatus(@Param('orderCode') orderCode: string, @Body('status') status: string) {
    return this.ordersService.updateOrderStatus(orderCode, status);
  }

  @Delete(':orderId')
  async deleteOrder(@Param('orderId') orderId: string) {
    return this.ordersService.deleteOrder(Number(orderId));
  }

  @Get('view/:orderCode')
  async viewOrder(@Param('orderCode') orderCode: string, @Req() req: Request, @Res() res: Response) {
    try {
      const order = await this.ordersService.getOrderWithDetails(orderCode);
      const BACKEND_URL = `${req.protocol}://${req.get('host')}`;
      const currencySymbol = order.currency === 'USD' ? '$' : '₺';
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [order.addressLine, order.district, order.city].filter(Boolean).join(', '),
      )}`;
      const addressHtml = order.addressLine
        ? `
            <div class="address-box">
              <p class="address-title">📍 TESLİMAT ADRESİ</p>
              <p class="address-name">${escapeHtml(order.recipientName)}</p>
              <p>📞 ${escapeHtml(order.recipientPhone)}</p>
              <p>${escapeHtml(order.addressLine)}</p>
              <p><strong>${escapeHtml(order.district)} / ${escapeHtml(order.city)}</strong></p>
              ${order.orderNote ? `<p class="address-note">📝 Not: ${escapeHtml(order.orderNote)}</p>` : ''}
              <a class="map-btn" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener">📍 Haritada Aç</a>
            </div>`
        : `
            <div class="address-box address-missing">
              <p class="address-title">📍 TESLİMAT ADRESİ</p>
              <p>Bu siparişte adres bilgisi bulunmuyor.</p>
            </div>`;

      let itemsHtml = ''; 
      
      order.items.forEach((item: any) => {
        
        let imgUrl = 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=500'; 
        
        let dbPath: string | null = null;

        if (item.product && item.product.colors) {
          const matchedColor = item.product.colors.find((c: any) => c.colorName === item.color);
          if (matchedColor && matchedColor.image1) {
            dbPath = String(matchedColor.image1);
          }
        }

        if (dbPath) {
          if (dbPath.startsWith('http')) { 
            imgUrl = dbPath;
          } else {
            dbPath = dbPath.replace(/\\/g, '/');
            if (!dbPath.includes('uploads')) dbPath = `uploads/${dbPath}`;
            if (!dbPath.startsWith('/')) dbPath = `/${dbPath}`;
            const rawUrl = `${BACKEND_URL}${dbPath}`;
            imgUrl = encodeURI(rawUrl); 
          }
        }

        // 🚀 GÜNCELLEME: Fotoğraf kutusuna onclick eventi eklendi
        itemsHtml += `
          <div style="display: flex; align-items: flex-start; border-bottom: 1px solid #eee; padding: 20px 0;">
            
            <div class="product-image-box" onclick="openModal('${escapeHtml(imgUrl)}')" style="flex-shrink: 0; width: 140px; height: 190px; margin-right: 20px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15); background-color: #f9f9f9; border: 1px solid #eee; cursor: pointer; position: relative;">
               <img src="${escapeHtml(imgUrl)}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;" alt="Ürün Fotoğrafı" onerror="this.src='https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=500'" class="hover-zoom" />
               <div style="position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,0.6); color: white; font-size: 10px; padding: 4px 6px; border-radius: 4px; font-weight: bold;">🔍 BÜYÜT</div>
            </div>

            <div style="flex: 1; padding-top: 5px;">
              <h3 style="margin: 0 0 8px 0; font-size: 18px; text-transform: uppercase; color: #111; line-height: 1.2;">${escapeHtml(item.product?.name_tr || 'Silinmiş Ürün')}</h3>
              <p style="margin: 0 0 5px 0; color: #64748b; font-size: 14px;">🔖 Kod: <b style="color: #000;">${escapeHtml(item.product?.productCode || '-')}</b></p>
              <p style="margin: 0 0 5px 0; color: #64748b; font-size: 14px;">🎨 Renk: <span style="color: #000; font-weight: 500;">${escapeHtml(item.color)}</span></p>
              <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px;">📏 Seri: <span style="color: #000; font-weight: 500;">${escapeHtml(item.size)}</span></p>
              <div style="display: inline-block; background: #fff1f2; color: #e11d48; padding: 4px 10px; border-radius: 6px; font-size: 14px; font-weight: bold;">
                📦 ${item.quantity} Adet
              </div>
            </div>
            <div style="text-align: right; padding-top: 5px;">
              <h4 style="margin: 0; font-size: 18px; color: #111; font-weight: 700;">${currencySymbol}${item.unitPrice.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</h4>
              <p style="margin: 3px 0 0 0; color: #94a3b8; font-size: 11px; font-weight: bold;">BİRİM FİYAT</p>
            </div>
          </div>
        `;
      });

      const html = `
        <!DOCTYPE html>
        <html lang="tr">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>MUTA Sipariş - ${escapeHtml(order.orderCode)}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; padding: 20px; margin: 0; }
            .container { max-width: 650px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
            .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 20px; margin-bottom: 25px; }
            .header h1 { margin: 0; font-size: 32px; letter-spacing: 12px; font-weight: 200; color: #000; }
            .order-info { background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 30px; border: 1px solid #e2e8f0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .order-info p { margin: 0; font-size: 14px; color: #334155; }
            .total-box { background: #111; color: #fff; text-align: right; padding: 25px; border-radius: 12px; margin-top: 30px; }
            .total-box h2 { margin: 0; font-size: 28px; font-weight: 700; color: #fff; }
            .total-box p { margin: 0 0 5px 0; font-size: 11px; opacity: 0.7; letter-spacing: 2px; text-transform: uppercase; }
            
            /* 🚀 YENİ: Fotoğraf Büyütme (Modal) CSS Ayarları */
            .hover-zoom:hover { transform: scale(1.05); }
            .modal { display: none; position: fixed; z-index: 9999; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.9); display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
            .modal.show { opacity: 1; pointer-events: auto; }
            .modal-content { max-width: 90%; max-height: 85vh; border-radius: 8px; box-shadow: 0 5px 25px rgba(0,0,0,0.5); object-fit: contain; transform: scale(0.9); transition: transform 0.3s ease; }
            .modal.show .modal-content { transform: scale(1); }
            .close { position: absolute; top: 20px; right: 30px; color: #fff; font-size: 40px; font-weight: 100; cursor: pointer; user-select: none; }
            .close:hover { color: #bbb; }
            .address-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 18px 20px; margin-bottom: 30px; }
            .address-box p { margin: 0 0 6px 0; font-size: 14px; color: #334155; line-height: 1.45; white-space: pre-line; }
            .address-box .address-title { font-size: 11px; font-weight: bold; letter-spacing: 2px; color: #92400e; margin-bottom: 10px; }
            .address-box .address-name { font-size: 16px; font-weight: bold; color: #111; }
            .address-box .address-note { margin-top: 10px; color: #92400e; }
            .map-btn { display: inline-block; margin-top: 12px; background: #111; color: #fff; text-decoration: none; font-size: 13px; font-weight: bold; letter-spacing: 1px; padding: 10px 18px; border-radius: 8px; }
            .map-btn:active { opacity: 0.8; }
            .address-missing { background: #f8fafc; border-color: #e2e8f0; }
            .address-missing .address-title { color: #64748b; }

            @media (max-width: 500px) {
              .order-info { grid-template-columns: 1fr; }
              .container { padding: 15px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>MUTΛ</h1>
              <p style="color: #666; margin-top: 8px; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; font-weight: bold;">DİJİTAL SİPARİŞ FİŞİ</p>
            </div>
            
            <div class="order-info">
              <p><strong>Sipariş Kodu:</strong> ${escapeHtml(order.orderCode)}</p>
              <p><strong>Tarih:</strong> ${new Date(order.createdAt).toLocaleString('tr-TR')}</p>
              <p><strong>Müşteri No:</strong> ${escapeHtml(order.user?.phone)}</p>
              <p><strong>Durum:</strong> <span style="color: #d97706; font-weight: bold;">${escapeHtml(order.status)}</span></p>
            </div>

            ${addressHtml}

            <h3 style="border-bottom: 1px solid #eee; padding-bottom: 12px; color: #111; font-size: 13px; text-transform: uppercase; letter-spacing: 2px;">Sipariş Edilen Ürünler</h3>
            
            ${itemsHtml}
            
            <div class="total-box">
              <p>GENEL TOPLAM</p>
              <h2>${currencySymbol}${order.totalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</h2>
            </div>
            
            <p style="text-align: center; color: #94a3b8; font-size: 11px; margin-top: 30px; letter-spacing: 1px;">Bu bir dijital sipariş fişidir. MUTA Collection.</p>
          </div>

          <div id="imageModal" class="modal" onclick="closeModal()">
            <span class="close" onclick="closeModal()">&times;</span>
            <img class="modal-content" id="expandedImg">
          </div>

          <script>
            function openModal(imgSrc) {
              var modal = document.getElementById('imageModal');
              var modalImg = document.getElementById('expandedImg');
              modalImg.src = imgSrc;
              modal.classList.add('show');
            }

            function closeModal() {
              var modal = document.getElementById('imageModal');
              modal.classList.remove('show');
            }
          </script>
        </body>
        </html>
      `;

      res.send(html); 
    } catch (error) {
      res.status(404).send("<h2 style='text-align:center; font-family:sans-serif; margin-top:50px;'>⚠️ Sipariş Bulunamadı</h2>");
    }
  }

  @Get('user/:userId') 
  async getUserOrders(@Param('userId') userId: string) {
    return this.ordersService.getUserOrders(Number(userId));
  }
}
