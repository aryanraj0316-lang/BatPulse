import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PALETTE } from '../constants/palette';
import { recordCrash } from '../diagnostics/crash';

interface Props {
  children: React.ReactNode;
  /** Called after the player taps Restart, before the tree is shown again (e.g. go back to the home screen). */
  onReset?: () => void;
  /** Writes progress to disk when something breaks. */
  flush?: () => Promise<void>;
}
interface State {
  failed: boolean;
}

/** Last line of defence: a rendering error shows a calm recovery screen instead of a white screen. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    recordCrash(error, 'render', this.props.flush);
  }

  private reset = () => {
    this.props.onReset?.();
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.box} testID="crash-screen">
        <Text style={styles.title}>SIGNAL LOST</Text>
        <Text style={styles.msg}>Something went wrong. Your progress is saved.</Text>
        <TouchableOpacity style={styles.btn} onPress={this.reset} testID="crash-restart">
          <Text style={styles.btnText}>RESTART</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  box: { flex: 1, backgroundColor: PALETTE.voidBlack, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  title: { color: PALETTE.sonarCyan, fontSize: 22, fontWeight: '900', letterSpacing: 4 },
  msg: { color: '#94A3B8', fontSize: 12, textAlign: 'center' },
  btn: { marginTop: 10, paddingVertical: 13, paddingHorizontal: 36, borderRadius: 6, backgroundColor: PALETTE.sonarCyan },
  btnText: { color: '#04060A', fontWeight: '900', letterSpacing: 2 },
});
