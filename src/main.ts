import './style.css';
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';

mount(App, { target: document.querySelector<HTMLDivElement>('#app')! });

registerSW({ immediate: true });

// Ask the browser not to evict our storage (cards live in IndexedDB).
navigator.storage?.persist?.();
