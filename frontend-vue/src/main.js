import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index.js';
import './assets/tokens.css';
import './assets/styles.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
