import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../ui/theme';

export default function TextAction({label,onPress,disabled=false,primary=false}:{label:string;onPress:()=>void;disabled?:boolean;primary?:boolean}){
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.action,primary&&styles.primary,disabled&&styles.disabled]}><Text style={[styles.label,primary&&styles.primaryLabel]}>{label}</Text></Pressable>;
}

const styles=StyleSheet.create({action:{alignSelf:'flex-start',minHeight:48,justifyContent:'center',paddingHorizontal:4,paddingVertical:10},label:{fontSize:15,lineHeight:21,fontWeight:'600',color:colors.ink},primary:{backgroundColor:colors.ink,borderRadius:12,paddingHorizontal:20},primaryLabel:{color:colors.onInk},disabled:{opacity:.45}});
