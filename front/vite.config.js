import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// O navegador fala só com o Vite (5173) e ele repassa as chamadas ao backend.
// Assim, pro navegador é tudo a mesma origem, e o CORS não atrapalha.
// Enquanto o nginx não está na main, o /auth vai direto na porta 3001 do Auth.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:3001',
    },
  },
})
