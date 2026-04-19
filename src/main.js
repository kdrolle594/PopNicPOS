import { createApp } from 'vue';
import { createAuth0 } from '@auth0/auth0-vue';
import App from './App.vue';
import './styles/index.css';

createApp(App)
  .use(
    createAuth0({
      domain: import.meta.env.VITE_AUTH0_DOMAIN,
      clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
      authorizationParams: {
        redirect_uri: window.location.origin + (import.meta.env.VITE_BASE_PATH || '/'),
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      },
    })
  )
  .mount('#app');
