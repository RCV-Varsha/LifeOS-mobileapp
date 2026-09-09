import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../ui/theme';

export default function TextAction({label,onPress,disabled=false,primary=false}:{label:string;onPress:()=>void;disabled?:boolean;primary?:boolean}){
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.action,primary&&styles.primary,disabled&&styles.disabled]}><Text style={[styles.label,primary&&styles.primaryLabel]}>{label}</Text></Pressable>;
}

const styles=StyleSheet.create({action:{alignSelf:'flex-start',minHeight:44,justifyContent:'center',paddingHorizontal:2},label:{fontWeight:'700',color:colors.green},primary:{backgroundColor:'#2f4939',borderRadius:8,paddingHorizontal:16},primaryLabel:{color:colors.paperRaised},disabled:{opacity:.45}});
