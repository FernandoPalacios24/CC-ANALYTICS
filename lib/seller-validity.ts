export type SellerValidityRecord = {
  hire_date: string;
  inactive_effective_date?: string | null;
};

export function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const next = new Date(year, monthNumber, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  return { start, end };
}

export function sellerActiveOnDate<T extends SellerValidityRecord>(seller: T, date: string) {
  const day = date.slice(0, 10);
  if (!day || seller.hire_date > day) return false;
  return !seller.inactive_effective_date || seller.inactive_effective_date > day;
}

export function sellerActiveInMonth<T extends SellerValidityRecord>(seller: T, month: string) {
  const { start, end } = monthBounds(month);
  return seller.hire_date < end && (!seller.inactive_effective_date || seller.inactive_effective_date > start);
}

export function filterSellersForDate<T extends SellerValidityRecord>(sellers: T[], date: string) {
  return sellers.filter((seller) => sellerActiveOnDate(seller, date));
}

export function filterSellersForMonth<T extends SellerValidityRecord>(sellers: T[], month: string) {
  return sellers.filter((seller) => sellerActiveInMonth(seller, month));
}
