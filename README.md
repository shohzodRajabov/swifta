# Swifta

HVAC kompaniyasi uchun ERP + loyiha boshqaruvi + CRM platformasi
(ventilyatsiya, konditsioner, VRF, chiller, AHU).

- Production: https://swifta.uz (Railway)
- Stack: Next.js 16, TypeScript, Prisma 6, PostgreSQL 16, Tailwind 4, next-intl (uz, uz-Cyrl, ru, en)

## Lokal ishga tushirish

Talablar: Node 20+, pnpm 9 (`corepack enable`), Docker Desktop.

```bash
pnpm local
```

Bu buyruq: Postgres konteynerini (port 5435) ishga tushiradi, migratsiyalarni qo'llaydi,
admin va kategoriyalarni yaratadi, birinchi marta demo ma'lumot yuklaydi va
`http://localhost:3000` da dev serverni ochadi.

Lokal kirish: `admin@swifta.uz` / `admin12345` (faqat lokal baza uchun).
Demo foydalanuvchilar (pm1@demo.uz, buh@demo.uz, ...) paroli: `demo12345`.

## Foydali buyruqlar

| Buyruq | Vazifasi |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm typecheck` / `pnpm lint` | Tekshiruvlar |
| `pnpm prisma migrate dev --name <nom>` | Yangi migratsiya |
| `pnpm db:seed` | Admin + kategoriyalar (idempotent) |
| `pnpm db:demo` | Demo ma'lumotlar (faqat lokal) |
| `pnpm i18n:cyrl` | `uz.json` dan o'zbek kirill tarjimasini generatsiya qilish |
| `pnpm i18n:check` | Barcha tillarda kalitlar bir xilligini tekshirish |

## Deploy

Railway (`railway up --service web`). Konteyner ishga tushganda migratsiyalar va seed avtomatik bajariladi.
Kerakli o'zgaruvchilar: `DATABASE_URL`, `AUTH_SECRET`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`.
