/**
 * وحدة معالجة العملة والحسابات المالية بدقة السنتيم الصحيح (Zero-Floating-Point Math)
 * 1 دينار جزائري (DZD) = 100 سنتيم (Centimes)
 */

export function centsToDinar(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export function dinarToCents(dinar: number | string): number {
  const clean = typeof dinar === "string" ? dinar.replace(/[\s,]/g, "") : String(dinar);
  const parsed = parseFloat(clean);
  if (isNaN(parsed) || !isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function formatDZD(cents: number, includeCurrency = true): string {
  const dinars = cents / 100;
  const parts = dinars.toFixed(2).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const decPart = parts[1];
  const formatted = `${intPart},${decPart}`;
  return includeCurrency ? `${formatted} دج` : formatted;
}

export function formatDinarPlain(cents: number): string {
  return (cents / 100).toFixed(2);
}

// --- تحويل الأرقام إلى الحروف العربية (Tafqeet - تفقيط الأعداد) ---
const ARABIC_ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const ARABIC_TENS = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const ARABIC_HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function convertThreeDigitArabic(num: number): string {
  if (num === 0) return "";
  const h = Math.floor(num / 100);
  const remainder = num % 100;
  const t = Math.floor(remainder / 10);
  const o = remainder % 10;

  const parts: string[] = [];

  if (h > 0) {
    parts.push(ARABIC_HUNDREDS[h]);
  }

  if (remainder > 0) {
    if (remainder <= 10) {
      parts.push(ARABIC_ONES[remainder] || ARABIC_TENS[1]);
    } else if (remainder === 11) {
      parts.push("أحد عشر");
    } else if (remainder === 12) {
      parts.push("اثنا عشر");
    } else if (remainder < 20) {
      parts.push(`${ARABIC_ONES[o]} عشر`);
    } else {
      if (o > 0) {
        parts.push(`${ARABIC_ONES[o]} و${ARABIC_TENS[t]}`);
      } else {
        parts.push(ARABIC_TENS[t]);
      }
    }
  }

  return parts.join(" و");
}

export function numberToArabicWords(cents: number): string {
  const dinars = Math.floor(cents / 100);
  const centimes = cents % 100;

  if (dinars === 0 && centimes === 0) return "صفر دينار جزائري";

  const billions = Math.floor(dinars / 1_000_000_000);
  const millions = Math.floor((dinars % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((dinars % 1_000_000) / 1000);
  const remainder = dinars % 1000;

  const chunks: string[] = [];

  if (billions > 0) {
    if (billions === 1) chunks.push("مليار");
    else if (billions === 2) chunks.push("ملياران");
    else if (billions >= 3 && billions <= 10) chunks.push(`${convertThreeDigitArabic(billions)} مليارات`);
    else chunks.push(`${convertThreeDigitArabic(billions)} مليار`);
  }

  if (millions > 0) {
    if (millions === 1) chunks.push("مليون");
    else if (millions === 2) chunks.push("مليونان");
    else if (millions >= 3 && millions <= 10) chunks.push(`${convertThreeDigitArabic(millions)} ملايين`);
    else chunks.push(`${convertThreeDigitArabic(millions)} مليون`);
  }

  if (thousands > 0) {
    if (thousands === 1) chunks.push("ألف");
    else if (thousands === 2) chunks.push("ألفان");
    else if (thousands >= 3 && thousands <= 10) chunks.push(`${convertThreeDigitArabic(thousands)} آلاف`);
    else chunks.push(`${convertThreeDigitArabic(thousands)} ألف`);
  }

  if (remainder > 0) {
    chunks.push(convertThreeDigitArabic(remainder));
  }

  let result = chunks.join(" و") + " دينار جزائري";

  if (centimes > 0) {
    result += ` و${convertThreeDigitArabic(centimes)} سنتيم`;
  } else {
    result += " تماماً";
  }

  return result;
}

// --- تحويل الأرقام إلى الحروف الفرنسية (Traduction en lettres - Dinar Algérien) ---
const FR_UNITS = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
const FR_TEENS = ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const FR_TENS = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante-dix", "quatre-vingts", "quatre-vingt-dix"];

function convertThreeDigitFrench(n: number): string {
  if (n === 0) return "";
  const h = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];

  if (h === 1) parts.push("cent");
  else if (h > 1) parts.push(`${FR_UNITS[h]} cent${rem === 0 ? "s" : ""}`);

  if (rem > 0) {
    if (rem < 10) {
      parts.push(FR_UNITS[rem]);
    } else if (rem < 20) {
      parts.push(FR_TEENS[rem - 10]);
    } else if (rem < 70) {
      const t = Math.floor(rem / 10);
      const u = rem % 10;
      if (u === 1 && t < 8) parts.push(`${FR_TENS[t]} et un`);
      else if (u > 0) parts.push(`${FR_TENS[t]}-${FR_UNITS[u]}`);
      else parts.push(FR_TENS[t]);
    } else if (rem < 80) {
      const u = rem - 60;
      if (u === 11) parts.push("soixante et onze");
      else parts.push(`soixante-${FR_TEENS[u - 10]}`);
    } else {
      const u = rem - 80;
      if (u === 0) parts.push("quatre-vingts");
      else if (u < 10) parts.push(`quatre-vingt-${FR_UNITS[u]}`);
      else parts.push(`quatre-vingt-${FR_TEENS[u - 10]}`);
    }
  }

  return parts.join(" ");
}

export function numberToFrenchWords(cents: number): string {
  const dinars = Math.floor(cents / 100);
  const centimes = cents % 100;

  if (dinars === 0 && centimes === 0) return "zéro dinar algérien";

  const billions = Math.floor(dinars / 1_000_000_000);
  const millions = Math.floor((dinars % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((dinars % 1_000_000) / 1000);
  const remainder = dinars % 1000;

  const parts: string[] = [];

  if (billions > 0) {
    parts.push(billions === 1 ? "un milliard" : `${convertThreeDigitFrench(billions)} milliards`);
  }
  if (millions > 0) {
    parts.push(millions === 1 ? "un million" : `${convertThreeDigitFrench(millions)} millions`);
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? "mille" : `${convertThreeDigitFrench(thousands)} mille`);
  }
  if (remainder > 0) {
    parts.push(convertThreeDigitFrench(remainder));
  }

  let text = parts.join(" ") + (dinars > 1 ? " dinars algériens" : " dinar algérien");

  if (centimes > 0) {
    text += ` et ${convertThreeDigitFrench(centimes)} centimes`;
  } else {
    text += " (net)";
  }

  // Capitalize first letter
  return text.charAt(0).toUpperCase() + text.slice(1);
}
