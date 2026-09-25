import { Controller, Get, Post, Body, Delete, Param, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('users')
  async getUsers() {
    return this.appService.getAllUsers();
  }

  @Get('categories')
  async getCategories() {
    return this.appService.getCategories();
  }

  @Post('categories')
  async addCategory(@Body() body: { title: string; keyword: string }) {
    return this.appService.addCategory(body);
  }

  // Mobil uygulamadan gelen silme talebini karşılayan kapı
  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    return this.appService.deleteCategory(id);
  }

  // 🚀 YENİ: Mobil uygulamadan gelen fotoğrafı karşılayan kapı
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads', // Fotoğraflar backend içindeki uploads klasörüne kaydedilecek
      filename: (req, file, callback) => {
        // Aynı isimde fotoğraflar çakışmasın diye rastgele isim üretiyoruz (Örn: 16912345678-resim.jpg)
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname);
        const filename = `${uniqueSuffix}${ext}`;
        callback(null, filename);
      },
    }),
  }))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { error: 'Dosya yüklenemedi!' };
    }
    
    // Yüklenen fotoğrafın yolunu mobil uygulamaya geri gönderiyoruz
    return {
      message: 'Fotoğraf başarıyla yüklendi!',
      url: `/uploads/${file.filename}` 
    };
  }
}