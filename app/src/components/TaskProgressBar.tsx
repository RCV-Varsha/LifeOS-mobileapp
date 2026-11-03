import { useEffect,useRef,useState } from 'react';
import { AccessibilityInfo,Animated,StyleSheet,View } from 'react-native';
import { colors } from '../ui/theme';

export default function TaskProgressBar({completed,total}:{completed:number;total:number}){
  const percent=total?Math.min(100,Math.round(completed/total*100)):0;
  const value=useRef(new Animated.Value(percent)).current;
  const [reduceMotion,setReduceMotion]=useState(true);
  useEffect(()=>{let active=true;void AccessibilityInfo.isReduceMotionEnabled().then(enabled=>{if(active)setReduceMotion(enabled);});const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduceMotion);return()=>{active=false;listener.remove();};},[]);
  useEffect(()=>{const animation=Animated.timing(value,{toValue:percent,duration:reduceMotion?0:350,useNativeDriver:false});animation.start();return()=>animation.stop();},[percent,reduceMotion,value]);
  return <View accessibilityRole="progressbar" accessibilityLabel="Task completion" accessibilityValue={{min:0,max:100,now:percent,text:`${completed} of ${total} complete`}} style={styles.track}><Animated.View style={[styles.fill,{width:value.interpolate({inputRange:[0,100],outputRange:['0%','100%']})}]}/></View>;
}
const styles=StyleSheet.create({track:{height:8,borderRadius:4,overflow:'hidden',backgroundColor:colors.line},fill:{height:8,borderRadius:4,backgroundColor:colors.green}});
