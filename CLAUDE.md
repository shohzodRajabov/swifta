# Swifta

HVAC kompaniyasi (ventilyatsiya, konditsioner, VRF, chiller, AHU) uchun ERP + loyiha boshqaruvi + CRM web-platformasi.
Joylashtiriladigan domen: https://swifta.uz/
Ishchi papka: /Users/shohzodrajabov/Documents/Swifta

## Asosiy oqim
Mijoz → Obyekt → Tijorat taklifi → Shartnoma → Loyiha → Smeta/BOM → Xarid → Ombor → Montaj → Xarajat → To'lov → Foyda → Hujjatlar → Kafolat/Servis

## Asosiy tamoyillar
- REJA / MAJBURIYAT / AMALDA qiymatlari hech qachon aralashtirilmaydi (materiallar, xarajat, tushum, ish kuchi, muddat).
- Har bir xarajat obyektga biriktiriladi.
- Shartnoma summasi va budjet faqat Change Request orqali o'zgaradi; barcha muhim o'zgarishlar audit logga yoziladi.
- 7 ta rol: Administrator, Loyiha rahbari, Sotuv menejeri, Muhandis, Ombor mudiri, Buxgalter, Montajchi.

## Holat
- Texnologiyalar va bosqichlar hali tasdiqlanmagan (taklif berilgan, foydalanuvchi javobi kutilmoqda).
- Interfeys tili: o'zbek (lotin).

## Qarorlar (2026-10-03)
- Stack: Next.js 16 (App Router, `src/proxy.ts`), TypeScript, Prisma 6 + PostgreSQL, Tailwind v4, next-intl (cookie, URL prefiksisiz).
- Server: Railway. Domen swifta.uz — Ahost.uz'da (DNS'ni foydalanuvchi ruxsati bilan sozlash; login foydalanuvchining o'zi).
- Asosiy valyuta UZS, yonida USD; har bir summa kurs, kurs sanasi va manbasi (CBU/MANUAL) bilan saqlanadi.
- Tillar: uz, uz-Cyrl (`pnpm tsx scripts/translit-uz.ts` bilan uz.json'dan generatsiya), ru, en.
- 10–30 foydalanuvchi, bitta kompaniya; multi-tenant tayyor (`companyId`).
- Lokal DB: docker `swifta-db`, port 5435.

## 1-bosqich holati
Tayyor: Prisma sxema + migratsiya, auth/rollar, FX (CBU), audit, metrics, i18n (4 til), UI primitivlar, Money komponenti, app shell, login, mijozlar moduli.
Qolgan: obyektlar (ro'yxat, yaratish, karta: timeline/BOM/budjet/to'lovlar/xarajatlar/tarix), katalog, moliya, foydalanuvchilar, audit sahifasi, dashboard, seed (admin + kategoriyalar), `money.bn/mn` tarjima kalitlari, typecheck/build, Railway deploy, swifta.uz DNS.
