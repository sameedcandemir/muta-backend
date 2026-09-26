import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

// "Seri 3" -> 3
const parseSeriesCount = (size: string) => {
  const match = /seri\s*(\d+)/i.exec(size || '');
  return match ? Number(match[1]) : null;
};

// Siparis kalemlerini urun bazinda toplam adede cevirir.
const sumQuantitiesByProduct = (items: { productId: number; quantity: number }[]) => {
  const totals = new Map<number, number>();
  for (const item of items) totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
  return totals;
};

const ORDER_STATUSES = ['BEKLIYOR', 'ONAYLANDI', 'IPTAL'];

const clean = (value: unknown, maxLength: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);

// Siparis ancak eksiksiz teslimat adresiyle tamamlanir.
const parseDeliveryAddress = (data: any) => {
  const address = data?.address || {};
  const recipientName = clean(address.recipientName, 80);
  const recipientPhone = clean(address.recipientPhone, 20);
  const city = clean(address.city, 40);
  const district = clean(address.district, 60);
  const addressLine = String(address.addressLine ?? '').trim().slice(0, 400);
  const orderNote = String(address.orderNote ?? '').trim().slice(0, 300);

  if (!recipientName && !city && !addressLine) {
    throw new BadRequestException(
      'Sipariş için teslimat adresi gerekli. Uygulamanız eski sürümdeyse lütfen kapatıp yeniden açarak güncelleyin.',
    );
  }
  if (recipientName.length < 3) throw new BadRequestException('Lütfen alıcının adını ve soyadını yazın.');
  if (recipientPhone.replace(/\D/g, '').length < 10) throw new BadRequestException('Lütfen geçerli bir iletişim telefonu yazın.');
  if (!city) throw new BadRequestException('Lütfen il bilgisini yazın.');
  if (!district) throw new BadRequestException('Lütfen ilçe bilgisini yazın.');
  if (addressLine.length < 10) throw new BadRequestException('Lütfen açık adresi (mahalle, sokak, bina/daire no) eksiksiz yazın.');

  return { recipientName, recipientPhone, city, district, addressLine, orderNote: orderNote || null };
};

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  // Stok takibi yapilan urunlerden adet duser. Yetersizse hic bir sey dusmeden hata verir
  // (transaction icinde cagrilir; kosullu guncelleme ayni anda gelen siparislerde eksi stogu engeller).
  private async reserveStock(tx: Tx, items: { productId: number; quantity: number }[]) {
    for (const [productId, quantity] of sumQuantitiesByProduct(items)) {
      const product = await tx.product.findUnique({ where: { id: productId }, select: { name_tr: true, stockQuantity: true, piecesPerSeries: true } });
      if (!product || product.stockQuantity === null) continue;

      const result = await tx.product.updateMany({
        where: { id: productId, stockQuantity: { gte: quantity } },
        data: { stockQuantity: { decrement: quantity } },
      });
      if (result.count === 0) {
        const left = product.stockQuantity;
        const perSeries = product.piecesPerSeries || 5;
        throw new BadRequestException(
          left < perSeries
            ? `"${product.name_tr}" ürününün stoğu tükendi. Lütfen sepetinizden çıkarın.`
            : `"${product.name_tr}" için stokta ${left} adet (${Math.floor(left / perSeries)} seri) kaldı. Lütfen daha az seri seçin.`,
        );
      }
    }
  }

  // Iptal edilen / silinen siparisin adetleri stoga geri eklenir.
  private async releaseStock(tx: Tx, items: { productId: number; quantity: number }[]) {
    for (const [productId, quantity] of sumQuantitiesByProduct(items)) {
      await tx.product.updateMany({
        where: { id: productId, stockQuantity: { not: null } },
        data: { stockQuantity: { increment: quantity } },
      });
    }
  }

  // Siparis kodu unique oldugu icin cakisma olursa yeni kod uretilir.
  private async generateOrderCode() {
    for (let attempt = 0; attempt < 10; attempt++) {
      const orderCode = `SIP-${Math.floor(100000 + Math.random() * 900000)}`;
      const existing = await this.prisma.order.findUnique({ where: { orderCode } });
      if (!existing) return orderCode;
    }
    return `SIP-${Date.now()}`;
  }

  async createOrder(data: any) {
    const orderItems = Array.isArray(data.items) ? data.items : [];
    const productIds: number[] = Array.from(
      new Set<number>(orderItems.map((item: any): number => Number(item.productId))),
    );

    const userId = Number(data.userId);

    if (!Number.isInteger(userId) || userId <= 0 || productIds.length === 0 || productIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new BadRequestException('Sipariş için geçerli ürünler bulunamadı.');
    }

    const deliveryAddress = parseDeliveryAddress(data);

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stockStatus: true, piecesPerSeries: true },
    });
    const piecesPerSeriesById = new Map(products.map((product) => [product.id, product.piecesPerSeries || 5]));

    const hasUnavailableProduct =
      products.length !== productIds.length ||
      products.some((product) => product.stockStatus !== 1);

    if (hasUnavailableProduct) {
      throw new BadRequestException(
        'Sepetinizde stokta olmayan veya silinmiş bir ürün var. Lütfen sepetinizi güncelleyin.',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı. Lütfen tekrar giriş yapın.');
    }

    // Adet sunucuda hesaplanir: seri sayisi x urunun serideki adedi (unitPrice parca basi fiyattir).
    const itemsToCreate = orderItems.map((item: any) => {
      const productId = Number(item.productId);
      const seriesCount = parseSeriesCount(String(item.size || ''));
      return {
        productId,
        size: String(item.size || ''),
        color: String(item.color || ''),
        quantity: seriesCount ? seriesCount * (piecesPerSeriesById.get(productId) ?? 5) : Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      };
    });

    if (itemsToCreate.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
      throw new BadRequestException('Sipariş kalemlerinde geçersiz adet veya fiyat var.');
    }

    // Toplam tutar istemciye guvenilmeden kalemlerden hesaplanir.
    const totalPrice =
      Math.round(itemsToCreate.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100) / 100;

    const orderCode = await this.generateOrderCode();

    // Stok dusme ve siparis kaydi tek islemde: biri basarisiz olursa ikisi de geri alinir.
    const order = await this.prisma.$transaction(async (tx) => {
      await this.reserveStock(tx, itemsToCreate);
      return tx.order.create({
        data: {
          orderCode,
          userId,
          totalPrice,
          currency: data.currency === 'USD' ? 'USD' : 'TRY',
          ...deliveryAddress,
          items: {
            create: itemsToCreate,
          },
        },
      });
    });

    return { orderCode: order.orderCode };
  }

  async getOrderWithDetails(orderCode: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderCode },
      include: {
        user: true, 
        items: {
          include: {
            product: {
              include: {
                colors: true 
              }
            }, 
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Sipariş bulunamadı!');
    return order;
  }

  async getUserOrders(userId: number) {
    if (!Number.isInteger(userId) || userId <= 0) return [];
    return this.prisma.order.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' }, 
      include: {
        items: {
          include: { 
            product: {
              include: { colors: true } 
            } 
          } 
        }
      }
    });
  }

  // 👑 🚀 GÜNCELLENDİ: Admin sipariş listesinde artık ürün fotoğrafları ve detayları da çekiliyor!
  async getAllOrders() {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: { 
        user: true, // Müşteri numarasını getir
        items: {    // 🚀 Siparişin içindeki ürünleri getir
          include: {
            product: { // O ürünlerin ana bilgilerini getir
              include: {
                colors: true // Ve tabii ki resimlerin olduğu renk bilgisini getir
              }
            }
          }
        }
      } 
    });
  }

  async updateOrderStatus(orderCode: string, status: string) {
    if (!ORDER_STATUSES.includes(status)) {
      throw new BadRequestException('Geçersiz sipariş durumu.');
    }

    const order = await this.prisma.order.findUnique({ where: { orderCode }, include: { items: true } });
    if (!order) throw new NotFoundException('Sipariş bulunamadı!');

    return this.prisma.$transaction(async (tx) => {
      // Iptal edilen siparisin adetleri stoga doner; iptalden geri alinirsa tekrar duser.
      if (order.status !== 'IPTAL' && status === 'IPTAL') await this.releaseStock(tx, order.items);
      if (order.status === 'IPTAL' && status !== 'IPTAL') await this.reserveStock(tx, order.items);

      return tx.order.update({
        where: { orderCode },
        data: {
          status,
          // Muhasebe geliri onay tarihine yazilir; onay kaldirilirsa tarih de temizlenir.
          approvedAt: status === 'ONAYLANDI' ? (order.approvedAt ?? new Date()) : null,
        }
      });
    });
  }

  async deleteOrder(orderId: number) {
    try {
      const deletedOrder = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
        if (!order) throw new NotFoundException('Sipariş bulunamadı!');
        // Iptal edilmemis siparis silinirse adetleri stoga geri eklenir.
        if (order.status !== 'IPTAL') await this.releaseStock(tx, order.items);
        await tx.orderItem.deleteMany({ where: { orderId } });
        return tx.order.delete({ where: { id: orderId } });
      });

      return { message: 'Sipariş ve detayları başarıyla silindi', deletedOrder };
    } catch (error) {
      console.error('Sipariş silinirken hata:', error);
      throw new NotFoundException('Sipariş silinemedi veya sistemde bulunamadı.');
    }
  }
}
