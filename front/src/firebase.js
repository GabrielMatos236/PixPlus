import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

// sem o front/.env.local o SDK quebra ao iniciar; o 'sem-config' evita a tela em branco
// e o login mostra um erro legível em vez disso
const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'sem-config',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'zync-f802d.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'zync-f802d',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'sem-config',
})

export const auth = getAuth(app)