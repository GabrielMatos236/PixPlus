  import { defineConfig } from 'vite'
  import react from '@vitejs/plugin-react'

  // O navegador fala só com o Vite (5173) e ele repassa as chamadas pro nginx.
  // Assim, pro navegador é tudo a mesma origem, e o CORS não atrapalha.
  const nginx = 'http://localhost'

  export default defineConfig({
    plugins: [react()],
    server: {
      proxy: {
        '/auth': nginx,
        '/contas': nginx,
        '/transferencias': nginx,
        '/notificacoes': nginx,
      },
    },
  })