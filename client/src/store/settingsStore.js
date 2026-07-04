import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyTheme } from '@/lib/theme';

const DEFAULT_NOTIFICATION_PREFERENCES = {
  workflowCompleted: true,
  workflowFailed: true,
  workflowStarted: true,
  browserNotifications: false,
  emailNotifications: false,
};

const useSettingsStore = create(
  persist(
    (set, get) => ({
      settings: {
        theme: 'dark',
        avatar: '',
        notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
      },
      integrations: [],
      health: null,
      apiKeys: [],
      encryption: null,
      loaded: false,

      setSettings: (settings) => {
        const next = {
          ...get().settings,
          ...settings,
          notificationPreferences: {
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            ...(settings?.notificationPreferences || get().settings.notificationPreferences || {}),
          },
        };
        applyTheme(next.theme);
        set({ settings: next, loaded: true });
      },
      setIntegrations: (integrations) => set({ integrations }),
      setHealth: (health) => set({ health }),
      setApiKeys: (apiKeys, encryption) => set({ apiKeys, encryption }),
      resetSettings: () => {
        applyTheme('dark');
        set({
          settings: {
            theme: 'dark',
            avatar: '',
            notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
          },
          integrations: [],
          health: null,
          apiKeys: [],
          encryption: null,
          loaded: false,
        });
      },
    }),
    {
      name: 'agentflow-settings',
      partialize: (state) => ({ settings: state.settings }),
      onRehydrateStorage: () => (state) => {
        if (state?.settings?.theme) applyTheme(state.settings.theme);
      },
    }
  )
);

export { DEFAULT_NOTIFICATION_PREFERENCES };
export default useSettingsStore;
