import { defineStore } from "pinia";
import { ref } from "vue";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export const useAuthStore = defineStore("auth", () => {
  const session = ref<Session | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  const messageSent = ref(false);
  const notificationsEnabled = ref(false);
  let unsubscribe: (() => void) | undefined;

  async function initialize() {
    if (!supabase) {
      isLoading.value = false;
      return;
    }

    const { data, error: sessionError } = await supabase.auth.getSession();
    session.value = data.session;
    notificationsEnabled.value = Boolean(data.session?.user.user_metadata.notifications_enabled);
    error.value = sessionError?.message ?? null;
    isLoading.value = false;

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      session.value = nextSession;
      notificationsEnabled.value = Boolean(nextSession?.user.user_metadata.notifications_enabled);
      isLoading.value = false;
    });
    unsubscribe = () => listener.subscription.unsubscribe();
  }

  async function signInWithMagicLink(email: string, captchaToken?: string) {
    if (!supabase) return;
    error.value = null;
    messageSent.value = false;
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: import.meta.env.VITE_APP_URL || window.location.origin,
        captchaToken,
      },
    });
    if (signInError) error.value = signInError.message;
    else messageSent.value = true;
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) error.value = signOutError.message;
  }

  async function setNotificationsEnabled(enabled: boolean) {
    if (!supabase || !session.value) return;
    const previousValue = notificationsEnabled.value;
    notificationsEnabled.value = enabled;
    const { data, error: updateError } = await supabase.auth.updateUser({
      data: { notifications_enabled: enabled },
    });
    if (updateError) {
      notificationsEnabled.value = previousValue;
      error.value = updateError.message;
    } else if (data.user) {
      session.value = { ...session.value, user: data.user };
    }
  }

  function dispose() {
    unsubscribe?.();
  }

  return { session, isLoading, error, messageSent, notificationsEnabled, initialize, signInWithMagicLink, setNotificationsEnabled, signOut, dispose };
});
