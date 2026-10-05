# Swifta — konsept va kelishilgan qarorlar

Holat: **kelishilgan** (2026-10-03). Bu hujjat foydalanuvchi bilan kelishilgan arxitektura qarorlarini qayd etadi.
Yangi modul yozishdan oldin shu hujjatni o'qing. Asos: foydalanuvchining to'liq texnik topshirig'i (108 band).

## 1. Asosiy zanjirlar

- **Obyekt:** Mijoz → Obyekt → KP → Shartnoma → Smeta/BOM → Xarid → Ombor → Montaj → Test → Puskonaladka → Topshirish → Kafolat → Servis → Arxiv
- **Ichki ishchi kuchi:** Xodim → Guruh → Task → Ish sessiyasi → Bajarilgan hajm → Tekshiruv → KPI
- **Tashqi ijrochi:** Contractor → Tashqi task → Xarajat → Tasdiqlash → To'lov → Reyting

Eng muhim tamoyil: **haqiqiy bajarilgan hajm faqat ish sessiyasida bir marta yoziladi.** Xodim hissasi KPI uchun
alohida hisoblanadi va hech qachon hajmni xodimlar soniga ko'paytirmaydi.

## 2. Tomonlar va firmalar

- **Bizning firmalar** (yuridik shaxslar): bir nechta bo'lishi mumkin, rekvizitlari va QQS holati bilan.
  Har bir obyektda shartnomani qaysi firmamiz tuzgani tanlanadi.
- **Obyekt egasi** (masalan, BRB bank) va **Buyurtmachi / gen podryatchik** (masalan, X OOO — biz bilan shartnoma
  tuzgan va pul to'laydigan tomon). Ikkalasi Mijozlar bazasidan olinadi va bir xil bo'lishi mumkin.
  Debitorlik (mijoz qarzi) buyurtmachiga yoziladi.
- Mavjud obyektlarda hozirgi "Mijoz" maydoni buyurtmachi bo'ladi, obyekt egasi ham shu bilan to'ldiriladi.
- Obyekt darajasida alohida kontakt shaxs, telefon, email (obyektdagi vakil).

## 3. Obyekt statuslari

- Admin sozlaydigan ikki daraja: **guruh (A–H) → ichki status (A1, B3, …)**.
- Har bir guruhning o'zgarmas tizim kodi bor: `NEW, OFFER, CONTRACT, WORK, TESTING, LAUNCHED, DONE, SERVICE`.
  Kechikish, yakunlanish, kafolat kabi mantiq status nomiga emas, shu kodga bog'lanadi.
- Statusga majburiy hujjat sharti qo'yiladi (C — imzolangan shartnoma; G — dalolatnoma, to'lov tasdig'i, yakuniy hujjatlar).
- Shartnomadagi ish turlari (D) va test turlari (E) admin tomonidan sozlanadi.
- Hozirgi 18 bosqichdan ko'chirish (tarix bilan birga):

| Hozirgi bosqich | Yangi status |
|---|---|
| Yangi murojaat, Obyektni ko'rish | A1 Info yig'ilmoqda |
| Texnik topshiriq | A2 Loyiha chizmasi kutilmoqda |
| Hisob-kitob, Loyihalash | A3 KP tayyorlash kerak |
| Tijorat taklifi | B1 Zakazchik javobi kutilmoqda |
| Shartnoma | B5 Shartnoma imzolanishi kutilmoqda |
| Xarid | C2 Materiallarga zayavka berildi |
| Ombor, Yetkazib berish | D2 Materiallar yetkazildi |
| Montaj | D3 Montaj boshlandi |
| Ishga tushirish | D6 Puskonaladka yakunlandi |
| Sinov va sozlash | E2 Pusk bilan testlash |
| Topshirish | F2 Forma 1/2/3 |
| Yakuniy to'lov | F4 To'lov kutilmoqda |
| Kafolat | G1 Kafolat davri |
| Servis | H Servis |
| Yakunlangan | G Yakunlangan |

## 4. Moliya: Reja / Prognoz / Amalda

- Toifalar: Uskuna, Material, Ichki ishchi kuchi, Outsourcing, Subpudrat, Transport, Ombor, Boshqa; Daromad; Foyda.
- **Majburiyat** (xarid buyurtmalari, contractor kelishuvlari) saqlanadi — prognozning manbai.
- **Prognoz** = amalda + ochiq majburiyat + rejaning qolgan qismi (har toifa bo'yicha avtomatik).
  Qo'lda o'zgartirish faqat o'zgarish so'rovi (Change Request) orqali.
- **Ichki ishchi kuchi amalda** = sessiya soati × xodimning soatlik stavkasi (6-bo'lim).
- **Contractor xarajati** tasdiqlangan tashqi ishdan obyekt xarajatiga avtomatik tushadi.
- Outsourcing — tashqi usta/brigada (task bo'yicha); Subpudrat — ish hajmini shartnoma bilan olgan firma.
- Platforma **boshqaruv hisobi** uchun; rasmiy buxgalteriya (1C) o'rnini bosmaydi.
- Valyuta: asosiy UZS, yonida USD; har summada kurs, kurs sanasi va manbasi saqlanadi (amalda ishlaydi).

## 5. Xodimlar, guruhlar, tasklar, sessiyalar

- **Xodim** foydalanuvchidan alohida; login ixtiyoriy.
- **Guruh tarkibi** sana bilan saqlanadi (qachondan–qachongacha); tahrirlash tarixni o'chirmaydi.
- **Task:** joylashuv (qavat → zona → xona), ish turi (admin ro'yxati, birligi bilan), reja hajmi, og'irlik;
  rollar: mas'ul, ijrochi(lar), tekshiruvchi, tasdiqlovchi (bir odam bir nechta rolda bo'lishi mumkin).
  Ijrochi: xodim | guruh | contractor | aralash.
- **Task jarayoni:** New → Assigned → Accepted → In Progress → Completed → Inspection → Approved;
  rad etilsa: Rejected → Rework → In Progress → Completed → Reinspection → Approved. Har bir tekshiruv alohida yoziladi.
- **Sessiyani kim kiritadi:** taskda belgilangan kirituvchilar (odatda guruh lideri); task egasi, admin yoki menejer o'zgartiradi.
- **Ish sessiyasi:** task, guruh, sana, vaqt, haqiqiy hajm, foto, muammolar. A'zolar: soat va ulush — sessiya yopilganda muzlatiladi.
- **Ulush:** odatiy — teng bo'lish. Har bir ishchining **samaradorlik indeksi** yuritiladi:
  ish turi bo'yicha 1 kishi-soatga to'g'ri kelgan hajm ÷ kompaniya o'rtachasi (masalan 1,15 = o'rtachadan 15% yuqori).
  Ishchilar ro'yxatida ko'rinadi; kam sessiyada "ma'lumot yetarli emas" belgisi. Keyinroq "samaradorlik bo'yicha" ulush usuli.
- **Hissa** = hajm × ulush — faqat KPI uchun, obyekt hajmiga qo'shilmaydi.
- **Progress** hajm va task og'irligidan hisoblanadi, qo'lda yozilmaydi.

## 6. Ish haqi (faqat oylik maosh kiritiladi)

- Oyiga norma ish kunlari — sozlamada (masalan 22), xodimga alohida ham qo'yiladi; kunlik norma soat — 8.
- Kunlik stavka = oylik ÷ norma kunlar; soatlik = kunlik ÷ 8.
- Haqiqiy ishlangan kunlar sessiyalardan sanaladi.
- Sessiya ish haqi xarajati = soat × soatlik stavka → obyektning "ichki ishchi kuchi" xarajati.
- Oy yopilganda sessiyalarga taqsimlanmagan qism alohida "bekor vaqt / umumiy xarajat" bo'lib ko'rinadi.

## 7. Contractorlar

- Yetkazib beruvchidan alohida baza: telefon, ixtisos, ish turlari, hudud, holat (Available / Busy / Unavailable / Blacklisted), hujjatlar.
- Tashqi task: reja / kelishilgan / amalda / to'langan / qolgan; bajarilganini ichki xodim tasdiqlaydi; contractor tizimga kirmaydi.
- Rating va Reliability formulalari admin sozlamasida, faqat faktlardan hisoblanadi.
- Contractor tanlashda faktlar yonma-yon ko'rsatiladi; tizim "eng yaxshi" degan hukm chiqarmaydi.

## 8. KPI

- Formulalar versiyalanadi (komponentlar, og'irliklar, amal qilish davri), kodga yozilmaydi.
- Oy oxirida natija qayd etiladi (snapshot) va tasdiqlanadi; foizdan task va sessiyagacha ochib ko'rish mumkin.
- Bonus: Sozlamalar → Kompaniya'da shkala (KPI ball : maoshdan %), sukut bo'yicha o'chiq; xodimlar KPI oyi tasdiqlanganda qotiriladi, shu oy ish haqiga (umumiy xarajat sifatida) qo'shiladi.

## 9. Hujjatlar va chizmalar

- Fayllar: **Railway Bucket** (S3 ga mos). Hozircha Word, Excel, PDF, rasm. Versiyalar o'chirilmaydi;
  tur, MIME va hajm tekshiruvi; kirish huquqi nazorati.
- Chizmalar: PDF (pdf.js), zonalar sahifaga nisbiy koordinatada saqlanadi;
  yangi versiya yuklanganda bog'langan tasklar "qayta ko'rib chiqish kerak" holatiga o'tadi.
- DWG/RVT pullik xizmat (Autodesk APS / ODA) talab qiladi — keyinga qoldirilgan.

## 10. Demo ma'lumot

- Alohida **"Demo" ish maydoni** (alohida kompaniya), menyuda "Demo ↔ Asosiy" almashtirgich.
- Real ma'lumot bilan aralashmaydi, hisobotlarga ta'sir qilmaydi; bitta tugma bilan o'chiriladi.
- `DEMO_VERSION` (src/server/demo/generate.ts) oshirilsa, sayt ishga tushganda demo qayta yaratiladi (real ma'lumotga tegilmaydi).

## 11. Kiritilmaydi

- Internetsiz ishlash (hammasi onlayn).
- Uskunaga QR kod.

## 12. Ish qoidalari

- Saytga (Railway) **faqat foydalanuvchi "chiqar" deganidan keyin** chiqariladi; avval lokalda ko'rsatiladi.
- Real ma'lumot kiritilishidan oldin kunlik avtomatik zaxira nusxa (backup) sozlanadi.
- Mavjud ma'lumot yo'qolmaydigan, bosqichma-bosqich migratsiyalar.

## 13. Bosqichlar

| # | Nima kiradi | Holat |
|---|---|---|
| 0 | Xarid, ombor, yetkazib beruvchilar, material nazorati | Saytda |
| 1 | Asos: firmalar, obyekt egasi / buyurtmachi, A–H statuslar va majburiy hujjatlar, hujjatlar va versiyalar, reja/prognoz/amalda, davr filtrlari, rollar, demo ish maydoni, backup, testlar | Saytda |
| 2 | Ishchi kuchi: xodimlar, maosh, guruhlar va tarix, ish turlari, joylashuvlar, tasklar, sessiyalar, ulush, samaradorlik, kamchiliklar, Kanban, kalendar, davomat, oylik hisob, smeta importi (admin tasdig'i bilan), ishchi kabineti `/me` | Saytda |
| 3 | Contractorlar: baza, tashqi tasklar, tasdiqlash, to'lov, rating, reliability (og'irliklar Sozlamalar → Kompaniya'da) | Saytda |
| 4 | KPI: versiyalangan formulalar (xodim/guruh/contractor), oylik hisoblash va tasdiqlash, foizdan vazifagacha ochib ko'rish | Saytda |
| 5 | Chizmalar: PDF (pdf.js), nuqta/chiziq/to'rtburchak/ko'pburchak zonalar, ko'p taskka bog'lash, vizual holat va progress, chizmadagi kamchiliklar, versiyalar (zonalar ko'chiriladi + tekshirish) | Saytda |
| 6 | Servis va kafolat: shartnomalar (chastota, SLA, rejali tashriflar), murojaatlar (tashxis, yechim, ehtiyot qismlar, xarajat, hisob, rasmlar), SLA nazorati, kafolat muddatlari, P&L ga servis daromad/xarajatlari | Saytda |
| 7 | Hisobotlar (13 ta, filtrlar, Excel eksport), rollarga mos bosh sahifa bloklari | Saytda |

## 14. Foydalanuvchi javoblari (2026-10-03)

- **Server:** hozircha Railway'da qoladi (MVP, real shaxslar hali kiritilmaydi; xavfni foydalanuvchi o'z zimmasiga oldi).
- **Backup:** majburiy — har kuni avtomatik (pg_dump → Railway Bucket), admin sahifasidan yuklab olish va qo'lda yaratish.
- **Soliqlar hisobga olinadi:** har bir firmaning soliq rejimi — umumiy (QQS 12% + foyda solig'i 15%) yoki aylanma solig'i (masalan 4%).
  Summalar QQS bilan kiritiladi; foyda QQSsiz hisoblanadi. Ish haqida: maosh "qo'lga" kiritiladi, JShDS (12%) va ijtimoiy soliq (12%)
  qo'shilib ish beruvchi xarajati hisoblanadi. Barcha stavkalar sozlamada.
- **Oraliq dalolatnomalar va to'lov jadvali — ikkalasi ham yuritiladi.** Haqiqiy daromad = imzolangan dalolatnomalar;
  pul tushumi = to'lovlar.
- **Umumiy xarajatlar** alohida bo'lim; kompaniya sof foydasi = obyektlar foydasi − umumiy xarajatlar − foyda solig'i.
- **Xarajat/to'lov tasdiqlash:** sozlanadigan chegara (standart 10 mln so'm); undan yuqorisini "Tasdiqlash" huquqi bor odam tasdiqlaydi.
- **Oddiy ishchi tizimga kiradi:** "Boshladim", "necha foiz bajarildi", "Tugatdim", muammo, foto, izoh; lider kiritgan sessiyani tasdiqlaydi.
- **Ish kuni:** obyektdan tashqari kunlar ham ish kuni — sex, safar (yo'l), material yo'qligi, buyurtmachi sababli to'xtash va boshqa
  ishchiga bog'liq bo'lmagan sabablar. Faqat sababsiz kelmaslik, ta'til, kasallik ish kuni emas.
- **Material sarfini** guruh lideri kiritadi (task va sessiyaga bog'lanadi).
- **Sessiyani tasdiqlash:** progressda darhol; prorab/PM tasdiqlagach KPI va ish haqi xarajatiga.
- **Progress:** tasklarning smetadagi qiymati bo'yicha; qiymati yo'q taskka qo'lda og'irlik.
- **Smeta Excel'dan:** avtomatik import → admin tekshirib tasdiqlaydi → tasklar va BOM yaratiladi.
- **Rollar va huquqlarni admin o'zi sozlaydi.** PM — faqat o'z obyektlari; maoshni faqat ruxsati borlar ko'radi.
- **Kirish telefon raqami bilan:** admin telefon, bir martalik parol va rol beradi; birinchi kirishda xodim o'z parolini o'rnatadi.
- **Telegram bot:** Telegram guruhga qisqa hisobot — kim platformaga kirdi, nima qildi; masalan, "A guruhdagi B, C ishchilar X ishni
  tasdiqladi, D tasdiqlamadi".
- **Demo:** alohida "Demo" ish maydoni; real ma'lumot bilan aralashmaydi.
- **Saytga chiqarish:** foydalanuvchi ruxsat berdi — har bir tayyor bosqichdan keyin git + Railway.
