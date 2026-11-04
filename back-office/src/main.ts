import { addCollection } from '@iconify/vue';
import icons from './icons.json';
addCollection(icons);
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './styles.css';
createApp(App).use(createPinia()).use(router).mount('#app');
