import { Buffer } from 'buffer';
if (typeof (globalThis as any).Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

import { registerRootComponent } from 'expo';

// Print the full stack of any crash to the Metro terminal (phones otherwise show only the message).
const EU = (globalThis as any).ErrorUtils;
if (EU?.getGlobalHandler) {
  const previous = EU.getGlobalHandler();
  EU.setGlobalHandler((error: any, isFatal?: boolean) => {
    console.error(`[BatPulse crash${isFatal ? ' (fatal)' : ''}] ${error?.message}
${error?.stack}`);
    previous(error, isFatal);
  });
}
// Resolves to bootstrap.web.ts on web (loads Skia's CanvasKit first) and bootstrap.ts on phones.
import { bootstrap } from './src/boot/bootstrap';

bootstrap(() => {
  registerRootComponent(require('./App').default);
});
