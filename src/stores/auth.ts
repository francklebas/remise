import { defineStore } from "pinia";
import { ref } from "vue";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export const useAuthStore = defineStore("auth", () => {
  const session = ref<Session | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  const confirmationSent = ref(false);
  const notificationsEnabled = ref(false);
  let unsubscribe: (() => void) | undefined;

  async function initialize() {
    if (!supabase) {
      isLoading.value = false;
      return;
    }

    const { data, error: sessionError } = await supabase.auth.getSession();
    session.value = data.session;
    notificationsEnabled.value = Boolean(
      data.session?.user.user_metadata.notifications_enabled,
    );
    error.value = sessionError?.message ?? null;
    isLoading.value = false;

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        session.value = nextSession;
        notificationsEnabled.value = Boolean(
          nextSession?.user.user_metadata.notifications_enabled,
        );
        isLoading.value = false;
      },
    );
    unsubscribe = () => listener.subscription.unsubscribe();
  }

  async function signInWithPassword(
    email: string,
    password: string,
    captchaToken?: string,
  ) {
    if (!supabase) return;
    error.value = null;
    confirmationSent.value = false;
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        captchaToken,
      },
    });
    if (signInError) error.value = signInError.message;
  }

  async function signUp(
    email: string,
    password: string,
    captchaToken?: string,
  ) {
    if (!supabase) return;
    error.value = null;
    confirmationSent.value = false;
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        captchaToken,
      },
    });
    if (signUpError) error.value = signUpError.message;
    else confirmationSent.value = !data.session;
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

  return {
    session,
    isLoading,
    error,
    confirmationSent,
    notificationsEnabled,
    initialize,
    signInWithPassword,
    signUp,
    setNotificationsEnabled,
    signOut,
    dispose,
  };
});
