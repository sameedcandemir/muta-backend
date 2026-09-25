import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type EntryType = 'INCOME' | 'EXPENSE';
type Currency = 'TRY' | 'USD';
type Period = 'today' | 'month' | 'all';

interface EntryInput {
  type?: string;
  amount?: number | string;
  currency?: string;
  description?: string;
}

// Sifirlama sifresi Render'da ACCOUNTING_RESET_PASSWORD ortam degiskeniyle degistirilebilir.
const RESET_PASSWORD = process.env.ACCOUNTING_RESET_PASSWORD || '1453';

// Turkiye saati (UTC+3, yaz saati uygulamasi yok) ile gun/ay baslangici.
const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000;
const getPeriodStart = (period: Period): Date | null => {
  if (period === 'all') return null;
  const turkeyNow = new Date(Date.now() + TURKEY_OFFSET_MS);
  const year = turkeyNow.getUTCFullYear();
  const month = turkeyNow.getUTCMonth();
  const day = period === 'today' ? turkeyNow.getUTCDate() : 1;
  return new Date(Date.UTC(year, month, day) - TURKEY_OFFSET_MS);
};

const sum = (values: number[]) => Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  private async getResetAt() {
    const setting = await this.prisma.accountingSetting.findUnique({ where: { id: 1 } });
    return setting?.resetAt ?? null;
  }

  private validateEntry(data: EntryInput) {
    const type = data.type?.toUpperCase();
    const amount = Number(String(data.amount ?? '').replace(',', '.'));
    const currency = (data.currency || 'TRY').toUpperCase();
    const description = data.description?.trim();

    if (type !== 'INCOME' && type !== 'EXPENSE') {
      throw new BadRequestException('Hareket türü gelir veya gider olmalıdır.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Tutar sıfırdan büyük bir sayı olmalıdır.');
    }
    if (currency !== 'TRY' && currency !== 'USD') {
      throw new BadRequestException('Para birimi TRY veya USD olmalıdır.');
    }
    if (!description) {
      throw new BadRequestException('Açıklama zorunludur.');
    }

    return { type, amount: Math.round(amount * 100) / 100, currency, description: description.slice(0, 120) };
  }

  async getSummary(rawPeriod?: string) {
    const period: Period = rawPeriod === 'today' || rawPeriod === 'month' ? rawPeriod : 'all';
    const resetAt = await this.getResetAt();
    const periodStart = getPeriodStart(period);
    // Donem baslangici: sifirlama tarihi ile secilen filtrenin (bugun / bu ay) daha yeni olani.
    const from = [resetAt, periodStart].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;

    const [approvedOrders, pendingOrders, manualEntries] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          status: 'ONAYLANDI',
          ...(from
            ? { OR: [{ approvedAt: { gte: from } }, { approvedAt: null, createdAt: { gte: from } }] }
            : {}),
        },
        select: { id: true, orderCode: true, totalPrice: true, currency: true, createdAt: true, approvedAt: true },
      }),
      this.prisma.order.findMany({
        where: { status: 'BEKLIYOR' },
        select: { totalPrice: true, currency: true },
      }),
      this.prisma.accountingEntry.findMany({
        where: from ? { createdAt: { gte: from } } : {},
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const orderIncome = (currency: Currency) =>
      sum(approvedOrders.filter((order) => (order.currency === 'USD' ? 'USD' : 'TRY') === currency).map((order) => order.totalPrice));
    const manual = (type: EntryType, currency: Currency) =>
      sum(manualEntries.filter((entry) => entry.type === type && entry.currency === currency).map((entry) => entry.amount));
    const pending = (currency: Currency) =>
      sum(pendingOrders.filter((order) => (order.currency === 'USD' ? 'USD' : 'TRY') === currency).map((order) => order.totalPrice));

    const approvedOrderIncome = orderIncome('TRY');
    const approvedOrderIncomeUSD = orderIncome('USD');
    const manualIncome = manual('INCOME', 'TRY');
    const manualIncomeUSD = manual('INCOME', 'USD');
    const totalExpense = manual('EXPENSE', 'TRY');
    const totalExpenseUSD = manual('EXPENSE', 'USD');

    const entries = [
      ...approvedOrders.map((order) => ({
        id: `order-${order.id}`,
        entryId: null as number | null,
        orderCode: order.orderCode as string | null,
        type: 'INCOME' as EntryType,
        source: 'ORDER' as const,
        amount: order.totalPrice,
        currency: order.currency === 'USD' ? 'USD' : 'TRY',
        description: `Onaylanan sipariş - ${order.orderCode}`,
        createdAt: order.approvedAt ?? order.createdAt,
      })),
      ...manualEntries.map((entry) => ({
        id: `manual-${entry.id}`,
        entryId: entry.id as number | null,
        orderCode: null as string | null,
        type: entry.type as EntryType,
        source: 'MANUAL' as const,
        amount: entry.amount,
        currency: entry.currency,
        description: entry.description,
        createdAt: entry.createdAt,
      })),
    ].sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime());

    return {
      period,
      periodStart: from,
      resetAt,
      totals: {
        approvedOrderIncome,
        approvedOrderIncomeUSD,
        manualIncome,
        manualIncomeUSD,
        totalIncome: sum([approvedOrderIncome, manualIncome]),
        totalIncomeUSD: sum([approvedOrderIncomeUSD, manualIncomeUSD]),
        totalExpense,
        totalExpenseUSD,
        balance: sum([approvedOrderIncome, manualIncome, -totalExpense]),
        balanceUSD: sum([approvedOrderIncomeUSD, manualIncomeUSD, -totalExpenseUSD]),
        approvedOrderCount: approvedOrders.length,
        pendingOrderCount: pendingOrders.length,
        pendingOrderAmount: pending('TRY'),
        pendingOrderAmountUSD: pending('USD'),
      },
      entries,
    };
  }

  async createEntry(data: EntryInput) {
    return this.prisma.accountingEntry.create({ data: this.validateEntry(data) });
  }

  async updateEntry(id: number, data: EntryInput) {
    await this.ensureEntryExists(id);
    return this.prisma.accountingEntry.update({ where: { id }, data: this.validateEntry(data) });
  }

  async deleteEntry(id: number) {
    await this.ensureEntryExists(id);
    await this.prisma.accountingEntry.delete({ where: { id } });
    return { success: true };
  }

  // Muhasebeyi sifirlar: hicbir kayit silinmez, yeni donem bu andan itibaren baslar.
  async reset(password?: string) {
    if (String(password ?? '').trim() !== RESET_PASSWORD) {
      throw new ForbiddenException('Şifre hatalı. Muhasebe sıfırlanmadı.');
    }
    const resetAt = new Date();
    await this.prisma.accountingSetting.upsert({
      where: { id: 1 },
      update: { resetAt },
      create: { id: 1, resetAt },
    });
    return { success: true, resetAt };
  }

  private async ensureEntryExists(id: number) {
    if (!Number.isInteger(id) || id <= 0) throw new NotFoundException('Muhasebe kaydı bulunamadı.');
    const entry = await this.prisma.accountingEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Muhasebe kaydı bulunamadı.');
    return entry;
  }
}
