import React from 'react';
import { View, StyleSheet, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { UI } from './theme';

const BG = require('../../assets/images/home-bg.jpg');
const { width: SW, height: SH } = Dimensions.get('window');

/** The cave artwork as a backdrop. `dim` darkens + blurs it for content-heavy screens. */
export const MenuBackground: React.FC<{ dim?: boolean }> = ({ dim }) => {
  const size = Math.max(SW * 1.25, SH * 0.64);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: UI.color.ink }]} />
      {dim ? (
        <Image source={BG} blurRadius={8} style={{ position: 'absolute', width: SH, height: SH, left: (SW - SH) / 2, top: 0, opacity: 0.45 }} />
      ) : (
        <Image source={BG} style={{ position: 'absolute', width: size, height: size, left: (SW - size) / 2, top: SH * 0.04 }} />
      )}
      <LinearGradient colors={['rgba(4,7,10,0.85)', 'rgba(4,7,10,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: SH * 0.22 }} />
      <LinearGradient
        colors={dim ? ['rgba(4,7,10,0.55)', 'rgba(4,7,10,0.92)'] : ['rgba(4,7,10,0)', 'rgba(4,7,10,0.88)', UI.color.ink]}
        locations={dim ? [0, 1] : [0, 0.45, 1]}
        style={{ position: 'absolute', left: 0, right: 0, top: dim ? 0 : SH * 0.42, bottom: 0 }}
      />
      {/* edge vignette */}
      <LinearGradient colors={['rgba(4,7,10,0.7)', 'rgba(4,7,10,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: SW * 0.14 }} />
      <LinearGradient colors={['rgba(4,7,10,0)', 'rgba(4,7,10,0.7)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: SW * 0.14 }} />
    </View>
  );
};
