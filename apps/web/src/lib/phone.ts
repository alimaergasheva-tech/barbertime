export const UZ_PHONE_PREFIX = "+998";
export const UZ_LOCAL_DIGITS = 9;

/** Оставляет до 9 цифр национального номера, отбрасывая введённый код страны. */
export function normalizeLocalDigits(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length > UZ_LOCAL_DIGITS && digits.startsWith("998")) {
    digits = digits.slice(3);
  }
  return digits.slice(0, UZ_LOCAL_DIGITS);
}

/** 901234567 → «90 123-45-67» */
export function formatLocalPhone(digits: string): string {
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)];
  let result = parts[0];
  if (parts[1]) result += ` ${parts[1]}`;
  if (parts[2]) result += `-${parts[2]}`;
  if (parts[3]) result += `-${parts[3]}`;
  return result;
}

export function isValidLocalPhone(digits: string): boolean {
  return digits.length === UZ_LOCAL_DIGITS;
}

export function toE164(digits: string): string {
  return `${UZ_PHONE_PREFIX}${digits}`;
}
