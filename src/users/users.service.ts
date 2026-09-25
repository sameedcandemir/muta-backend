import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Yonetici numaralari (10 haneli, basinda 0 olmadan). Mobil uygulamadaki liste ile ayni olmalidir.
const ADMIN_PHONES = ['5340623524', '5523442121', '5550752121'];

// "0532 ...", "+90 532 ..." ve "532..." gibi yazimlari tek formata indirger.
const normalizePhone = (phone: string) => {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('90')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async createOrFindUser(phone: string, _requestedRole?: string) {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length < 10) {
      throw new BadRequestException('Lütfen geçerli bir telefon numarası girin.');
    }

    // Rol istemciden alinmaz; yonetici yetkisi sadece sunucudaki listeye gore verilir.
    const resolvedRole = ADMIN_PHONES.includes(normalizedPhone) ? 'ADMIN' : 'CUSTOMER';

    // 1. Önce bu numaraya sahip kullanıcı var mı bak (eski kayitlar basinda 0 ile tutulmus olabilir)
    let user = await this.prisma.user.findFirst({
      where: { phone: { in: [normalizedPhone, `0${normalizedPhone}`, String(phone).trim()] } },
    });

    // 2. Eğer yoksa yeni bir kullanıcı oluştur (Siparişler için ID lazım)
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone: normalizedPhone,
          role: resolvedRole,
        },
      });
      console.log('🆕 Yeni müşteri oluşturuldu:', normalizedPhone);
    } else if (resolvedRole === 'ADMIN' && user.role !== 'ADMIN') {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      });
    }

    return user;
  }
}
