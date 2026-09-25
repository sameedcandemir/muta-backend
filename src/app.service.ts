import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getAllUsers() {
    return this.prisma.user.findMany({
      orderBy: {
        id: 'desc', 
      },
    });
  }

  async getCategories() {
    return this.prisma.category.findMany({
      orderBy: { 
        createdAt: 'asc' 
      },
    });
  }

  async addCategory(data: { title: string; keyword: string }) {
    const title = data?.title?.trim();
    const keyword = (data?.keyword || title || '').trim().toLocaleLowerCase('tr-TR');

    if (!title || !keyword) {
      throw new BadRequestException('Kategori adı zorunludur.');
    }

    try {
      return await this.prisma.category.create({
        data: { title, keyword },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu kategori zaten mevcut.');
      }
      throw error;
    }
  }

  // 🚀 YENİ: Veritabanından kategori silen görev!
  async deleteCategory(id: string) {
    try {
      return await this.prisma.category.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Kategori bulunamadı.');
      }
      throw error;
    }
  }
}