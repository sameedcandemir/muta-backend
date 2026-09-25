import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express'; 
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // MUTA Mobil uygulaması ile iletişim için CORS şart.
  app.enableCors(); 

  // Railway gibi proxy arkasinda fis linklerinin dogru protokolle (https) uretilmesi icin.
  app.set('trust proxy', 1);

  // 📸 MUTA VİTRİNİ: Klasik yüklemeler için 'uploads' klasörünü açık tutuyoruz
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // 🚀 BULUT AYARI: Railway'in verdiği portu kullan ve 0.0.0.0 ile dış dünyaya aç.
  // Bu ayar 502 hatasını çözen kritik ayardır.
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  // MUTA Markasına Özel Profesyonel Başlangıç Logları
  console.log('\n-------------------------------------------');
  console.log('🚀 MUTA BACKEND SİSTEMİ ATEŞLENDİ');
  console.log(`📡 Servis Portu: ${port}`);
  console.log(`📂 Veritabanı Modu: PostgreSQL (Neon)`);
  console.log('📸 Dosya Sunucusu: Cloudinary & Yerel Aktif');
  console.log('🛠️ Geliştirici: Candemir Yazılım');
  console.log('-------------------------------------------\n');
  
  Logger.log(`MUTA Uygulaması ${port} portu üzerinden yayında!`, 'Bootstrap');
}
bootstrap();