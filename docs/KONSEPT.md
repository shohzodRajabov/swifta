# Swifta — konsept va kelishilgan qarorlar

Holat: **muhokamada** (2026-10-03). Bu hujjat foydalanuvchi bilan kelishilgan arxitektura qarorlarini qayd etadi.
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
- Bonus keyinroq.

## 9. Hujjatlar va chizmalar

- Fayllar: **Railway Bucket** (S3 ga mos). Hozircha Word, Excel, PDF, rasm. Versiyalar o'chirilmaydi;
  tur, MIME va hajm tekshiruvi; kirish huquqi nazorati.
- Chizmalar: PDF (pdf.js), zonalar sahifaga nisbiy koordinatada saqlanadi;
  yangi versiya yuklanganda bog'langan tasklar "qayta ko'rib chiqish kerak" holatiga o'tadi.
- DWG/RVT pullik xizmat (Autodesk APS / ODA) talab qiladi — keyinga qoldirilgan.

## 10. Demo ma'lumot

- Alohida **"Demo" ish maydoni** (alohida kompaniya), menyuda "Demo ↔ Asosiy" almashtirgich.
- Real ma'lumot bilan aralashmaydi, hisobotlarga ta'sir qilmaydi; bitta tugma bilan o'chiriladi.

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
| 1 | Asos: firmalar, obyekt egasi / buyurtmachi, A–H statuslar va majburiy hujjatlar, hujjatlar va versiyalar, reja/prognoz/amalda, davr filtrlari, rollar, demo ish maydoni, backup, testlar | Kutilmoqda |
| 2 | Ishchi kuchi: xodimlar, maosh, guruhlar va tarix, ish turlari, joylashuvlar, tasklar, sessiyalar, ulush, samaradorlik, kamchiliklar, Kanban, kalendar | |
| 3 | Contractorlar: baza, tashqi tasklar, tasdiqlash, to'lov, rating, reliability | |
| 4 | KPI: formulalar, oylik natijalar, ochib ko'rish | |
| 5 | Chizmalar: PDF, zonalar, taskga bog'lash, vizual progress, chizmadagi kamchiliklar | |
| 6 | Servis va kafolat: shartnoma, SLA, murojaatlar | |
| 7 | Hisobotlar, rollarga mos bosh sahifalar, eksport | |

## 14. Ochiq savollar (foydalanuvchi javobi kutilmoqda; javob bo'lmasa tavsiya qo'llanadi)

**Server joylashuvi.** Xodimlar va contractorlarning shaxsiy ma'lumotlari saqlanadi; qonun bo'yicha (Shaxsiy ma'lumotlar
to'g'risida, 27¹-modda) O'zbekiston fuqarolarining shaxsiy ma'lumotlari O'zbekistondagi serverda saqlanishi talab qilinadi.
Tavsiya: real xodim ma'lumotlarini kiritishdan oldin bazani O'zbekistondagi serverga ko'chirish (yurist bilan tasdiqlash).

1. QQS — firmalar QQS to'lovchimi? *Tavsiya:* firmaga "QQS to'lovchi" belgisi; summalar QQS bilan, foyda QQSsiz.
2. Oraliq dalolatnomalar (Forma 2/3) ish davomida ham tuziladimi? *Tavsiya:* dalolatnoma — bajarilgan ish, to'lov — kelgan pul; ikkalasi yuritiladi.
3. Umumiy (obyektga bog'lanmagan) xarajatlar? *Tavsiya:* alohida bo'lim; sof foyda = obyektlar foydasi − umumiy xarajatlar.
4. Xarajat/to'lovni tasdiqlash? *Tavsiya:* sozlanadigan chegara (masalan, 10 mln so'mdan yuqorisini direktor tasdiqlaydi).
5. Oddiy ishchi tizimga kiradimi? *Tavsiya:* login ixtiyoriy; faqat o'z tasklari va KPI'sini ko'radi.
6. Sessiyani tasdiqlash? *Tavsiya:* progressda darhol; prorab/PM tasdiqlagach KPI va ish haqi xarajatiga.
7. Obyektdan tashqari ish kunlari (ombor, yo'l, ofis)? *Tavsiya:* tasksiz "umumiy ish" sessiyasi.
8. Material sarfini kim kiritadi? *Tavsiya:* lider sessiyada (ixtiyoriy) yoki prorab; task va sessiyaga bog'lanadi.
9. Obyekt progressi? *Tavsiya:* tasklarning smetadagi qiymati bo'yicha; qiymati yo'q taskka qo'lda og'irlik.
10. Smetani Excel'dan import qilib, tasklar va BOM yaratish? *Tavsiya:* ha.
11. Rollar? *Tavsiya:* admin sozlaydi; PM faqat o'z obyektlarini ko'radi; maoshni faqat admin, direktor, buxgalter ko'radi.
12. Telefon raqami bilan kirish? *Tavsiya:* telefon yoki email + parol; parolni admin tiklaydi.
13. Telegram? *Tavsiya:* bildirishnomalar Telegram bot orqali ham; keyinroq sessiyani bot orqali kiritish.
