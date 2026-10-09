export type Plan = {
  id: string;
  name: string;
  monthly_price_cents: number;
  per_user: boolean;
  max_boards: number | null;
  max_storage_bytes: number | null;
};

export type AccountUsage = {
  plan_id: string;
  plan_name: string;
  boards: number;
  max_boards: number | null;
  storage_bytes: number;
  max_storage_bytes: number | null;
};

const units = ["o", "Kio", "Mio", "Gio", "Tio"];

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toLocaleString("fr-FR", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

export function formatPrice(plan: Pick<Plan, "monthly_price_cents" | "per_user">): string {
  if (!plan.monthly_price_cents) return "Gratuit";
  const price = (plan.monthly_price_cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: plan.monthly_price_cents % 100 ? 2 : 0 });
  return `${price} / ${plan.per_user ? "utilisateur / " : ""}mois`;
}

/** Share of a limit in use, from 0 to 1; null limits are unlimited. */
export function usageRatio(used: number, limit: number | null): number {
  if (limit === null) return 0;
  if (limit === 0) return 1;
  return Math.min(1, used / limit);
}
