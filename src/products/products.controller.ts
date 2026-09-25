import { Controller, Get, Post, Body, UseInterceptors, UploadedFiles, Delete, Param, Patch, BadRequestException } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ProductsService } from './products.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly cloudinary: CloudinaryService 
  ) {}

  // Renk varyasyonlarini ve 5'er fotografini isler. Yeni dosyalar Cloudinary'e yuklenir,
  // dosya gelmeyen slotlarda (duzenleme modu) mevcut fotograf URL'si korunur.
  private async buildColorsData(colorsJson: string, files: Array<Express.Multer.File> = []) {
    let parsedColors: any[] = [];
    try {
      parsedColors = JSON.parse(colorsJson || '[]');
    } catch (e) {
      throw new BadRequestException('Renk verileri hatalı formatta (Geçersiz JSON).');
    }

    if (!Array.isArray(parsedColors) || parsedColors.length === 0) {
      throw new BadRequestException('Ürüne en az bir renk varyasyonu eklemelisiniz.');
    }

    const colorsDataToSave: any[] = [];

    for (let i = 0; i < parsedColors.length; i++) {
      const colorInfo = parsedColors[i] || {};
      const imageUrls: (string | null)[] = [null, null, null, null, null];

      for (let j = 1; j <= 5; j++) {
        const file = files.find(f => f.fieldname === `image_${i}_${j}`);
        const existingUrl = colorInfo[`image${j}`];
        if (file) {
          try {
            const upload = await this.cloudinary.uploadImage(file);
            imageUrls[j - 1] = upload.secure_url;
          } catch (error: any) {
            console.error('❌ MUTA CLOUDINARY HATASI:', error?.message || error);
            throw new BadRequestException('Fotoğraf yüklenemedi. Lütfen tekrar deneyin.');
          }
        } else if (typeof existingUrl === 'string' && existingUrl.trim() !== '') {
          imageUrls[j - 1] = existingUrl;
        }
      }

      if (!colorInfo.colorName || String(colorInfo.colorName).trim() === '') {
        throw new BadRequestException(`${i + 1}. rengin adı boş olamaz.`);
      }

      colorsDataToSave.push({
        colorName: String(colorInfo.colorName).trim(),
        colorHex: colorInfo.colorHex || null,
        image1: imageUrls[0],
        image2: imageUrls[1],
        image3: imageUrls[2],
        image4: imageUrls[3],
        image5: imageUrls[4]
      });
    }

    return colorsDataToSave;
  }

  @Get()
  async getAllProducts() {
    return await this.productsService.findAll();
  }

  @Post() 
  @UseInterceptors(AnyFilesInterceptor()) 
  async createProduct(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body() body: any
  ) {
    console.log(`📱 MUTA SİSTEMİ: Varyasyonlu yeni ürün işleniyor -> ${body.productCode}`);

    if (!body.productCode || !body.name_tr || !Number.isFinite(parseFloat(body.priceUSD))) {
      throw new BadRequestException('Ürün kodu, ürün adı ve geçerli bir USD fiyatı zorunludur.');
    }

    const colorsDataToSave = await this.buildColorsData(body.colors, files);

    const productData = {
      ...body,
      priceUSD: parseFloat(body.priceUSD),
      priceTRY: parseFloat(body.priceTRY || '0'), 
      
      discountPercentage: body.discountPercentage ? parseInt(body.discountPercentage, 10) : 0,

      colorsData: colorsDataToSave,
    };

    const newProduct = await this.productsService.create(productData);
    
    return {
      message: 'Ürün ve renk varyasyonları MUTA veritabanına başarıyla işlendi.',
      data: newProduct
    };
  }

  @Delete(':id') 
  async deleteProduct(@Param('id') id: string) {
    console.log(`🗑️ MUTA SİSTEMİ: Ürün siliniyor -> ID: ${id}`);
    return await this.productsService.deleteProduct(Number(id));
  }

  @Patch(':id') 
  @UseInterceptors(AnyFilesInterceptor()) 
  async updateProduct(
    @Param('id') id: string, 
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body() body: any
  ) {
    // 1. Senaryo: Sadece Stok Güncellemesi Gelmişse
    if (body.stockStatus !== undefined && Object.keys(body).length <= 2) {
      console.log(`📦 MUTA SİSTEMİ: Sadece Stok güncelleniyor -> ID: ${id}, Yeni Durum: ${body.stockStatus}`);
      return await this.productsService.updateStock(Number(id), Number(body.stockStatus));
    }

    // 2. Senaryo: Mobilden Kapsamlı Ürün Güncellemesi Gelmişse
    console.log(`📝 MUTA SİSTEMİ: Ürün detayları düzenleniyor -> ID: ${id}`);
    
    const updateData = {
      ...body,
      colorsData: body.colors !== undefined ? await this.buildColorsData(body.colors, files) : undefined,
      priceUSD: body.priceUSD !== undefined && body.priceUSD !== '' ? parseFloat(body.priceUSD) : undefined,
      priceTRY: body.priceTRY !== undefined && body.priceTRY !== '' ? parseFloat(body.priceTRY) : undefined,
      discountPercentage: body.discountPercentage !== undefined ? parseInt(body.discountPercentage, 10) : undefined,
    };

    const updatedProduct = await this.productsService.updateProduct(Number(id), updateData);
    
    return {
      message: 'Ürün başarıyla güncellendi.',
      data: updatedProduct
    };
  }
}