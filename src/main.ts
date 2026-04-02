import './style.css';
import { App } from './app/App';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('App root element "#app" was not found.');
}

const app = new App(root);
app.mount();
