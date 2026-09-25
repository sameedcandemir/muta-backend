import { Module } from '@nestjs/common';
import { AppController } from './app.controller'; // 👈 YENİ: Kapımızı merkeze çağırıyoruz
import { AppService } from './app.service';       // 👈 YENİ: İşçimizi merkeze çağırıyoruz
import { ProductsModule } from './products/products.module';
import { AuthModule } from './auth/auth.module';
import { OrdersModule } from './orders/orders.module';
import { UsersModule } from './users/users.module'; 
import { PrismaModule } from './prisma/prisma.module'; 
import { CloudinaryModule } from './cloudinary/cloudinary.module'; 
import { AccountingModule } from './accounting/accounting.module';

@Module({
  imports: [
    PrismaModule,     // Ana veritabanı motoru
    ProductsModule,   // Ürün yönetimi
    AuthModule,       // Giriş ve yetkilendirme
    OrdersModule,     // Sipariş işlemleri
    UsersModule,      // Müşteri kayıt ve sorgulama
    CloudinaryModule, // Resimlerin Cloudinary'e gitmesi için eklendi
    AccountingModule,
  ],
  controllers: [AppController], // 👈 İŞTE 404 HATASINI ÇÖZEN SATIR! Kapıyı açtık.
  providers: [AppService],      // 👈 İşçimizin görevlerini resmi olarak başlattık.
})
export class AppModule {}
