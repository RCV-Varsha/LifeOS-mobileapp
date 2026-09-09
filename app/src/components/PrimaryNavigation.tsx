import { Pressable, StyleSheet, Text, View } from 'react-native';

export type PrimaryDestination='now'|'direction'|'you';

export default function PrimaryNavigation({active,onSelect}:{active:PrimaryDestination;onSelect:(destination:PrimaryDestination)=>void}){
  return <View style={styles.bar}>{(['now','direction','you'] as const).map((destination)=><Pressable key={destination} accessibilityRole="button" accessibilityState={{selected:active===destination}} onPress={()=>onSelect(destination)} style={styles.item}><Text style={[styles.label,active===destination&&styles.active]}>{destination.toUpperCase()}</Text><View style={[styles.marker,active===destination&&styles.activeMarker]}/></Pressable>)}</View>;
}

const styles=StyleSheet.create({bar:{flexDirection:'row',backgroundColor:'#f7f2e8',borderTopWidth:1,borderTopColor:'#ddd5c7',paddingBottom:14,paddingTop:10},item:{flex:1,alignItems:'center',gap:7,paddingVertical:5},label:{fontSize:12,fontWeight:'700',letterSpacing:1.2,color:'#81796d'},active:{color:'#243128'},marker:{width:24,height:2,borderRadius:2,backgroundColor:'transparent'},activeMarker:{backgroundColor:'#486553'}});
