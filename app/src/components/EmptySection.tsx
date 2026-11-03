import {Text,View} from 'react-native';
import ActionButton from './ActionButton';
import {colors} from '../ui/theme';
export default function EmptySection({title,detail,action,onAction}:{title:string;detail:string;action?:string;onAction?:()=>void}){
  return <View style={{padding:20,borderRadius:18,backgroundColor:colors.greenSoft,gap:12}}><Text style={{fontSize:20,lineHeight:27,fontWeight:'700',color:colors.ink}}>{title}</Text><Text style={{fontSize:14,lineHeight:22,color:colors.muted}}>{detail}</Text>{action&&onAction?<ActionButton title={action} onPress={onAction}/>:null}</View>;
}
