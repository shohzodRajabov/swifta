# Stage 2: encrypted backups, project scope, quantity guard, approved progress, overtime, passport
T = {
    "errors.qtyOverPlan": ("Hajm rejadagi qoldiqdan oshib ketdi (qolgan: {remaining} {unit}). Sababini yozing", "Объём превышает остаток по плану (осталось: {remaining} {unit}). Укажите причину", "Quantity exceeds the planned remainder ({remaining} {unit} left). State the reason"),
    "errors.tooManyHours": ("{name}: bir kunda {max} soatdan ko'p yozib bo'lmaydi (shu kunga allaqachon {already} soat yozilgan)", "{name}: нельзя записать больше {max} ч в день (уже записано {already} ч)", "{name}: no more than {max} h per day ({already} h already recorded)"),
    "errors.passportType": ("Pasport uchun faqat PDF yoki rasm (JPG, PNG, WEBP)", "Для паспорта только PDF или изображение (JPG, PNG, WEBP)", "Passport: PDF or image only (JPG, PNG, WEBP)"),
    "sessions.overReason": ("Rejadan oshish sababi", "Причина превышения плана", "Reason for exceeding the plan"),
    "sessions.overReasonHint": ("Rejada qolgan: {qty} {unit}. Masalan: smetada hajm kam ko'rsatilgan, qo'shimcha ish", "Осталось по плану: {qty} {unit}. Например: в смете занижен объём, доп. работы", "Planned remainder: {qty} {unit}. E.g. under-estimated quantity, extra work"),
    "tasks.pendingQty": ("Tasdiq kutmoqda", "Ожидает утверждения", "Pending approval"),
    "payroll.overtime": ("+ overtime {h} soat: {sum}", "+ сверхурочно {h} ч: {sum}", "+ overtime {h} h: {sum}"),
    "settings.company.overtimeMultiplier": ("Overtime koeffitsiyenti", "Коэффициент сверхурочных", "Overtime multiplier"),
    "settings.company.overtimeHint": ("Kunlik normadan ortiq soatlar shu koeffitsiyent bilan to'lanadi va obyektga yoziladi (masalan 1.5)", "Часы сверх дневной нормы оплачиваются и относятся на объект с этим коэффициентом (напр. 1.5)", "Hours above the daily norm are paid and charged with this multiplier (e.g. 1.5)"),
    "settings.company.maxDailyHours": ("Bir kunda maksimal soat", "Максимум часов в день", "Max hours per day"),
    "employees.passport": ("Pasport", "Паспорт", "Passport"),
    "employees.passportNumber": ("Pasport seriyasi va raqami", "Серия и номер паспорта", "Passport series and number"),
    "employees.passportHint": ("Pasport nusxasini (PDF yoki rasm) saqlangandan keyin xodim kartasida yuklaysiz", "Скан паспорта (PDF или фото) загружается в карточке после сохранения", "Upload the passport scan (PDF or image) on the employee card after saving"),
    "employees.passportPrivacy": ("Shaxsiy ma'lumot: faqat xodimlarni tahrirlash huquqi borlar ko'radi, har bir ochilish audit jurnalga yoziladi", "Персональные данные: видят только редакторы сотрудников, каждый просмотр пишется в журнал аудита", "Personal data: visible only to HR editors; every view is logged in the audit log"),
    "backups.encrypted": ("Backup'lar AES-256 bilan shifrlanadi. Yuklab olishda avtomatik ochiladi. Shifrlash kaliti (ENCRYPTION_KEY) Railway'da — uning nusxasini xavfsiz joyda saqlang", "Резервные копии шифруются AES-256 и расшифровываются при скачивании. Ключ (ENCRYPTION_KEY) хранится в Railway — сохраните его копию в надёжном месте", "Backups are AES-256 encrypted and decrypted on download. Keep a copy of the key (ENCRYPTION_KEY, in Railway) somewhere safe"),
    "backups.notEncrypted": ("Diqqat: shifrlash kaliti sozlanmagan — backup'lar shifrlanmagan holda saqlanadi", "Внимание: ключ шифрования не задан — копии хранятся незашифрованными", "Warning: no encryption key — backups are stored unencrypted"),
}
