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
        dashboard: resolve(__dirname, 'dashboard/dashboard.html'),
        accounts: resolve(__dirname, 'accounts/accounts.html'),
        transfers: resolve(__dirname, 'transfers/transfers.html'),
        payments: resolve(__dirname, 'payments/payments.html'),
        cards: resolve(__dirname, 'cards/cards.html'),
        statements: resolve(__dirname, 'statements/statements.html'),
        loans: resolve(__dirname, 'loans/loans.html'),
        settings: resolve(__dirname, 'settings/settings.html'),
        completeProfile: resolve(__dirname, 'onboarding/complete-profile.html'),
        confirmEmail: resolve(__dirname, 'onboarding/confirm-email.html'),
        kyc: resolve(__dirname, 'onboarding/kyc.html'),
        kycPlaceholder: resolve(__dirname, 'onboarding/kyc-placeholder.html'),
      },
    },
  },
})