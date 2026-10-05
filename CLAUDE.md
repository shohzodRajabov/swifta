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


## Qarorlar (2026-10-03)
- Stack: Next.js 16 (App Router, `src/proxy.ts`), TypeScript, Prisma 6 + PostgreSQL, Tailwind v4, next-intl (cookie, URL prefiksisiz).
- Server: Railway. Domen swifta.uz — Ahost.uz'da (DNS'ni foydalanuvchi ruxsati bilan sozlash; login foydalanuvchining o'zi).
- Asosiy valyuta UZS, yonida USD; har bir summa kurs, kurs sanasi va manbasi (CBU/MANUAL) bilan saqlanadi.
- Tillar: uz, uz-Cyrl (`pnpm tsx scripts/translit-uz.ts` bilan uz.json'dan generatsiya), ru, en.
- 10–30 foydalanuvchi, bitta kompaniya; multi-tenant tayyor (`companyId`).
- Lokal DB: docker `swifta-db`, port 5435.

## Konsept
Kelishilgan arxitektura va ochiq savollar: [docs/KONSEPT.md](docs/KONSEPT.md). Yangi modul yozishdan oldin o'qing.
Saytga (`railway up`) faqat foydalanuvchi aniq ruxsat bergandan keyin chiqariladi.

## Holat
Saytda (swifta.uz): obyektlar, mijozlar, katalog, moliya, xarid, ombor, yetkazib beruvchilar, material nazorati, bildirishnomalar; 1-bosqich (asos) va 2-bosqich (xodimlar, guruhlar, vazifalar, sessiyalar, kamchiliklar, davomat, oylik, smeta importi, /me); 3-bosqich (contractorlar, tashqi ishlar, rating/reliability); 4-bosqich (KPI).
Keyingi: 5-bosqich chizmalar, keyin servis, hisobotlar (docs/KONSEPT.md §13).
Demo ma'lumot o'zgarsa `DEMO_VERSION` (src/server/demo/generate.ts) ni oshiring — sayt demo'ni qayta yaratadi.
Lokal: `pnpm local` (yoki `pnpm dev --port 3100`); `pnpm db:seed`, `pnpm db:demo` (faqat lokal demo, parol demo12345).
Konteyner start: `prisma migrate deploy` → idempotent seed → `next start`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
