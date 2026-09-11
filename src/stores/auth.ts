import { defineStore } from "pinia";
import { ref } from "vue";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export const useAuthStore = defineStore("auth", () => {
  const session = ref<Session | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  const messageSent = ref(false);
  let unsubscribe: (() => void) | undefined;

  async function initialize() {
    if (!supabase) {
      isLoading.value = false;
      return;
    }

    const { data, error: sessionError } = await supabase.auth.getSession();
    session.value = data.session;
    error.value = sessionError?.message ?? null;
    isLoading.value = false;

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      session.value = nextSession;
      isLoading.value = false;
    });
    unsubscribe = () => listener.subscription.unsubscribe();
  }

  async function signInWithMagicLink(email: string) {
    if (!supabase) return;
    error.value = null;
    messageSent.value = false;
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (signInError) error.value = signInError.message;
    else messageSent.value = true;
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) error.value = signOutError.message;
  }

  function dispose() {
    unsubscribe?.();
  }

  return { session, isLoading, error, messageSent, initialize, signInWithMagicLink, signOut, dispose };
});
