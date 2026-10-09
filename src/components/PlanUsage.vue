<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { supabase } from "@/lib/supabase";
import { formatBytes, formatPrice, usageRatio, type AccountUsage, type Plan } from "@/lib/plans";

const plans = ref<Plan[]>([]);
const usage = ref<AccountUsage | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  if (!supabase) return;
  const [plansResult, usageResult] = await Promise.all([
    supabase.from("plans").select("id, name, monthly_price_cents, per_user, max_boards, max_storage_bytes").eq("is_public", true).order("sort_order"),
    supabase.rpc("account_usage"),
  ]);
  if (plansResult.error || usageResult.error) {
    error.value = "Impossible de charger votre abonnement.";
    return;
  }
  plans.value = plansResult.data as Plan[];
  usage.value = usageResult.data as AccountUsage;
});

function gaugeClass(ratio: number) {
  return ratio >= 1 ? "progress-error" : ratio >= 0.8 ? "progress-warning" : "progress-primary";
}
</script>

<template>
  <section class="space-y-4">
    <div v-if="error" role="alert" class="alert alert-error text-sm">{{ error }}</div>
    <div v-if="usage" class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm">
      <p class="text-xs font-bold uppercase tracking-wide text-base-content/45">Plan actuel</p>
      <h2 class="mt-1 text-2xl font-black">{{ usage.plan_name }}</h2>
      <div class="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <div class="flex justify-between text-sm"><span class="font-semibold">Boards</span><span>{{ usage.boards }} / {{ usage.max_boards ?? "illimité" }}</span></div>
          <progress class="progress mt-2 w-full" :class="gaugeClass(usageRatio(usage.boards, usage.max_boards))" :value="usageRatio(usage.boards, usage.max_boards) * 100" max="100" aria-label="Boards utilisés" />
        </div>
        <div>
          <div class="flex justify-between text-sm"><span class="font-semibold">Stockage d’images</span><span>{{ formatBytes(usage.storage_bytes) }} / {{ usage.max_storage_bytes === null ? "illimité" : formatBytes(usage.max_storage_bytes) }}</span></div>
          <progress class="progress mt-2 w-full" :class="gaugeClass(usageRatio(usage.storage_bytes, usage.max_storage_bytes))" :value="usageRatio(usage.storage_bytes, usage.max_storage_bytes) * 100" max="100" aria-label="Stockage utilisé" />
        </div>
      </div>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <article v-for="plan in plans" :key="plan.id" class="rounded-2xl border bg-base-100 p-6 shadow-sm" :class="plan.id === usage?.plan_id ? 'border-primary' : 'border-base-300'">
        <div class="flex items-baseline justify-between gap-3">
          <h3 class="text-lg font-black">{{ plan.name }}</h3>
          <span v-if="plan.id === usage?.plan_id" class="badge badge-primary badge-sm">Votre plan</span>
        </div>
        <p class="mt-1 text-xl font-black">{{ formatPrice(plan) }}</p>
        <ul class="mt-4 space-y-1 text-sm text-base-content/70">
          <li>{{ plan.max_boards === null ? "Boards illimités" : `${plan.max_boards} boards` }}</li>
          <li>{{ plan.max_storage_bytes === null ? "Stockage illimité" : `${formatBytes(plan.max_storage_bytes)} de stockage d’images` }}</li>
        </ul>
        <p v-if="plan.monthly_price_cents && plan.id !== usage?.plan_id" class="mt-4 text-xs text-base-content/50">Abonnement bientôt disponible.</p>
      </article>
    </div>
  </section>
</template>
