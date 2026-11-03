import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../ui/theme';

export type PrimaryDestination='now'|'workspace'|'planner'|'knowledge'|'assistant';

export default function PrimaryNavigation({active,onSelect}:{active:PrimaryDestination;onSelect:(destination:PrimaryDestination)=>void}){
  const labels={now:'Home',workspace:'Workspace',planner:'Planner',knowledge:'Knowledge',assistant:'Assistant'};
  const icons={now:'◉',workspace:'▤',planner:'▦',knowledge:'◇',assistant:'✧'};
  return <SafeAreaView edges={['bottom','left','right']} style={styles.bar}>{(['now','workspace','planner','knowledge','assistant'] as const).map((destination)=><Pressable key={destination} accessibilityRole="tab" accessibilityState={{selected:active===destination}} onPress={()=>onSelect(destination)} style={({pressed})=>[styles.item,pressed&&{opacity:0.7}]}><View style={[styles.marker,active===destination&&styles.activeMarker]}><Text accessible={false} style={[styles.icon,active===destination&&styles.activeIcon]}>{icons[destination]}</Text></View><Text style={[styles.label,active===destination&&styles.active]}>{labels[destination]}</Text></Pressable>)}</SafeAreaView>;
}

const styles=StyleSheet.create({bar:{flexDirection:'row',backgroundColor:colors.paperRaised,borderTopWidth:1,borderTopColor:colors.line,paddingBottom:6,paddingTop:8},item:{flex:1,alignItems:'center',gap:4,paddingVertical:4,minHeight:64},label:{fontSize:12,fontWeight:'600',color:colors.muted},active:{color:colors.green},marker:{width:48,height:30,borderRadius:16,alignItems:'center',justifyContent:'center'},activeMarker:{backgroundColor:colors.greenSoft,borderRadius:16,overflow:'hidden'},icon:{fontSize:24,lineHeight:28,color:colors.muted},activeIcon:{color:colors.green}});
