import { defineStore } from "pinia";
import { ref } from "vue";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { TERMS_VERSION } from "@/legal";
import { applyTheme, normalizeThemePreference, type ThemePreference } from "@/theme";

export const useAuthStore = defineStore("auth", () => {
  const session = ref<Session | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  const confirmationSent = ref(false);
  const accountDeleted = ref(false);
  const notificationsEnabled = ref(false);
  const themePreference = ref<ThemePreference>("system");
  let unsubscribe: (() => void) | undefined;
  let systemThemeQuery: MediaQueryList | undefined;
  let onSystemThemeChange: (() => void) | undefined;

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
    themePreference.value = normalizeThemePreference(
      data.session?.user.user_metadata.theme_preference,
    );
    applyTheme(themePreference.value);
    systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    onSystemThemeChange = () => {
      if (themePreference.value === "system") applyTheme("system");
    };
    systemThemeQuery.addEventListener("change", onSystemThemeChange);
    error.value = sessionError?.message ?? null;
    isLoading.value = false;

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        session.value = nextSession;
        notificationsEnabled.value = Boolean(
          nextSession?.user.user_metadata.notifications_enabled,
        );
        themePreference.value = normalizeThemePreference(
          nextSession?.user.user_metadata.theme_preference,
        );
        applyTheme(themePreference.value);
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
        data: { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() },
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

  async function deleteAccount(password: string) {
    if (!supabase || !session.value) return false;
    const { data, error: invokeError } = await supabase.functions.invoke("delete-account", { body: { password } });
    if (invokeError) {
      const details = await (invokeError as { context?: Response }).context?.json?.().catch(() => null);
      error.value = details?.error ?? "Suppression du compte impossible.";
      return false;
    }
    if (!(data as { deleted?: boolean } | null)?.deleted) {
      error.value = "Suppression du compte impossible.";
      return false;
    }
    error.value = null;
    accountDeleted.value = true;
    await supabase.auth.signOut({ scope: "local" });
    return true;
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

  async function setThemePreference(preference: ThemePreference) {
    const previousValue = themePreference.value;
    themePreference.value = preference;
    applyTheme(preference);
    if (!supabase || !session.value) return;
    const { data, error: updateError } = await supabase.auth.updateUser({
      data: { theme_preference: preference },
    });
    if (updateError) {
      themePreference.value = previousValue;
      applyTheme(previousValue);
      error.value = updateError.message;
    } else if (data.user) {
      session.value = { ...session.value, user: data.user };
      error.value = null;
    }
  }

  function dispose() {
    unsubscribe?.();
    if (systemThemeQuery && onSystemThemeChange)
      systemThemeQuery.removeEventListener("change", onSystemThemeChange);
  }

  return {
    session,
    isLoading,
    error,
    confirmationSent,
    accountDeleted,
    notificationsEnabled,
    themePreference,
    initialize,
    signInWithPassword,
    signUp,
    setNotificationsEnabled,
    setThemePreference,
    signOut,
    deleteAccount,
    dispose,
  };
});
