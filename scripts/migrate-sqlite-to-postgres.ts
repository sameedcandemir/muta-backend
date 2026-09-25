// Eski yerel SQLite veritabanindaki (prisma/dev.db) tum kayitlari bulut PostgreSQL'e (DATABASE_URL) tasir.
// Kullanim: npm run migrate:sqlite-to-postgres
// Hedef veritabani bos degilse hicbir sey yazmadan durur (cift kayit olusmasin diye).
import 'dotenv/config';
import { createClient } from '@libsql/client';
import { PrismaClient } from '@prisma/client';

const SQLITE_PATH = process.env.SQLITE_PATH || 'prisma/dev.db';

const toDate = (value: unknown) => {
  if (value === null || value === undefined) return new Date();
  const asNumber = Number(value);
  return new Date(Number.isFinite(asNumber) ? asNumber : String(value));
};

async function main() {
  if (!process.env.DATABASE_URL?.startsWith('postgres')) {
    throw new Error('.env dosyasinda DATABASE_URL (postgresql://...) tanimli degil.');
  }

  const sqlite = createClient({ url: `file:${SQLITE_PATH}` });
  const prisma = new PrismaClient();

  const rows = async (table: string) => (await sqlite.execute(`SELECT * FROM "${table}"`)).rows as any[];
  const hasTable = async (table: string) =>
    (await sqlite.execute({ sql: `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, args: [table] })).rows.length > 0;

  const existing =
    (await prisma.product.count()) + (await prisma.user.count()) + (await prisma.order.count()) + (await prisma.category.count());
  if (existing > 0) {
    throw new Error('Hedef PostgreSQL veritabani bos degil; tasima iptal edildi.');
  }

  const products = await rows('Product');
  const colors = await rows('ProductColor');
  const users = await rows('User');
  const orders = await rows('Order');
  const orderItems = await rows('OrderItem');
  const categories = (await hasTable('Category')) ? await rows('Category') : [];
  const entries = (await hasTable('AccountingEntry')) ? await rows('AccountingEntry') : [];

  await prisma.$transaction(async (tx) => {
    await tx.user.createMany({
      data: users.map((u) => ({ id: Number(u.id), phone: String(u.phone), otpCode: u.otpCode ?? null, role: String(u.role), createdAt: toDate(u.createdAt) })),
    });
    await tx.product.createMany({
      data: products.map((p) => ({
        id: Number(p.id), productCode: String(p.productCode), name_tr: String(p.name_tr), name_en: String(p.name_en), name_ar: String(p.name_ar),
        priceUSD: Number(p.priceUSD), priceTRY: Number(p.priceTRY ?? 0), stockStatus: Number(p.stockStatus ?? 1),
        discountPercentage: Number(p.discountPercentage ?? 0), sizes: String(p.sizes ?? 'Seri 1'), category: String(p.category ?? 'Genel'),
        productType: String(p.productType ?? 'Giyim'), brand: String(p.brand ?? 'MUTΛ'), createdAt: toDate(p.createdAt),
      })),
    });
    await tx.productColor.createMany({
      data: colors.map((c) => ({
        id: Number(c.id), productId: Number(c.productId), colorName: String(c.colorName), colorHex: c.colorHex ?? null,
        image1: c.image1 ?? null, image2: c.image2 ?? null, image3: c.image3 ?? null, image4: c.image4 ?? null, image5: c.image5 ?? null,
      })),
    });
    await tx.order.createMany({
      data: orders.map((o) => ({
        id: Number(o.id), orderCode: String(o.orderCode), userId: Number(o.userId), totalPrice: Number(o.totalPrice),
        currency: String(o.currency ?? 'TRY'), status: String(o.status ?? 'BEKLIYOR'), createdAt: toDate(o.createdAt),
      })),
    });
    await tx.orderItem.createMany({
      data: orderItems.map((i) => ({
        id: Number(i.id), orderId: Number(i.orderId), productId: Number(i.productId), size: String(i.size), color: String(i.color),
        quantity: Number(i.quantity), unitPrice: Number(i.unitPrice),
      })),
    });
    await tx.category.createMany({
      data: categories.map((c) => ({ id: String(c.id), title: String(c.title), keyword: String(c.keyword), createdAt: toDate(c.createdAt) })),
    });
    await tx.accountingEntry.createMany({
      data: entries.map((e) => ({ id: Number(e.id), type: String(e.type), amount: Number(e.amount), description: String(e.description), createdAt: toDate(e.createdAt) })),
    });

    // Id'ler elle yazildigi icin otomatik artan sayaclari en buyuk id'nin sonrasina tasiyoruz.
    for (const table of ['User', 'Product', 'ProductColor', 'Order', 'OrderItem', 'AccountingEntry']) {
      await tx.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`,
      );
    }
  });

  console.log(
    `✅ Tasima tamamlandi: ${users.length} kullanici, ${products.length} urun, ${colors.length} renk, ` +
      `${orders.length} siparis, ${orderItems.length} siparis kalemi, ${categories.length} kategori, ${entries.length} muhasebe kaydi.`,
  );

  await prisma.$disconnect();
  sqlite.close();
}

main().catch((error) => {
  console.error('❌ Tasima hatasi:', error.message);
  process.exit(1);
});
