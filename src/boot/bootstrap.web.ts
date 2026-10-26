import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

/** Web only: Skia runs on CanvasKit (public/canvaskit.wasm), which must load before the app mounts. */
export function bootstrap(start: () => void) {
  LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(start);
}
