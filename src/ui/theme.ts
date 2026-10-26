import { useFonts } from 'expo-font';
import { Cinzel_600SemiBold, Cinzel_700Bold, Cinzel_900Black } from '@expo-google-fonts/cinzel';
import { Rajdhani_500Medium, Rajdhani_600SemiBold, Rajdhani_700Bold } from '@expo-google-fonts/rajdhani';

/** Menu / interface look: carved slate, cold cyan sonar light, warm gold accents. */
export const UI = {
  font: {
    title: 'Cinzel_900Black',
    heading: 'Cinzel_700Bold',
    label: 'Cinzel_600SemiBold',
    tech: 'Rajdhani_600SemiBold',
    techBold: 'Rajdhani_700Bold',
    body: 'Rajdhani_500Medium',
  },
  color: {
    ink: '#04070A',
    stoneTop: '#2A323D',
    stoneBottom: '#12161C',
    stoneEdge: '#4A5563',
    stoneEdgeDark: '#07090C',
    cyan: '#4DF0FF',
    cyanSoft: '#9AF6FF',
    cyanDeep: '#0A3E4C',
    gold: '#FFC24A',
    ember: '#FFA726',
    red: '#FF3B4E',
    text: '#E1EAF2',
    textDim: '#8FA0B2',
    textFaint: '#5A6878',
  },
};

/** Loads the interface fonts. Returns true once they are ready. */
export function useAppFonts() {
  const [loaded, error] = useFonts({
    Cinzel_600SemiBold,
    Cinzel_700Bold,
    Cinzel_900Black,
    Rajdhani_500Medium,
    Rajdhani_600SemiBold,
    Rajdhani_700Bold,
  });
  // never block the app forever if a font fails to load — fall back to system fonts
  return loaded || !!error;
}
