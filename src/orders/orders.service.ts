import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ORDER_STATUSES = ['BEKLIYOR', 'ONAYLANDI', 'IPTAL'];

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

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

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stockStatus: true },
    });

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

    const itemsToCreate = orderItems.map((item: any) => ({
      productId: Number(item.productId),
      size: String(item.size || ''),
      color: String(item.color || ''),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    }));

    if (itemsToCreate.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
      throw new BadRequestException('Sipariş kalemlerinde geçersiz adet veya fiyat var.');
    }

    // Toplam tutar istemciye guvenilmeden kalemlerden hesaplanir.
    const totalPrice =
      Math.round(itemsToCreate.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100) / 100;

    const order = await this.prisma.order.create({
      data: {
        orderCode: await this.generateOrderCode(),
        userId,
        totalPrice,
        currency: data.currency === 'USD' ? 'USD' : 'TRY',
        items: {
          create: itemsToCreate,
        },
      },
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

    const order = await this.prisma.order.findUnique({ where: { orderCode } });
    if (!order) throw new NotFoundException('Sipariş bulunamadı!');

    return this.prisma.order.update({
      where: { orderCode },
      data: { status }
    });
  }

  async deleteOrder(orderId: number) {
    try {
      await this.prisma.orderItem.deleteMany({
        where: { orderId: orderId },
      });

      const deletedOrder = await this.prisma.order.delete({
        where: { id: orderId },
      });

      return { message: 'Sipariş ve detayları başarıyla silindi', deletedOrder };
    } catch (error) {
      console.error('Sipariş silinirken hata:', error);
      throw new NotFoundException('Sipariş silinemedi veya sistemde bulunamadı.');
    }
  }
}
