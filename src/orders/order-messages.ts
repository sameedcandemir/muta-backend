// Musterinin gorebilecegi siparis hata mesajlari; siparisin diline gore dondurulur.
export type OrderLanguage = 'tr' | 'en' | 'ar';

export const ORDER_LANGUAGES: OrderLanguage[] = ['tr', 'en', 'ar'];

export const LANGUAGE_NAMES_TR: Record<OrderLanguage, string> = {
  tr: 'Türkçe',
  en: 'İngilizce',
  ar: 'Arapça',
};

// Eski uygulamalar dil gondermez: Turkce kabul edilir (adres zorunlulugu korunur)
export const resolveOrderLanguage = (value: unknown): OrderLanguage =>
  ORDER_LANGUAGES.includes(value as OrderLanguage) ? (value as OrderLanguage) : 'tr';

const MESSAGES: Record<string, Record<OrderLanguage, string>> = {
  invalid_products: {
    tr: 'Sipariş için geçerli ürünler bulunamadı.',
    en: 'No valid products were found for this order.',
    ar: 'لم يتم العثور على منتجات صالحة لهذا الطلب.',
  },
  unavailable_product: {
    tr: 'Sepetinizde stokta olmayan veya silinmiş bir ürün var. Lütfen sepetinizi güncelleyin.',
    en: 'Your cart contains a product that is out of stock or no longer available. Please update your cart.',
    ar: 'تحتوي سلتك على منتج غير متوفر أو لم يعد موجودًا. يرجى تحديث سلتك.',
  },
  user_not_found: {
    tr: 'Kullanıcı bulunamadı. Lütfen tekrar giriş yapın.',
    en: 'User not found. Please log in again.',
    ar: 'لم يتم العثور على المستخدم. يرجى تسجيل الدخول مرة أخرى.',
  },
  invalid_items: {
    tr: 'Sipariş kalemlerinde geçersiz adet veya fiyat var.',
    en: 'The order contains an invalid quantity or price.',
    ar: 'يحتوي الطلب على كمية أو سعر غير صالح.',
  },
  stock_sold_out: {
    tr: '"{name}" ürününün stoğu tükendi. Lütfen sepetinizden çıkarın.',
    en: '"{name}" is sold out. Please remove it from your cart.',
    ar: 'نفد مخزون "{name}". يرجى إزالته من سلتك.',
  },
  stock_insufficient: {
    tr: '"{name}" için stokta {left} adet ({series} seri) kaldı. Lütfen daha az seri seçin.',
    en: 'Only {left} pieces ({series} series) of "{name}" are left in stock. Please choose fewer series.',
    ar: 'تبقى {left} قطعة ({series} سلسلة) فقط من "{name}". يرجى اختيار عدد أقل من السلاسل.',
  },
};

export const orderMessage = (key: keyof typeof MESSAGES, lang: OrderLanguage, params: Record<string, string | number> = {}) =>
  Object.entries(params).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    MESSAGES[key][lang] ?? MESSAGES[key].tr,
  );
