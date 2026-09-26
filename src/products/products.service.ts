import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Stok adedi: bos birakilirsa stok takibi yapilmaz (null); undefined = degistirme.
const parseStockQuantity = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '' || String(value) === 'null') return null;
  const quantity = Number(String(value).replace(/[.\s]/g, ''));
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new BadRequestException('Stok adedi 0 veya daha büyük bir tam sayı olmalıdır.');
  }
  return quantity;
};

// Serideki adet: 1-1000 arasi tam sayi; undefined = degistirme.
const parsePiecesPerSeries = (value: unknown): number | undefined => {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const pieces = Number(value);
  if (!Number.isInteger(pieces) || pieces < 1 || pieces > 1000) {
    throw new BadRequestException('Bir serideki adet 1 ile 1000 arasında bir tam sayı olmalıdır.');
  }
  return pieces;
};

// Prisma hata kodlarini kullaniciya anlamli HTTP hatalarina cevirir.
const toHttpError = (error: any, fallback: string) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return new ConflictException('Bu ürün kodu zaten kullanılıyor. Lütfen farklı bir kod girin.');
    if (error.code === 'P2025') return new NotFoundException('Ürün bulunamadı.');
  }
  if (error?.getStatus) return error;
  return new BadRequestException(fallback);
};

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  // 1. TÜM ÜRÜNLERİ GETİR (Renkleri ve resimleriyle birlikte)
  async findAll() {
    try {
      console.log('📡 MUTA SİSTEMİ: Ürün listesi talebi alındı.');
      
      return await this.prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
        include: { 
          colors: true 
        }
      });
    } catch (error: any) {
      console.error('❌ MUTA VERİTABANI HATASI (Listeleme):', error.message);
      throw error;
    }
  }

  // 2. YENİ ÜRÜN OLUŞTUR (İndirim Yüzdesi Eklendi)
  async create(data: any) {
    try {
      console.log(`📦 MUTA SİSTEMİ: Ürün kaydı başlatıldı -> ${data.productCode}`);

      const newProduct = await this.prisma.product.create({
        data: {
          productCode: data.productCode,
          name_tr: data.name_tr,
          name_en: data.name_en || '',
          name_ar: data.name_ar || '',
          priceUSD: Number(data.priceUSD), 
          priceTRY: Number(data.priceTRY || 0), 
          stockStatus: data.stockStatus !== undefined ? Number(data.stockStatus) : 1,
          stockQuantity: parseStockQuantity(data.stockQuantity) ?? null,
          piecesPerSeries: parsePiecesPerSeries(data.piecesPerSeries) ?? 5,
          
          // 🚀 YENİ: Mobilden gelen indirim veritabanına işleniyor
          discountPercentage: data.discountPercentage ? Number(data.discountPercentage) : 0,

          sizes: data.sizes || 'Seri 1',
          category: data.category || 'Genel',
          productType: data.productType || 'Giyim',
          brand: data.brand || 'MUTΛ',
          
          colors: {
            create: data.colorsData 
          }
        },
        include: { colors: true }
      });

      console.log(`✅ MUTA SİSTEMİ: Ürün ve ${data.colorsData?.length || 0} farklı renk başarıyla kaydedildi (ID: ${newProduct.id})`);
      return newProduct;

    } catch (error: any) {
      console.error('❌ MUTA VERİTABANI HATASI (Kayıt):', error.message);
      throw toHttpError(error, 'Ürün kaydedilemedi.');
    }
  }

  // 🚀 YENİ: 3. MEVCUT ÜRÜNÜ GÜNCELLE (Düzenleme Modu)
  async updateProduct(id: number, data: any) {
    try {
      console.log(`📦 MUTA SİSTEMİ: Ürün güncelleme başlatıldı -> ID: ${id}`);

      const productFields = {
          productCode: data.productCode,
          name_tr: data.name_tr,
          name_en: data.name_en,
          name_ar: data.name_ar,
          priceUSD: Number.isFinite(data.priceUSD) ? Number(data.priceUSD) : undefined, 
          priceTRY: Number.isFinite(data.priceTRY) ? Number(data.priceTRY) : undefined,
          
          // 🚀 YENİ: İndirim Yüzdesi güncelleniyor
          discountPercentage: Number.isFinite(Number(data.discountPercentage)) && data.discountPercentage !== undefined
            ? Math.min(99, Math.max(0, Math.round(Number(data.discountPercentage))))
            : undefined,

          stockQuantity: parseStockQuantity(data.stockQuantity),
          piecesPerSeries: parsePiecesPerSeries(data.piecesPerSeries),
          sizes: data.sizes,
          category: data.category,
          productType: data.productType,
          brand: data.brand,
      };

      // Renkler gonderildiyse eski varyasyonlar silinip yenileri tek islemde yazilir.
      const updatedProduct = await this.prisma.$transaction(async (tx) => {
        if (Array.isArray(data.colorsData)) {
          await tx.productColor.deleteMany({ where: { productId: id } });
        }
        return tx.product.update({
          where: { id: id },
          data: {
            ...productFields,
            ...(Array.isArray(data.colorsData) ? { colors: { create: data.colorsData } } : {}),
          },
          include: { colors: true }
        });
      });

      console.log(`✅ MUTA SİSTEMİ: Ürün başarıyla güncellendi (ID: ${id})`);
      return updatedProduct;

    } catch (error: any) {
      console.error('❌ MUTA VERİTABANI HATASI (Güncelleme):', error.message);
      throw toHttpError(error, 'Ürün güncellenemedi.');
    }
  }

  // 4. ADMIN: ÜRÜNÜ SİL
  async deleteProduct(id: number) {
    try {
      await this.prisma.orderItem.deleteMany({
        where: { productId: id },
      });

      const deletedProduct = await this.prisma.product.delete({
        where: { id: id },
      });

      return deletedProduct;
    } catch (error: any) {
      console.error('❌ MUTA VERİTABANI HATASI (Silme): ', error.message);
      throw toHttpError(error, 'Ürün silinemedi.');
    }
  }

  // 5. ADMIN: STOK DURUMUNU GÜNCELLE
  async updateStock(id: number, stockStatus: number) {
    try {
      const updatedProduct = await this.prisma.product.update({
        where: { id: id },
        data: { stockStatus: stockStatus },
      });
      console.log(`📦 MUTA SİSTEMİ: Stok güncellendi (ID: ${id}) -> Yeni Durum: ${stockStatus === 1 ? 'Var' : 'Tükendi'}`);
      return updatedProduct;
    } catch (error: any) {
      console.error('❌ MUTA VERİTABANI HATASI (Stok Güncelleme):', error.message);
      throw toHttpError(error, 'Stok güncellenemedi.');
    }
  }
}