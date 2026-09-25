import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type EntryType = 'INCOME' | 'EXPENSE';

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [approvedOrders, manualEntries] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: 'ONAYLANDI' },
        select: {
          id: true,
          orderCode: true,
          totalPrice: true,
          currency: true,
          createdAt: true,
        },
      }),
      this.prisma.accountingEntry.findMany({
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const approvedOrderIncome = approvedOrders
      .filter((order) => order.currency === 'TRY')
      .reduce((total, order) => total + order.totalPrice, 0);
    const approvedOrderIncomeUSD = approvedOrders
      .filter((order) => order.currency === 'USD')
      .reduce((total, order) => total + order.totalPrice, 0);
    const manualIncome = manualEntries
      .filter((entry) => entry.type === 'INCOME')
      .reduce((total, entry) => total + entry.amount, 0);
    const expenses = manualEntries
      .filter((entry) => entry.type === 'EXPENSE')
      .reduce((total, entry) => total + entry.amount, 0);

    const entries = [
      ...approvedOrders.map((order) => ({
        id: `order-${order.id}`,
        type: 'INCOME' as EntryType,
        source: 'ORDER' as const,
        amount: order.totalPrice,
        currency: order.currency,
        description: `Onaylanan siparis - ${order.orderCode}`,
        createdAt: order.createdAt,
      })),
      ...manualEntries.map((entry) => ({
        id: `manual-${entry.id}`,
        type: entry.type as EntryType,
        source: 'MANUAL' as const,
        amount: entry.amount,
        currency: 'TRY',
        description: entry.description,
        createdAt: entry.createdAt,
      })),
    ].sort(
      (first, second) => second.createdAt.getTime() - first.createdAt.getTime(),
    );

    return {
      totals: {
        approvedOrderIncome,
        approvedOrderIncomeUSD,
        manualIncome,
        totalIncome: approvedOrderIncome + manualIncome,
        totalExpense: expenses,
        balance: approvedOrderIncome + manualIncome - expenses,
        approvedOrderCount: approvedOrders.length,
      },
      entries,
    };
  }

  async createEntry(data: {
    type?: string;
    amount?: number | string;
    description?: string;
  }) {
    const type = data.type?.toUpperCase();
    const amount = Number(data.amount);
    const description = data.description?.trim();

    if (type !== 'INCOME' && type !== 'EXPENSE') {
      throw new BadRequestException('Hareket turu gelir veya gider olmalidir.');
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Tutar sifirdan buyuk bir sayi olmalidir.');
    }

    if (!description) {
      throw new BadRequestException('Aciklama zorunludur.');
    }

    return this.prisma.accountingEntry.create({
      data: {
        type,
        amount,
        description,
      },
    });
  }
}
