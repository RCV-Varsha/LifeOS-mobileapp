import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../ui/theme';

export type PrimaryDestination='now'|'direction'|'you';

export default function PrimaryNavigation({active,onSelect}:{active:PrimaryDestination;onSelect:(destination:PrimaryDestination)=>void}){
  return <View style={styles.bar}>{(['now','direction','you'] as const).map((destination)=><Pressable key={destination} accessibilityRole="button" accessibilityState={{selected:active===destination}} onPress={()=>onSelect(destination)} style={styles.item}><Text style={[styles.label,active===destination&&styles.active]}>{destination.toUpperCase()}</Text><View style={[styles.marker,active===destination&&styles.activeMarker]}/></Pressable>)}</View>;
}

const styles=StyleSheet.create({bar:{flexDirection:'row',backgroundColor:colors.paper,borderTopWidth:1,borderTopColor:colors.line,paddingBottom:14,paddingTop:10},item:{flex:1,alignItems:'center',gap:7,paddingVertical:5},label:{fontSize:12,fontWeight:'700',letterSpacing:1.2,color:colors.subtle},active:{color:colors.ink},marker:{width:24,height:2,borderRadius:2,backgroundColor:'transparent'},activeMarker:{backgroundColor:colors.green}});
