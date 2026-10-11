import { Buffer } from 'buffer';
if (typeof (globalThis as any).Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
