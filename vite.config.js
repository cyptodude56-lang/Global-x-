import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Global-x-/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard/index.html'),
        accounts: resolve(__dirname, 'accounts/index.html'),
        transfers: resolve(__dirname, 'transfers/index.html'),
        payments: resolve(__dirname, 'payments/index.html'),
        cards: resolve(__dirname, 'cards/index.html'),
        statements: resolve(__dirname, 'statements/index.html'),
        loans: resolve(__dirname, 'loans/index.html'),
        services: resolve(__dirname, 'services/index.html'),
        settings: resolve(__dirname, 'settings/index.html'),
        completeProfile: resolve(__dirname, 'onboarding/complete-profile/index.html'),
        confirmEmail: resolve(__dirname, 'onboarding/confirm-email/index.html'),
        kyc: resolve(__dirname, 'onboarding/kyc/index.html'),
        kycPlaceholder: resolve(__dirname, 'onboarding/kyc-placeholder/index.html'),
      },
    },
  },
})
